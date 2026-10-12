"""Render driver for generated videos. Runs inside the E2B sandbox.

    python eduvids_render.py '<json config>'

1. Prefetch. Narration audio is fetched concurrently (network bound) while
   every literal formula in the script is compiled in batched XeLaTeX runs,
   one per CPU (paying TeX's ~1.3s start-up once per batch instead of once
   per formula). Both fill the same caches Manim reads, so the render itself
   only waits on drawing. Anything missed here is simply produced on demand.
2. Render. Scenes are split across parallel Manim processes, balanced by
   narration length, each with its own media directory. A process killed by
   the OS (memory) is retried alone; a script error is reported as-is so the
   workflow can repair the script.

Config: {"script", "scenes", "media_dir", "manim_args", "prefetch_dir"}.
"""

import ast
import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# 1080p Cairo arrays, vignette buffers, 48x48 surfaces and encoder buffers.
# The old 720p allowance oversubscribed small sandboxes at the new quality.
MB_PER_RENDER = 768
DIGITS = list("0123456789") + ["-", ".", ","]
LABEL_METHODS = {"get_graph_label", "get_axis_labels", "get_x_axis_label", "get_y_axis_label", "get_tex", "BraceLabel"}
TEX_CLASSES = {"MathTex", "Tex"}
TEX_KWARGS = {"substrings_to_isolate", "arg_separator", "tex_environment"}


def log(message):
    print(f"[eduvids-render] {message}", flush=True)


# ---------------------------------------------------------------------------
# Script analysis
# ---------------------------------------------------------------------------

def _string(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _call_name(node):
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def analyse(source, scenes):
    """Narration lines, literal formulas, and a cost weight per scene."""
    tree = ast.parse(source)
    narration, formulas = [], []
    weights = {name: 400 for name in scenes}
    for cls in tree.body:
        if not isinstance(cls, ast.ClassDef):
            continue
        for node in ast.walk(cls):
            if not isinstance(node, ast.Call):
                continue
            name = _call_name(node)
            if name == "voiceover":
                for keyword in node.keywords:
                    text = _string(keyword.value) if keyword.arg == "text" else None
                    if text:
                        narration.append(text)
                        if cls.name in weights:
                            weights[cls.name] += len(text)
            elif name in TEX_CLASSES:
                args = [_string(arg) for arg in node.args]
                if not args or any(arg is None for arg in args):
                    continue
                kwargs = {}
                for keyword in node.keywords:
                    if keyword.arg in TEX_KWARGS:
                        try:
                            kwargs[keyword.arg] = ast.literal_eval(keyword.value)
                        except ValueError:
                            pass
                    elif keyword.arg == "tex_to_color_map" and isinstance(keyword.value, ast.Dict):
                        keys = [_string(key) for key in keyword.value.keys]
                        if all(keys):
                            kwargs["tex_to_color_map"] = {key: "#FFFFFF" for key in keys}
                formulas.append((name, args, kwargs))
            elif name in LABEL_METHODS:
                values = [_string(arg) for arg in node.args]
                values += [_string(k.value) for k in node.keywords if k.arg in ("label", "x_label", "y_label", "text")]
                formulas.extend(("MathTex", [value], {}) for value in values if value)
    formulas.extend(("MathTex", [digit], {}) for digit in DIGITS)
    return narration, formulas, weights


# ---------------------------------------------------------------------------
# Prefetch: audio
# ---------------------------------------------------------------------------

def prefetch_audio(narration, directory, on_first):
    try:
        import eduvids_tts

        return eduvids_tts.prefetch(
            narration, directory, workers=min(12, max(1, len(narration))), on_first=on_first,
        )
    except Exception as error:  # the render fetches on demand instead
        log(f"audio prefetch skipped: {error}")
        on_first(None)
        return None


# ---------------------------------------------------------------------------
# Prefetch: formulas
# ---------------------------------------------------------------------------

DUMMY_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 10">'
    + "".join(f'<path d="M{i * 4} 0h2v2h-2z"/>' for i in range(96))
    + "</svg>"
)


