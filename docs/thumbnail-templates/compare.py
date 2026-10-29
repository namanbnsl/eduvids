"""Before/after for the thumbnail templates, on fixed topics with live Gemini.

    git worktree add /tmp/thumb-before <commit before the rework>
    BEFORE_REPO=/tmp/thumb-before python3 docs/thumbnail-templates/compare.py before
    python3 docs/thumbnail-templates/compare.py after
    python3 docs/thumbnail-templates/compare.py sheets

Each side takes the packaging prompt (extracted from src/lib/llm.ts) and the
renderer from its own checkout, and builds specs the way that checkout's
buildThumbnailSpecs does. Both sides use the same model and topics.

Needs GOOGLE_GENERATIVE_AI_API_KEY_* in .env.local or .env.
"""
from __future__ import annotations

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

HERE = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent
SIDE = sys.argv[1] if len(sys.argv) > 1 else "after"
REPO = Path(os.environ["BEFORE_REPO"]) if SIDE == "before" else HERE
FONTS = REPO / "src/lib/thumbnail/fonts"
RENDERER = REPO / "src/lib/thumbnail/renderer.py"
MODEL = os.environ.get("TEXT_MODEL", "gemini-3.8-flash")
# Before the rework: three layouts, rotated per video, chosen by no one.
LEGACY_LAYOUTS = ["split_left", "split_right", "poster"]
PALETTES = ["teal-amber", "azure-coral", "violet-amber", "teal-rose", "azure-amber"]
COPY_LAYOUTS = ["split_left", "poster", "split_right", "bleed_right", "stage", "statement", "bleed_left"]
VISUAL_LAYOUTS = ["visual_only", "visual_bleed"]

TOPICS = {
    "monty-hall": ("The Monty Hall problem", "Three doors, one car. You pick door 1. The host, who knows where the car is, opens door 3 to show a goat and offers a switch to door 2. Most people say it is 50/50, so switching does not matter. It does: staying wins only if your first pick was right, 1/3 of the time; switching wins the other 2/3. Picture 100 doors: you pick one, the host opens 98 goats and leaves one closed. The host's knowledge concentrates the remaining probability on the door he avoided."),
    "sky-blue": ("Why the sky is blue but sunsets are red", "Sunlight is white, a mix of every colour. Air molecules are far smaller than a wavelength of light, so they scatter it with Rayleigh scattering, whose strength goes as 1 over wavelength to the fourth power. Blue light at 450 nm scatters about 5.5 times more than red at 700 nm, so blue reaches your eye from every direction in the sky. Violet scatters even more, but the sun emits less of it and our eyes are less sensitive to it. At sunset, light crosses up to 40 times more air; the blue is scattered away before it reaches you and the red and orange get through."),
    "birthday": ("The birthday paradox", "How many people do you need in a room for a better than even chance that two share a birthday? Most people guess around 183, half of 365. The answer is 23. The trick is counting pairs, not people: 23 people make 253 pairs, and each pair is a chance for a match. The probability that nobody matches is 365/365 x 364/365 x ... x 343/365, which drops below 50% at 23 people. With 70 people a shared birthday is 99.9% likely."),
    "gps": ("How GPS depends on relativity", "GPS satellites orbit at 20,200 km and move at about 14,000 km/h. Special relativity says their fast-moving clocks run slow by about 7 microseconds per day. General relativity says clocks higher in Earth's weaker gravity run fast, by about 45 microseconds per day. The net effect is +38 microseconds per day. Light travels about 300 m in a microsecond, so left uncorrected, positions would drift by roughly 10 km every day. Engineers set the satellite clocks slightly slow before launch to cancel it."),
    "gabriel": ("Gabriel's horn", "Take the curve y = 1/x from x = 1 to infinity and spin it around the x-axis. The resulting horn is infinitely long. Its volume is pi times the integral of 1/x^2, which converges to exactly pi. Its surface area is at least 2 pi times the integral of 1/x, which diverges: the surface is infinite. So you could fill the horn with pi units of paint, yet you could never paint its surface. The paradox dissolves because paint has thickness while the mathematical surface does not."),
}


def load_keys() -> list[str]:
    keys = {}
    for name in (".env.local", ".env"):
        path = HERE / name
        if path.exists():
            for line in path.read_text().splitlines():
                match = re.match(r"(GOOGLE_GENERATIVE_AI_API_KEY_\d+)=(.+)", line.strip())
                if match:
                    keys.setdefault(match.group(1), match.group(2).strip().strip('"'))
    return [value for _, value in sorted(keys.items())]


KEYS = load_keys()
_turn = [0]


def gemini(system: str, prompt: str, temperature=0.8, retries=6) -> str:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": {"temperature": temperature},
    }
    for attempt in range(retries):
        key = KEYS[_turn[0] % len(KEYS)]
        _turn[0] += 1
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={key}",
            data=json.dumps(body).encode(), headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                data = json.load(response)
            return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"] if not p.get("thought"))
        except urllib.error.HTTPError as error:
            print(f"  attempt {attempt + 1}: {error.code}", file=sys.stderr)
            time.sleep(8 + 8 * attempt)
        except (urllib.error.URLError, KeyError, TimeoutError) as error:
            print(f"  attempt {attempt + 1}: {error}", file=sys.stderr)
            time.sleep(8 + 8 * attempt)
    raise RuntimeError("Gemini failed")


