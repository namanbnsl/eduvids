"""Compare thumbnail approaches on the same topics with live Gemini output.

    python3 docs/thumbnail-freeform/experiment.py [approach ...]

Approaches
- spec:   the production prompt (extracted from src/lib/llm.ts) and renderer:
          the model picks a hero type from a fixed catalogue.
- hero:   same copy and layouts, but the model writes the hero as Manim code.
- scene:  the model composes the whole frame in Manim code; hard rules are
          checked after rendering, then it sees its render and revises once.
- image:  an image model paints the whole thumbnail from a style brief.

Needs GOOGLE_GENERATIVE_AI_API_KEY_* in .env.local or .env.
"""
from __future__ import annotations

import base64
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent
OUT = DOCS / "out"
FONTS = REPO / "src/lib/thumbnail/fonts"
RENDERER = REPO / "src/lib/thumbnail/renderer.py"
FREEFORM = REPO / "src/lib/thumbnail/freeform.py"
TEXT_MODEL = os.environ.get("TEXT_MODEL", "gemini-3.8-flash")
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "gpt-image-2")
PALETTES = ["teal-amber", "azure-coral", "violet-amber", "teal-rose", "azure-amber"]
LAYOUTS = ["split_left", "split_right", "poster"]

TOPICS = {
    "monty-hall": ("The Monty Hall problem", "Three doors, one car. You pick door 1. The host, who knows where the car is, opens door 3 to show a goat and offers a switch to door 2. Most people say it is 50/50, so switching does not matter. It does: staying wins only if your first pick was right, 1/3 of the time; switching wins the other 2/3. Picture 100 doors: you pick one, the host opens 98 goats and leaves one closed. The host's knowledge concentrates the remaining probability on the door he avoided."),
    "sky-blue": ("Why the sky is blue but sunsets are red", "Sunlight is white, a mix of every colour. Air molecules are far smaller than a wavelength of light, so they scatter it with Rayleigh scattering, whose strength goes as 1 over wavelength to the fourth power. Blue light at 450 nm scatters about 5.5 times more than red at 700 nm, so blue reaches your eye from every direction in the sky. Violet scatters even more, but the sun emits less of it and our eyes are less sensitive to it. At sunset, light crosses up to 40 times more air; the blue is scattered away before it reaches you and the red and orange get through."),
    "birthday": ("The birthday paradox", "How many people do you need in a room for a better than even chance that two share a birthday? Most people guess around 183, half of 365. The answer is 23. The trick is counting pairs, not people: 23 people make 253 pairs, and each pair is a chance for a match. The probability that nobody matches is 365/365 x 364/365 x ... x 343/365, which drops below 50% at 23 people. With 70 people a shared birthday is 99.9% likely."),
    "gps": ("How GPS depends on relativity", "GPS satellites orbit at 20,200 km and move at about 14,000 km/h. Special relativity says their fast-moving clocks run slow by about 7 microseconds per day. General relativity says clocks higher in Earth's weaker gravity run fast, by about 45 microseconds per day. The net effect is +38 microseconds per day. Light travels about 300 m in a microsecond, so left uncorrected, positions would drift by roughly 10 km every day. Engineers set the satellite clocks slightly slow before launch to cancel it."),
    "gabriel": ("Gabriel's horn", "Take the curve y = 1/x from x = 1 to infinity and spin it around the x-axis. The resulting horn is infinitely long. Its volume is pi times the integral of 1/x^2, which converges to exactly pi. Its surface area is at least 2 pi times the integral of 1/x, which diverges: the surface is infinite. So you could fill the horn with pi units of paint, yet you could never paint its surface. The paradox dissolves because paint has thickness while the mathematical surface does not."),
}


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

def env_value(name: str) -> str:
    for file in (".env.local", ".env"):
        path = REPO / file
        if path.exists():
            for line in path.read_text().splitlines():
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"')
    return os.environ.get(name, "")


