"""Render driver for generated videos. Runs inside the E2B sandbox.

    python eduvids_render.py '<json config>'

1. Prefetch. Narration audio is fetched concurrently (network bound) while
   every literal formula in the script is compiled in batched XeLaTeX runs,
   one per CPU (paying TeX's ~1.3s start-up once per batch instead of once
   per formula). Both fill the same caches Manim reads, so the render itself
   only waits on drawing. Anything missed here is simply produced on demand.
2. Render. Every scene is its own Manim process, pulled from a queue most
   expensive first (3D scenes count several times their narration) by one
   worker slot per CPU that memory allows. Slots keep their media directory,
   so later scenes reuse earlier formula caches. A process killed by the OS
   (memory) is retried alone at the end; a script error stops the queue and
   is reported as-is, so the workflow can repair the script without waiting
   for the remaining scenes.
3. Postprocess (optional). When the config names a postprocess script, it
   runs as soon as every scene has rendered, in the same job.

Config: {"script", "scenes", "media_dir", "manim_args", "prefetch_dir",
"postprocess"}.
"""

import ast
import concurrent.futures
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Measured peak RSS of a 1080p scene with the house encoder settings and a
# 4-frame queue: ~445 MB for 2D scenes and for a 48x48 lit surface (it was
# 0.75-1 GB with Manim's unbounded queue and x264 "medium"), plus headroom.
# (A fixed glibc mmap threshold saves ~50 MB more but costs ~10 s of page
# faults per scene.)
MB_PER_RENDER = 512
# Cost per character of narration, relative to a 2D scene. Lit 3D surfaces
# draw thousands of patches every frame.
THREE_D_FACTOR = 4
# Exit code when every scene rendered but the postprocess failed
# (POSTPROCESS_FAILED_EXIT in sandbox-jobs.ts).
POSTPROCESS_FAILED = 86
# Shortest stretch of scene time worth its own process (each pays Manim's
# start-up and fast-forwards through the scene up to its start).
MIN_SEGMENT_SECONDS = 4
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


def _base_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def narrated_seconds(source, scenes):
    """Rough scene length from narration (about 15 characters a second, plus
    the closing fade); used only to place split points."""
    chars = {name: 0 for name in scenes}
    for cls in ast.parse(source).body:
        if isinstance(cls, ast.ClassDef) and cls.name in chars:
            for node in ast.walk(cls):
                if isinstance(node, ast.Call) and _call_name(node) == "voiceover":
                    chars[cls.name] += sum(len(_string(k.value) or "") for k in node.keywords if k.arg == "text")
    return {name: count / 15 + 1.5 for name, count in chars.items()}


def analyse(source, scenes):
    """Narration lines, literal formulas, and a cost weight per scene."""
    tree = ast.parse(source)
    narration, formulas = [], []
    weights = {name: 400 for name in scenes}
    three_d = set()
    for cls in tree.body:
        if not isinstance(cls, ast.ClassDef):
            continue
        if any("ThreeD" in (_base_name(base) or "") for base in cls.bases):
            three_d.add(cls.name)
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
    for name in three_d & weights.keys():
        weights[name] *= THREE_D_FACTOR
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


def usable_cpus():
    """CPUs this process may run on, respecting affinity and a cgroup quota
    (os.cpu_count() reports the host's CPUs inside a container)."""
    try:
        cpus = len(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        cpus = os.cpu_count() or 1
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()[:2]
        if quota != "max":
            cpus = min(cpus, max(1, int(int(quota) / int(period))))
    except (OSError, ValueError):
        pass
    return max(1, cpus)


def plan(scenes, weights, seconds, workers):
    """Render tasks, most expensive first. A scene costing well over an even
    share of the work is split into segments of its timeline (see
    EDUVIDS_SEGMENT in video_style.py), so one long 3D scene cannot hold up
    the whole video while the other workers sit idle. Ties keep the script's
    order. Each task is (scene, segment index, segment count, start, end)."""
    share = sum(weights.get(name, 0) for name in scenes) / max(1, workers)
    tasks = []
    for name in scenes:
        weight = weights.get(name, 0)
        count = 1
        if workers > 1 and weight > 1.25 * share:
            # Half-share segments: cost is uneven within a scene (a camera
            # move costs far more than a held frame), so finer pieces balance.
            count = min(workers, math.ceil(2 * weight / share), int(seconds.get(name, 0) // MIN_SEGMENT_SECONDS))
        count = max(1, count)
        # Cut short of the estimated end, so the last segment always renders
        # something (it carries the scene's whole soundtrack).
        bounds = [seconds.get(name, 0) * 0.85 * index / count for index in range(count)] + [1e9]
        for index in range(count):
            tasks.append((name, index, count, bounds[index], bounds[index + 1], weight / count))
    order = {name: i for i, name in enumerate(scenes)}
    tasks.sort(key=lambda task: (-task[5], order[task[0]], task[1]))
    return [task[:5] for task in tasks]


def scene_output(media, scene):
    found = [p for p in Path(media).rglob(scene + ".mp4") if "partial_movie_files" not in p.parts]
    return found[0] if len(found) == 1 else None


class Job:
    def __init__(self, cfg, task, slot, media, env):
        self.task, self.slot, self.media = task, slot, media
        scene, index, count, start, end = task
        self.name = scene if count == 1 else f"{scene}.{index}"
        self.log_path = Path(cfg["media_dir"]) / f"render-{self.name}.log"
        self.handle = open(self.log_path, "w")
        if count > 1:
            env = dict(env, EDUVIDS_SEGMENT=f"{start},{end}")
        command = ["manim", cfg["script"], scene, "--media_dir", str(media), *cfg["manim_args"]]
        self.proc = subprocess.Popen(command, stdout=self.handle, stderr=subprocess.STDOUT, env=env)
        self.started = time.time()

    def finish(self, segments_dir):
        self.handle.close()
        code = self.proc.returncode
        scene, index, count, _, _ = self.task
        if code == 0 and count > 1:
            # Move the segment out of the slot before another job reuses it.
            output = scene_output(self.media, scene)
            if output is not None:
                output.rename(segments_dir / f"{scene}.{index}.segment.mp4")
        return code


def render(cfg, tasks, media_dirs, env):
    """Run every task, at most one per media directory at a time. Returns
    (task, log_path, code, media) failures; a script error (positive exit
    code) stops the queue and the running scenes, since the workflow repairs
    and re-renders the whole script anyway."""
    segments_dir = Path(cfg["media_dir"]) / "segments"
    segments_dir.mkdir(parents=True, exist_ok=True)
    pending = list(tasks)
    free = list(range(len(media_dirs)))
    running, failures = [], []
    while pending or running:
        while pending and free and not any(failure[2] > 0 for failure in failures):
            slot = free.pop(0)
            running.append(Job(cfg, pending.pop(0), slot, media_dirs[slot], env))
        if not running:
            break
        time.sleep(0.05)
        for job in [job for job in running if job.proc.poll() is not None]:
            running.remove(job)
            free.append(job.slot)
            code = job.finish(segments_dir)
            log(f"{job.name} {'rendered' if code == 0 else f'failed ({code})'} in {time.time() - job.started:.1f}s")
            if code != 0:
                failures.append((job.task, job.log_path, code, job.media))
                if code > 0:
                    pending.clear()
                    for other in running:
                        other.proc.terminate()
    return failures


def video_seconds(path):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)], timeout=60,
    ).decode().strip())