def record_formulas(formulas, media_dir):
    """Construct each formula with compilation stubbed out, recording the
    exact (expression, environment) jobs Manim will request."""
    from manim import config
    from manim.utils import tex_file_writing
    import eduvids_style as style

    config.media_dir = str(media_dir)
    dummy = Path(tempfile.mkdtemp()) / "dummy.svg"
    dummy.write_text(DUMMY_SVG)
    jobs = {}

    def recorder(expression, environment=None, tex_template=None):
        if tex_template is style.HOUSE_TEX_TEMPLATE:
            tex_file = tex_file_writing.generate_tex_file(expression, environment, tex_template)
            jobs[str(tex_file)] = tex_file
        return dummy

    real = style._tex_to_svg_file
    style._tex_to_svg_file = recorder
    try:
        for name, args, kwargs in formulas:
            try:
                getattr(style, name)(*args, **kwargs)
            except Exception:
                pass
    finally:
        style._tex_to_svg_file = real
    return [path for path in jobs.values() if not path.with_suffix(".svg").exists()]


def _document_parts(tex_file):
    text = tex_file.read_text()
    head, rest = text.split(r"\begin{document}", 1)
    body = rest.rsplit(r"\end{document}", 1)[0]
    return head, body


def compile_batch(tex_files, work):
    """One XeLaTeX run for many formulas: each becomes a tightly cropped page."""
    head, _ = _document_parts(tex_files[0])
    head = re.sub(r"\\documentclass(\[[^\]]*\])?\{standalone\}",
                  r"\\documentclass{article}\n\\usepackage[active,tightpage]{preview}", head, count=1)
    pages = "\n".join(r"\begin{preview}" + _document_parts(f)[1] + r"\end{preview}" for f in tex_files)
    work.mkdir(parents=True, exist_ok=True)
    (work / "batch.tex").write_text(head + "\\begin{document}\n" + pages + "\n\\end{document}\n")
    run = subprocess.run(
        ["xelatex", "-no-pdf", "-interaction=batchmode", "-halt-on-error", "batch.tex"],
        cwd=work, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300,
    )
    log_text = (work / "batch.log").read_text(errors="replace") if (work / "batch.log").exists() else ""
    if run.returncode != 0 or "\n! " in log_text:
        return None
    subprocess.run(
        ["dvisvgm", "-n", "-v", "0", "-p", "1-", "-o", "page-%p.svg", "batch.xdv"],
        cwd=work, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300, check=True,
    )
    svgs = sorted(work.glob("page-*.svg"), key=lambda p: int(re.findall(r"\d+", p.stem)[-1]))
    return svgs if len(svgs) == len(tex_files) else None


def prefetch_formulas(formulas, media_dirs, workers):
    began = time.time()
    tex_files = record_formulas(formulas, media_dirs[0])
    log(f"recorded {len(tex_files)} formulas to compile in {time.time() - began:.1f}s")
    if not tex_files:
        return 0, 0
    chunks = [tex_files[i::workers] for i in range(workers) if tex_files[i::workers]]
    root = Path(tempfile.mkdtemp(prefix="eduvids-tex-"))
    compiled, fallback = {}, []
    with concurrent.futures.ThreadPoolExecutor(len(chunks)) as pool:
        results = pool.map(lambda pair: (pair[1], compile_batch(pair[1], root / str(pair[0]))), enumerate(chunks))
        for chunk, svgs in results:
            if svgs is None:
                fallback.extend(chunk)
            else:
                compiled.update(zip(chunk, svgs))

    if fallback:
        # A formula broke its batch: compile that batch one by one (in
        # parallel) through Manim itself, which handles its own failures.
        from manim.utils import tex_file_writing

        def single(tex_file):
            try:
                xdv = tex_file_writing.compile_tex(tex_file, "xelatex", ".xdv")
                return tex_file, tex_file_writing.convert_to_svg(xdv, ".xdv")
            except Exception:
                return tex_file, None

        with concurrent.futures.ThreadPoolExecutor(workers) as pool:
            for tex_file, svg in pool.map(single, fallback):
                if svg is not None:
                    compiled[tex_file] = Path(svg)

    for tex_file, svg in compiled.items():
        target = tex_file.with_suffix(".svg")
        if svg != target:
            shutil.copyfile(svg, target)
    # Every render process has its own media directory and cache.
    source_dir = media_dirs[0] / "Tex"
    for media in media_dirs[1:]:
        (media / "Tex").mkdir(parents=True, exist_ok=True)
        for svg in source_dir.glob("*.svg"):
            shutil.copyfile(svg, media / "Tex" / svg.name)
    return len(compiled), len(tex_files)


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------

def available_mb():
    try:
        with open("/proc/meminfo") as handle:
            for line in handle:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except OSError:
        pass
    return 1024