def openai_image(prompt: str) -> bytes:
    request = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps({"model": IMAGE_MODEL, "prompt": prompt, "size": "1536x1024", "quality": "medium", "n": 1}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {env_value('OPENAI_API_KEY')}"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return base64.b64decode(json.load(response)["data"][0]["b64_json"])


def load_keys() -> list[str]:
    keys = {}
    for name in (".env.local", ".env"):
        path = REPO / name
        if path.exists():
            for line in path.read_text().splitlines():
                m = re.match(r"(GOOGLE_GENERATIVE_AI_API_KEY_\d+)=(.+)", line.strip())
                if m:
                    keys.setdefault(m.group(1), m.group(2).strip().strip('"'))
    return [v for _, v in sorted(keys.items())]


KEYS = load_keys()
_key_turn = [0]
_spent: set = set()  # (model, key) pairs that hit their daily quota


class QuotaExhausted(RuntimeError):
    pass


def gemini(model: str, parts: list, system: str | None = None, temperature=0.9, image=False, retries=6) -> list:
    """One call. A key that hits its daily quota is never retried; busy (503)
    and per-minute (429) responses back off and move to the next key."""
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"temperature": temperature}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if image:
        body["generationConfig"]["responseModalities"] = ["IMAGE"]
        body["generationConfig"]["imageConfig"] = {"aspectRatio": "16:9"}
    for attempt in range(retries):
        live = [k for k in KEYS if (model, k) not in _spent]
        if not live:
            raise QuotaExhausted(f"{model}: every key is out of daily quota")
        key = live[_key_turn[0] % len(live)]
        _key_turn[0] += 1
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
            data=json.dumps(body).encode(), headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                data = json.load(response)
            return [p for p in data["candidates"][0]["content"]["parts"] if not p.get("thought")]
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            if error.code == 429 and "PerDay" in text:
                _spent.add((model, key))
                print(f"  [{model}] key {KEYS.index(key) + 1} out of daily quota", file=sys.stderr)
                continue
            print(f"  [{model}] attempt {attempt + 1}: {error.code} {re.sub(r'\s+', ' ', text)[:160]}", file=sys.stderr)
        except (urllib.error.URLError, KeyError, TimeoutError) as error:
            print(f"  [{model}] attempt {attempt + 1}: {error}", file=sys.stderr)
        time.sleep(8 + 8 * attempt)
    raise RuntimeError(f"{model} failed after {retries} attempts")


def ask(system: str, prompt: str, images: list[Path] = (), temperature=0.9) -> str:
    parts = [{"text": prompt}] + [{"inlineData": {"mimeType": "image/png", "data": base64.b64encode(p.read_bytes()).decode()}} for p in images]
    return "".join(p.get("text", "") for p in gemini(TEXT_MODEL, parts, system, temperature))


FORMAT = """Return the three packages, strongest first, each exactly in this form and nothing else:

=== PACKAGE ===
{fields}
```python
<code>
```"""


def parse_blocks(text: str, fields: list[str]) -> list[dict]:
    packages = []
    for chunk in text.split("=== PACKAGE ===")[1:]:
        record = {}
        for name in fields:
            m = re.search(rf"^{name.upper()}:[ \t]*(.*)$", chunk, re.M)
            record[name] = m.group(1).strip().strip('"') if m else ""
        record["code"] = extract_code(chunk)
        packages.append(record)
    if len(packages) < 3:
        raise ValueError(f"expected three packages, got {len(packages)}")
    return packages[:3]


def extract_code(text: str) -> str:
    """The first fenced block, or the reply itself without fences."""
    m = re.search(r"```[a-zA-Z]*\n(.*?)```", text, re.S)
    return (m.group(1) if m else re.sub(r"```[a-zA-Z]*", "", text)).strip()


def parse_json(text: str):
    text = re.sub(r"```(?:json|python)?", "", text).strip()
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0])
    return json.loads(text[start:], strict=False) if text[start:].rstrip().endswith(("}", "]")) else json.JSONDecoder(strict=False).raw_decode(text[start:])[0]


# ---------------------------------------------------------------------------
# Shared house style
# ---------------------------------------------------------------------------

