"""Render the six screenshot topics using production thumbnail code, without APIs."""
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent


def main():
    work = Path(tempfile.mkdtemp(prefix="packaging-quality-"))
    subprocess.run([
        "python3", str(REPO / "src/lib/thumbnail/renderer.py"), "batch",
        "--spec", str(DOCS / "specs.json"), "--out-dir", str(work),
        "--font-dir", str(REPO / "src/lib/thumbnail/fonts"), "--timeout", "240",
    ], check=True, capture_output=True)
    results = json.loads((work / "results.json").read_text())
    specs = json.loads((DOCS / "specs.json").read_text())
    gallery = Image.new("RGB", (1480, 700), "#101010")
    draw = ImageDraw.Draw(gallery)
    font = ImageFont.truetype("DejaVuSans.ttf", 16)
    for index, spec in enumerate(specs):
        result = results[str(index)]
        assert result["ok"] and result["report"]["mode"] == "full", result
        assert not result["report"]["warnings"], result
        x, y = 24 + (index % 3) * 488, 18 + (index // 3) * 344
        image = Image.open(result["path"]).convert("RGB")
        gallery.paste(image.resize((464, 261), Image.Resampling.LANCZOS), (x, y))
        lines = [""]
        for word in spec["title"].split():
            candidate = (lines[-1] + " " + word).strip()
            if draw.textlength(candidate, font=font) > 460:
                lines.append(word)
            else:
                lines[-1] = candidate
        draw.multiline_text((x, y + 274), "\n".join(lines), fill="#EEEEEE", font=font, spacing=5)
    gallery.save(DOCS / "after.jpg", quality=95, subsampling=0)
    print(f"Six full renders with no layout warnings. Reports: {work}")


if __name__ == "__main__":
    main()
