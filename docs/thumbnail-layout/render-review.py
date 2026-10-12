"""Render review fixtures with the production renderer, without paid APIs.

The before image is the user's supplied screenshot. The after images are
new diagram specs for those topics, not regenerated or republished videos.
"""
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent


def main():
    work = Path(tempfile.mkdtemp(prefix="thumbnail-layout-review-"))
    subprocess.run([
        "python3", str(REPO / "src/lib/thumbnail/renderer.py"), "batch",
        "--spec", str(DOCS / "specs.json"), "--out-dir", str(work),
        "--font-dir", str(REPO / "src/lib/thumbnail/fonts"), "--timeout", "240",
    ], check=True)
    results = json.loads((work / "results.json").read_text())
    specs = json.loads((DOCS / "specs.json").read_text())
    gallery = Image.new("RGB", (1528, 315), "#101010")
    draw = ImageDraw.Draw(gallery)
    font = ImageFont.truetype("DejaVuSans.ttf", 15)
    for index, x in enumerate((34, 518, 1003)):
        result = results[str(index)]
        assert result["ok"] and result["report"]["mode"] == "full", result
        assert not result["report"]["warnings"], result
        image = Image.open(result["path"]).convert("RGB")
        image.save(DOCS / f"after-{index + 1}.png", optimize=True)
        gallery.paste(image.resize((466, 262), Image.Resampling.LANCZOS), (x, 8))
        # Same topics and copy as the screenshot; no simulated YouTube chrome.
        draw.text((x, 285), specs[index]["title"], fill="#EDEAE4", font=font)
    gallery.save(DOCS / "after.jpg", quality=95, subsampling=0, optimize=True)
    print(f"Full renders and reports: {work}")


if __name__ == "__main__":
    main()