HOUSE = """HOUSE STYLE (non-negotiable)
- eduvids is a visual math and science channel shelved beside 3Blue1Brown, Welch Labs and Veritasium.
- Flat near-black canvas (#0A0A0A). Crisp solid strokes and flat fills. No glow, bloom, vignette, gradients, sheen, drop shadows, lens flares or photoreal 3D.
- Type is Computer Modern (CMU Serif text, Latin Modern Math formulas), as in 3Blue1Brown. No sans display type. Copy is sentence case: never ALL CAPS.
- Colour: off-white ink #EDEAE4, muted grey #8A8F98, ONE cool hue for the picture ({cool}) and ONE warm hue ({warm}) reserved for the single focal detail and the payoff word.
- Never invent numbers, data or claims: everything must be true to the narration."""

CLICK = """WHAT WINS THE CLICK
- The title and thumbnail are one sentence split in two: the image shows the strange thing, the title makes it matter. Never say the same thing twice.
- One focal idea that reads at phone size (about 360px wide). If it does not read when tiny, cut it.
- The picture makes a viewer ask "wait, what?": the impossible number, the moment two things diverge, the object that should not exist, the wrong answer crossed out.
- Package B is text-free: the picture alone must stop the scroll."""


def source(topic: str) -> str:
    title, narration = TOPICS[topic]
    return f'Video: "{title}"\n\nNARRATION:\n{narration}'


def palette_for(topic: str) -> str:
    return PALETTES[sum(map(ord, topic)) % len(PALETTES)]


def colors(palette: str) -> tuple[str, str]:
    table = {"teal-amber": ("#5CD0B3", "#FFD35A"), "azure-coral": ("#58C4DD", "#FC6255"), "violet-amber": ("#B189C6", "#FFD35A"), "teal-rose": ("#5CD0B3", "#E07A9F"), "azure-amber": ("#58C4DD", "#FFD35A")}
    return table[palette]


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