def production_prompt() -> str:
    source = (REPO / "src/lib/llm.ts").read_text()
    raw = re.search(r"const systemPrompt = `(You package videos.*?)`;", source, re.S).group(1)
    return raw.replace("\\`", "`").replace("\\\\", "\\")


def parse_packages(text: str) -> list[dict]:
    text = re.sub(r"```(?:json)?", "", text).strip()
    data = json.JSONDecoder(strict=False).raw_decode(text[text.find("{"):])[0]
    return data["packages"][:3]


def specs_for(topic: str, packages: list[dict]) -> list[dict]:
    """Mirrors buildThumbnailSpecs: B is visual-only and C never repeats A."""
    palette = PALETTES[sum(map(ord, topic)) % len(PALETTES)]
    offset = sum(map(ord, "layout:" + topic)) % len(COPY_LAYOUTS)
    specs = []
    for index, pkg in enumerate(packages):
        composition = pkg.get("composition") if isinstance(pkg.get("composition"), dict) else {}
        visual_only = index == 1 or not pkg.get("headline")
        if SIDE == "before":
            layout = "visual_only" if visual_only else LEGACY_LAYOUTS[(offset + (index == 2)) % 3]
        elif visual_only:
            layout = composition.get("layout") if composition.get("layout") in VISUAL_LAYOUTS else "visual_only"
        else:
            layout = composition.get("layout") if composition.get("layout") in COPY_LAYOUTS else COPY_LAYOUTS[(offset + index) % len(COPY_LAYOUTS)]
            if index == 2 and specs and layout == specs[0]["layout"]:
                layout = COPY_LAYOUTS[(COPY_LAYOUTS.index(layout) + 1) % len(COPY_LAYOUTS)]
        specs.append({
            "title": pkg["title"], "palette": palette, "layout": layout,
            "composition": {k: v for k, v in composition.items() if k != "layout"},
            "headline": "" if visual_only else pkg.get("headline", ""),
            "accent": "" if visual_only else pkg.get("accent", ""),
            "strike": "" if visual_only else pkg.get("strike", ""),
            "callout": "" if visual_only else pkg.get("callout", ""),
            "visual": pkg.get("visual") or {"type": "geometry"},
        })
    return specs


def run(topic: str) -> None:
    title, narration = TOPICS[topic]
    text = gemini(production_prompt(), f'Generate three title-and-thumbnail pairs for this animated educational video: "{title}"\n\nSOURCE MATERIAL:\nNARRATION:\n{narration}')
    specs = specs_for(topic, parse_packages(text))
    work = Path(tempfile.mkdtemp(prefix="after-"))
    (work / "specs.json").write_text(json.dumps(specs))
    subprocess.run([sys.executable, str(RENDERER), "batch", "--spec", str(work / "specs.json"), "--out-dir", str(work), "--font-dir", str(FONTS), "--timeout", "400"], capture_output=True)
    results = json.loads((work / "results.json").read_text())
    out = DOCS / SIDE
    for index in range(3):
        result = results[str(index)]
        if result["ok"]:
            (out / f"{topic}-{index}.png").write_bytes(Path(result["path"]).read_bytes())
    for result in results.values():
        result.pop("path", None)
    (out / f"{topic}.json").write_text(json.dumps({"specs": specs, "results": results}, indent=2, ensure_ascii=False))


def sheets() -> None:
    from PIL import Image, ImageDraw, ImageFont

    w, h, gap, head = 400, 225, 12, 44
    font = ImageFont.truetype("DejaVuSans-Bold.ttf", 20)
    small = ImageFont.truetype("DejaVuSans.ttf", 15)

    def tile(path: Path):
        if path.exists():
            return Image.open(path).convert("RGB").resize((w, h), Image.Resampling.LANCZOS)
        blank = Image.new("RGB", (w, h), "#2A1515")
        ImageDraw.Draw(blank).text((12, 12), "failed", fill="#FC6255", font=small)
        return blank

    # One sheet per topic: before on the top row, after below.
    for topic in TOPICS:
        sheet = Image.new("RGB", (gap + 3 * (w + gap) , head + 2 * (h + gap + 26)), "#141414")
        draw = ImageDraw.Draw(sheet)
        draw.text((gap, 12), TOPICS[topic][0], fill="#EDEAE4", font=font)
        for row, side in enumerate(("before", "after")):
            y = head + row * (h + gap + 26)
            draw.text((gap, y), side, fill="#8A8F98" if side == "before" else "#FFD35A", font=small)
            for index in range(3):
                sheet.paste(tile(DOCS / side / f"{topic}-{index}.png"), (gap + index * (w + gap), y + 22))
        sheet.save(DOCS / f"{topic}.jpg", quality=86)


def main() -> None:
    if SIDE != "sheets":
        if not KEYS:
            sys.exit("No GOOGLE_GENERATIVE_AI_API_KEY_* found")
        (DOCS / SIDE).mkdir(exist_ok=True)
        with cf.ThreadPoolExecutor(max_workers=int(os.environ.get("JOBS", "3"))) as pool:
            futures = {pool.submit(run, topic): topic for topic in os.environ.get("TOPICS", ",".join(TOPICS)).split(",")}
            for future in cf.as_completed(futures):
                try:
                    future.result()
                    print(f"done {futures[future]}")
                except Exception as error:  # noqa: BLE001
                    print(f"FAILED {futures[future]}: {error}")
    sheets()


if __name__ == "__main__":
    main()