def merge_segments(cfg, scene, count):
    """Join a split scene's segments into one movie: their pictures in order,
    with the soundtrack of the last segment that rendered anything. That
    segment fast-forwarded through everything before it and played on to the
    scene's end, so it holds all of the narration at full-render timing. (A
    segment whose span holds no animation writes no movie.)"""
    root = Path(cfg["media_dir"])
    parts = [root / "segments" / f"{scene}.{index}.segment.mp4" for index in range(count)]
    present = [part for part in parts if part.exists()]
    if not present:
        raise RuntimeError(f"no segment of {scene} rendered")
    # Pictures only: a segment's soundtrack runs past its last frame, and the
    # concat demuxer would advance by that longer duration, leaving gaps.
    pictures = []
    for part in present:
        picture = part.with_suffix(".video.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(part), "-map", "0:v", "-c", "copy", str(picture)],
                       check=True, timeout=300)
        pictures.append(picture)
    listing = root / "segments" / f"{scene}.txt"
    listing.write_text("".join(f"file '{picture}'\n" for picture in pictures))
    target = root / "merged" / f"{scene}.mp4"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-i", str(present[-1]),
             "-map", "0:v", "-map", "1:a?", "-c", "copy", str(target)],
            check=True, timeout=300,
        )
        expected = sum(video_seconds(picture) for picture in pictures)
        if abs(video_seconds(target) - expected) > 0.05:
            raise RuntimeError(f"joined {scene} lasts {video_seconds(target):.2f}s, expected {expected:.2f}s")
    except Exception:
        target.unlink(missing_ok=True)  # never leave a second candidate
        raise
    for part in present + pictures:
        part.unlink()


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

    workers = max(1, min(usable_cpus(), len(scenes), available_mb() // MB_PER_RENDER))
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
    try:
        seconds = narrated_seconds(source, scenes)
    except SyntaxError:
        seconds = {}
    tasks = plan(scenes, weights, seconds, workers)
    names = [task[0] if task[2] == 1 else f"{task[0]}.{task[1]}" for task in tasks]
    log(f"rendering {len(scenes)} scenes as {len(tasks)} tasks on {workers} workers, in order {names}")
    failures = render(cfg, tasks, media_dirs, env)
    audio.result()
    pool.shutdown()

    # Killed by the OS (negative code) rather than a script error: retry alone.
    # In its own media directory, so a truncated first attempt is replaced.
    killed = [failure for failure in failures if failure[2] < 0]
    if killed and not any(failure[2] > 0 for failure in failures):
        log(f"retrying {len(killed)} killed render(s) one at a time")
        failures = []
        for task, _, _, media in killed:
            failures += render(cfg, [task], [media], env)

    # Join split scenes; if that fails, render the scene whole instead.
    if not failures:
        for scene in scenes:
            count = next((task[2] for task in tasks if task[0] == scene), 1)
            if count < 2:
                continue
            try:
                merge_segments(cfg, scene, count)
            except Exception as error:
                log(f"could not join {scene} ({error}); rendering it whole")
                failures += render(cfg, [(scene, 0, 1, 0, 1e9)], media_dirs[:1], env)

    log(f"render finished in {time.time() - started:.1f}s")
    if failures:
        errors = [failure for failure in failures if failure[2] > 0] or failures
        (scene, *_), log_path, code, _ = errors[0]
        print(f"Manim failed (exit {code}) rendering {scene}:\n{tail(log_path)}", flush=True)
        sys.exit(code if code > 0 else 1)

    postprocess = cfg.get("postprocess")
    if postprocess:
        result = subprocess.run([sys.executable, postprocess], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        log(f"postprocess finished at {time.time() - started:.1f}s")
        if result.returncode != 0:
            print("Postprocess failed:\n" + result.stdout.decode("utf-8", errors="replace")[-5000:], flush=True)
            sys.exit(POSTPROCESS_FAILED)  # not a script error: no repair


if __name__ == "__main__":
    main()