def render_freeform(spec: dict, out: Path) -> str | None:
    """Render one freeform spec. Returns an error message, or None."""
    work = Path(tempfile.mkdtemp(prefix="ff-"))
    (work / "spec.json").write_text(json.dumps(spec))
    try:
        run = subprocess.run([sys.executable, str(FREEFORM), "render", "--spec", str(work / "spec.json"), "--out", str(out), "--font-dir", str(FONTS), "--work-dir", str(work)], capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        return "render timed out after 180 s"
    lines = run.stdout.strip().splitlines()
    report = json.loads(lines[-1]) if lines else {"error": run.stderr[-1500:]}
    return report.get("error")


def render_repaired(system: str, topic: str, label: str, spec: dict, key: tuple, out: Path, rounds=2) -> list:
    """Render; on failure show the model its error and code, up to ``rounds`` times."""
    errors = []
    for attempt in range(rounds + 1):
        error = render_freeform(spec, out)
        errors.append(error)
        if not error or attempt == rounds:
            break
        holder = spec
        for part in key[:-1]:
            holder = holder[part]
        reply = ask(system, f"{source(topic)}\n\nYour code for {label} failed:\n{error}\n\nCODE:\n{holder[key[-1]]}\n\nFix it and return ONLY the corrected Python code in one ```python block.", temperature=0.4)
        holder[key[-1]] = extract_code(reply)
    return errors


def log(topic: str, approach: str, data) -> None:
    path = OUT / approach / f"{topic}.json"
    path.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Approach: spec (production)
# ---------------------------------------------------------------------------

def production_prompt() -> str:
    source_ts = (REPO / "src/lib/llm.ts").read_text()
    raw = re.search(r"const systemPrompt = `(You package videos.*?)`;", source_ts, re.S).group(1)
    return raw.replace("\\`", "`").replace("\\\\", "\\")


def run_spec(topic: str) -> None:
    title, _ = TOPICS[topic]
    text = ask(production_prompt(), f'Generate three title-and-thumbnail pairs for this animated educational video: "{title}"\n\nSOURCE MATERIAL:\n{source(topic)}', temperature=0.8)
    packages = parse_json(text)["packages"][:3]
    palette, offset = palette_for(topic), sum(map(ord, topic)) % 3
    specs = []
    for index, pkg in enumerate(packages):
        visual_only = index == 1 or not pkg.get("headline")
        specs.append({
            "title": pkg["title"], "palette": palette,
            "layout": "visual_only" if visual_only else LAYOUTS[(offset + (index == 2)) % 3],
            "headline": "" if visual_only else pkg.get("headline", ""),
            "accent": "" if visual_only else pkg.get("accent", ""),
            "strike": "" if visual_only else pkg.get("strike", ""),
            "callout": "" if visual_only else pkg.get("callout", ""),
            "visual": pkg.get("visual") or {"type": "geometry"},
        })
    work = Path(tempfile.mkdtemp(prefix="spec-"))
    (work / "specs.json").write_text(json.dumps(specs))
    subprocess.run([sys.executable, str(RENDERER), "batch", "--spec", str(work / "specs.json"), "--out-dir", str(work), "--font-dir", str(FONTS), "--timeout", "400"], capture_output=True)
    results = json.loads((work / "results.json").read_text())
    for index in range(3):
        result = results[str(index)]
        if result["ok"]:
            (OUT / "spec" / f"{topic}-{index}.png").write_bytes(Path(result["path"]).read_bytes())
    log(topic, "spec", {"specs": specs, "results": results})


# ---------------------------------------------------------------------------
# Approach: hero (model draws the picture in Manim; standard layout)
# ---------------------------------------------------------------------------

HERO_SYSTEM = """You package videos for eduvids. Produce three title-and-thumbnail packages, strongest first, and DRAW each thumbnail's hero picture yourself in Manim (Community Edition 0.19) Python.

{house}

{click}

COPY
- title: 30-60 characters, title case, a curiosity gap anchored to something concrete. Three different angles.
- headline: 2-5 words, at most 26 characters, completes the title's thought and never repeats it. accent: the exact substring painted warm. strike (optional): one headline word drawn crossed out as the corrected wrong intuition. callout (optional): 1-3 words placed with a warm arrow at the focal detail.
- Package B has headline, accent, strike and callout all "".

HERO CODE
- Define `def hero():` returning `(mobject, focus)`: a VGroup of the picture, and the scene point of its warm focal detail (or None). The renderer scales and places the picture beside the headline, so draw it at any size around the origin.
- Draw something specific to THIS video, not a generic icon of the field. Be inventive: an unusual angle, an object from the narration, a before/after, a giant number, a diagram that makes the paradox visible. Make the three heroes genuinely different pictures.
- Everything Manim exports is in scope (Circle, Line, Polygon, VGroup, Arc, Arrow, FunctionGraph, ParametricFunction, Dot, Square, Rectangle, Sector, AnnularSector, DashedLine, ...), plus numpy as np and math.
- Colours: COOL, WARM, INK, MUTED, BG constants. Strokes 3-8 wide. Fill opacity is fine; never use sheen, gradients or set_color_by_gradient.
- Text inside the hero: tex(latex, size_px, color) for math and text(copy, size_px, color) for words, both Computer Modern. Keep in-picture text to at most two short labels, since the picture is scaled down to fit. Never use Text, MathTex or Tex directly.
- No camera, no Scene, no animation, no file or network access, no imports.

Write LaTeX in raw strings (r"\\frac{{1}}{{2}}").

""" + FORMAT.format(fields="TITLE: ...\nHEADLINE: ...\nACCENT: ...\nSTRIKE: ...\nCALLOUT: ...\nIDEA: one sentence: what the picture shows and why it hooks").replace("{", "{{").replace("}", "}}")


def run_hero(topic: str) -> None:
    palette = palette_for(topic)
    cool, warm = colors(palette)
    system = HERO_SYSTEM.format(house=HOUSE.format(cool=cool, warm=warm), click=CLICK)
    packages = parse_blocks(ask(system, source(topic)), ["title", "headline", "accent", "strike", "callout", "idea"])
    offset = sum(map(ord, topic)) % 3
    records = []
    for index, pkg in enumerate(packages):
        visual_only = index == 1 or not pkg.get("headline")
        spec = {
            "mode": "hero", "title": pkg["title"], "palette": palette,
            "layout": "visual_only" if visual_only else LAYOUTS[(offset + (index == 2)) % 3],
            "headline": "" if visual_only else pkg.get("headline", ""), "accent": "" if visual_only else pkg.get("accent", ""),
            "strike": "" if visual_only else pkg.get("strike", ""), "callout": "" if visual_only else pkg.get("callout", ""),
            "visual": {"code": pkg["code"]},
        }
        errors = render_repaired(system, topic, f"package {index} (the hero() function)", spec, ("visual", "code"), OUT / "hero" / f"{topic}-{index}.png")
        records.append({"package": pkg, "spec": spec, "errors": errors})
    log(topic, "hero", records)


# ---------------------------------------------------------------------------
# Approach: scene (model composes the whole frame; checked, then self-critique)
# ---------------------------------------------------------------------------

SCENE_SYSTEM = """You are the thumbnail designer for eduvids. Produce three title-and-thumbnail packages, strongest first. For each, design and BUILD the entire 1280x720 thumbnail yourself in Manim (Community Edition 0.19) Python. There is no template: you choose the composition, the type size, where the words go and what the picture is.

{house}

{click}

DESIGN FREEDOM (use it)
- There is no fixed text-left/picture-right grid. Pick the composition that best sells THIS idea, and make the three packages look clearly different from each other. Some directions great science thumbnails use: one enormous number that fills the frame with the wrong guess struck through; an object bleeding off the edge of the frame; words set inside or along the drawing; a before/after split; a dense field of small marks with one warm exception; a single absurd comparison of scale; a question mark made of the subject; a diagram cropped tight on the one moment that matters. Do not copy these; invent.
- Copy: 0-5 words, set big (headline type 90-220 px). Every word must earn its place. Package B uses no words at all (math symbols or a number are fine if they are the picture).
- Restraint is the style: few elements, big shapes, lots of black. Asymmetry and scale contrast are welcome.

CODE CONTRACT
- Define `def thumbnail():` returning a list of mobjects. Coordinates: P(x, y) turns pixels (origin top-left, x right, y down) into a scene point; px(n) turns a pixel length into scene units. The frame is 1280x720 px.
- Words: text(copy, size_px, color) where copy may use "\\n" line breaks, inline $math$, \\hl{{...}} for warm words, \\strike{{...}} for a crossed-out wrong intuition and \\textcolor{{cool}}{{...}}. color is "ink", "muted", "cool" or "accent". Math: tex(latex, size_px, color). Never use Text, MathTex or Tex directly. Position with .move_to(P(x, y)), .next_to, .to_edge, .align_to.
- Shapes: everything Manim exports (Circle, Line, Polygon, Arc, VGroup, FunctionGraph, ParametricFunction, Dot, Rectangle, Sector, DashedLine, Arrow, CurvedArrow, ...), numpy as np, math. Colours: COOL, WARM, INK, MUTED, BG. Strokes 3-10 wide. Never sheen, gradients or set_color_by_gradient.
- Hard rules checked after rendering (a violation fails the thumbnail): all text inside the 40px safe margin; no text under YouTube's duration badge (bottom-right 168x64 px); no text smaller than 34 px; text blocks never overlap. Shapes MAY bleed off the frame edges.
- No Scene, camera, animation, imports, files or network.

Write LaTeX in raw strings (r"\\hl{{23}}"), and use "\\n" only for line breaks in text().

""" + FORMAT.format(fields="TITLE: ...\nIDEA: one sentence: the composition and why it stops the scroll").replace("{", "{{").replace("}", "}}")

CRITIQUE = """Here is the render of your package {index} ("{title}"), shown at full size and at phone size. Judge it as a ruthless art director for a channel beside 3Blue1Brown and Veritasium:
- Does it read instantly at phone size? Is there one focal point? Is anything cramped, clipped by accident, overlapping, too small or illegible?
- Is it true to the narration and to the house style?
- Is it intriguing, and does it look like a designed poster rather than a template?
If it is already excellent, reply exactly KEEP. Otherwise reply with ONLY the complete improved Python code (same contract) in one ```python block."""


def phone_copy(path: Path) -> Path:
    from PIL import Image

    small = path.with_name(path.stem + "-phone.png")
    Image.open(path).resize((360, 203), Image.Resampling.LANCZOS).save(small)
    return small


def run_scene(topic: str) -> None:
    palette = palette_for(topic)
    cool, warm = colors(palette)
    system = SCENE_SYSTEM.format(house=HOUSE.format(cool=cool, warm=warm), click=CLICK)
    packages = parse_blocks(ask(system, source(topic)), ["title", "idea"])
    records = []
    for index, pkg in enumerate(packages):
        label = f'package {index} ("{pkg["title"]}")'
        spec = {"mode": "scene", "palette": palette, "code": pkg["code"]}
        draft = OUT / "scene" / f"{topic}-{index}-draft.png"
        errors = render_repaired(system, topic, label, spec, ("code",), draft)
        record = {"package": pkg, "errors": errors, "draft_code": spec["code"]}
        if not errors[-1]:
            final = OUT / "scene" / f"{topic}-{index}.png"
            reply = ask(system, f"{source(topic)}\n\nCODE:\n{spec['code']}\n\n" + CRITIQUE.format(index=index, title=pkg["title"]), [draft, phone_copy(draft)], temperature=0.5)
            record["critique"] = "KEEP" if reply.strip().startswith("KEEP") else "revised"
            if record["critique"] == "revised":
                revised = {**spec, "code": extract_code(reply)}
                record["revision_errors"] = render_repaired(system, topic, label, revised, ("code",), final)
                if not record["revision_errors"][-1]:
                    record["final_code"] = revised["code"]
            if not final.exists():
                final.write_bytes(draft.read_bytes())
        records.append(record)
    log(topic, "scene", records)


# ---------------------------------------------------------------------------
# Approach: image (image model paints the thumbnail)
# ---------------------------------------------------------------------------

IMAGE_BRIEF = """Design a YouTube thumbnail. Compose for a 16:9 crop of the centre (keep the top and bottom 8% empty) for an educational math and science video.

{house}

Idea: {idea}
{copy}
Flat vector illustration in the exact look of a 3Blue1Brown frame: near-black background, thin crisp lines, flat colour, generous empty space, one focal point. Any text is set in Computer Modern serif. Nothing in the bottom-right corner."""


def run_image(topic: str) -> None:
    palette = palette_for(topic)
    cool, warm = colors(palette)
    # Reuse a cheap text call for three ideas so the image prompt is grounded.
    ideas = parse_json(ask(
        f"You package videos for eduvids.\n\n{CLICK}\n\nReturn ONLY JSON: {{\"packages\": [{{\"title\", \"headline\" (2-5 words, \\\"\\\" for package B), \"idea\" (one vivid sentence describing the picture)}} x3]}}",
        source(topic)))["packages"][:3]
    records = []
    for index, pkg in enumerate(ideas):
        copy = f'The only words on the image: "{pkg["headline"]}" (large, sentence case).' if pkg.get("headline") and index != 1 else "No words or letters anywhere on the image."
        prompt = IMAGE_BRIEF.format(house=HOUSE.format(cool=cool, warm=warm), idea=pkg["idea"], copy=copy)
        try:
            raw = OUT / "image" / f"{topic}-{index}.raw"
            raw.write_bytes(openai_image(prompt))
            from PIL import Image

            Image.open(raw).convert("RGB").crop((0, 80, 1536, 944)).resize((1280, 720), Image.Resampling.LANCZOS).save(raw.with_suffix(".png"))
            raw.unlink()
            records.append({"package": pkg, "prompt": prompt})
        except Exception as error:  # noqa: BLE001
            records.append({"package": pkg, "error": str(error)})
    log(topic, "image", records)


APPROACHES = {"spec": run_spec, "hero": run_hero, "scene": run_scene, "image": run_image}


def main() -> None:
    chosen = sys.argv[1:] or list(APPROACHES)
    topics = os.environ.get("TOPICS", ",".join(TOPICS)).split(",")
    if not KEYS:
        sys.exit("No GOOGLE_GENERATIVE_AI_API_KEY_* found")
    for approach in chosen:
        (OUT / approach).mkdir(parents=True, exist_ok=True)
    jobs = [(a, t) for a in chosen for t in topics]
    with cf.ThreadPoolExecutor(max_workers=int(os.environ.get("JOBS", "4"))) as pool:
        futures = {pool.submit(APPROACHES[a], t): (a, t) for a, t in jobs}
        for future in cf.as_completed(futures):
            a, t = futures[future]
            try:
                future.result()
                print(f"done {a}/{t}")
            except Exception as error:  # noqa: BLE001
                print(f"FAILED {a}/{t}: {error}")


if __name__ == "__main__":
    main()
