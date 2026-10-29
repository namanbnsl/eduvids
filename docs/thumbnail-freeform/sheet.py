"""Contact sheets for experiment.py output: one sheet per approach
(topics x slots A/B/C) and a phone-size comparison across approaches."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DOCS = Path(__file__).resolve().parent
OUT = DOCS / "out"
TOPICS = ["monty-hall", "sky-blue", "birthday", "gps", "gabriel"]
APPROACHES = ["spec", "hero", "scene", "image"]
NAMES = {"spec": "Current: catalogue spec", "hero": "Model-drawn hero, fixed layout", "scene": "Model-composed frame + self-critique", "image": "Image model"}


def titles(approach, topic):
    path = OUT / approach / f"{topic}.json"
    if not path.exists():
        return ["", "", ""]
    data = json.loads(path.read_text())
    if approach == "spec":
        return [s["title"] for s in data["specs"]]
    return [r["package"].get("title", "") for r in data]


def tile(approach, topic, slot, size):
    path = OUT / approach / f"{topic}-{slot}.png"
    if path.exists():
        return Image.open(path).convert("RGB").resize(size, Image.Resampling.LANCZOS)
    blank = Image.new("RGB", size, "#2A1515")
    ImageDraw.Draw(blank).text((12, 12), "failed", fill="#FC6255", font=ImageFont.truetype("DejaVuSans.ttf", 18))
    return blank


def approach_sheet(approach, w=480, h=270):
    font, head = ImageFont.truetype("DejaVuSans.ttf", 15), ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    gap, cap, top = 20, 30, 56
    sheet = Image.new("RGB", (gap + 3 * (w + gap), top + len(TOPICS) * (h + cap + gap)), "#141414")
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 16), NAMES[approach], fill="#EDEAE4", font=head)
    for r, topic in enumerate(TOPICS):
        names = titles(approach, topic)
        for s in range(3):
            x, y = gap + s * (w + gap), top + r * (h + cap + gap)
            sheet.paste(tile(approach, topic, s, (w, h)), (x, y))
            draw.text((x, y + h + 6), names[s][:60] if s < len(names) else "", fill="#C8C8C8", font=font)
    sheet.save(DOCS / f"sheet-{approach}.jpg", quality=90, optimize=True)


def phone_sheet(slot=0, w=360, h=203):
    head = ImageFont.truetype("DejaVuSans-Bold.ttf", 16)
    gap, top = 14, 40
    present = [a for a in APPROACHES if (OUT / a).exists()]
    sheet = Image.new("RGB", (gap + len(present) * (w + gap), top + len(TOPICS) * (h + gap)), "#141414")
    draw = ImageDraw.Draw(sheet)
    for c, approach in enumerate(present):
        x = gap + c * (w + gap)
        draw.text((x, 12), NAMES[approach], fill="#EDEAE4", font=head)
        for r, topic in enumerate(TOPICS):
            sheet.paste(tile(approach, topic, slot, (w, h)), (x, top + r * (h + gap)))
    sheet.save(DOCS / f"phone-slot-{'ABC'[slot]}.jpg", quality=90, optimize=True)


if __name__ == "__main__":
    for approach in APPROACHES:
        if (OUT / approach).exists():
            approach_sheet(approach)
    for slot in range(3):
        phone_sheet(slot)