def balance(scenes, weights, workers):
    """Longest-first assignment, then each group keeps the script's order."""
    groups = [[] for _ in range(workers)]
    loads = [0] * workers
    for scene in sorted(scenes, key=lambda name: -weights.get(name, 0)):
        index = loads.index(min(loads))
        groups[index].append(scene)
        loads[index] += weights.get(scene, 0)
    order = {name: i for i, name in enumerate(scenes)}
    return [sorted(group, key=order.get) for group in groups if group]


def render(cfg, groups, media_dirs, env):
    procs = []
    for index, group in enumerate(groups):
        log_path = Path(cfg["media_dir"]) / f"render-{index}.log"
        handle = open(log_path, "w")
        command = ["manim", cfg["script"], *group, "--media_dir", str(media_dirs[index]), *cfg["manim_args"]]
        procs.append((group, media_dirs[index], log_path, handle, subprocess.Popen(command, stdout=handle, stderr=subprocess.STDOUT, env=env)))
    failures = []
    for group, media, log_path, handle, proc in procs:
        code = proc.wait()
        handle.close()
        if code != 0:
            failures.append((group, media, log_path, code))
    return failures


def tail(path, limit=5000):
    data = Path(path).read_bytes()
    return data[-limit:].decode("utf-8", errors="replace")


def main():
    cfg = json.loads(sys.argv[1])
    started = time.time()
    scenes = cfg["scenes"]
    media_root = Path(cfg["media_dir"])
    media_root.mkdir(parents=True, exist_ok=True)
    source = Path(cfg["script"]).read_text()
    try:
        narration, formulas, weights = analyse(source, scenes)
    except SyntaxError:
        narration, formulas, weights = [], [], {name: 1 for name in scenes}

    workers = max(1, min(os.cpu_count() or 1, len(scenes), available_mb() // MB_PER_RENDER))
    media_dirs = [media_root / f"p{index}" for index in range(workers)]
    for media in media_dirs:
        (media / "Tex").mkdir(parents=True, exist_ok=True)

    prefetch_dir = Path(cfg.get("prefetch_dir") or media_root / "audio-prefetch")
    prefetch_dir.mkdir(parents=True, exist_ok=True)
    # Import everything before starting threads: concurrent first imports of
    # overlapping packages deadlock on Python's module locks.
    sys.path.insert(0, "/home/user")
    for module in ("manim", "eduvids_style", "eduvids_tts"):
        try:
            __import__(module)
        except Exception as error:
            log(f"could not import {module}: {error}")
    first = concurrent.futures.Future()

    def on_first(provider):
        if not first.done():
            first.set_result(provider)

    pool = concurrent.futures.ThreadPoolExecutor(1)
    audio = pool.submit(prefetch_audio, narration, prefetch_dir, on_first)
    try:
        done, total = prefetch_formulas(formulas, media_dirs, workers)
        log(f"formulas precompiled: {done}/{total} at {time.time() - started:.1f}s")
    except Exception as error:
        log(f"formula prefetch skipped: {error}")
    # Rendering starts once the provider has answered; the remaining lines
    # keep downloading while scenes render and each waits only for its own.
    try:
        provider = first.result(timeout=90)
    except concurrent.futures.TimeoutError:
        provider = None
    log(f"rendering starts at {time.time() - started:.1f}s (audio provider: {provider})")

    env = dict(os.environ, EDUVIDS_TTS_PREFETCH_DIR=str(prefetch_dir))
    if provider:
        env["EDUVIDS_TTS_PROVIDER"] = provider
    groups = balance(scenes, weights, workers)
    log(f"rendering {len(scenes)} scenes in {len(groups)} processes: {groups}")
    failures = render(cfg, groups, media_dirs, env)
    audio.result()
    pool.shutdown()

    # Killed by the OS (negative code) rather than a script error: retry alone.
    killed = [failure for failure in failures if failure[3] < 0]
    if killed:
        log(f"retrying {len(killed)} killed render(s) one at a time")
        retry = []
        for group, media, _, _ in killed:
            retry += render(cfg, [group], [media], env)
        failures = [failure for failure in failures if failure[3] >= 0] + retry

    log(f"render finished in {time.time() - started:.1f}s")
    if failures:
        group, _, log_path, code = failures[0]
        print(f"Manim failed (exit {code}) rendering {group}:\n{tail(log_path)}", flush=True)
        sys.exit(code if code > 0 else 1)


if __name__ == "__main__":
    main()
