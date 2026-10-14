"""Before/after review for thumbnail click-through, without paid APIs.

"Before" renders each package with the renderer as it was on main
(BASE below) and copy written to the old prompt's rules and visual set.
"After" renders the same topics with this branch's renderer and copy
written to the new packaging prompt. Packages are hand-written fixtures,
not live model output, so the comparison isolates what the system can now
express. Each title is printed under its thumbnail, as on YouTube.
"""
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

BASE = "444735f"
REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent
FONTS = REPO / "src/lib/thumbnail/fonts"


def render(renderer: Path, spec: Path, work: Path) -> list:
    out = work / spec.stem
    subprocess.run([
        "python3", str(renderer), "batch", "--spec", str(spec), "--out-dir", str(out),
        "--font-dir", str(FONTS), "--timeout", "400",
    ], check=True, stdout=subprocess.DEVNULL)
    results = json.loads((out / "results.json").read_text())
    images = []
    for index in range(len(json.loads(spec.read_text()))):
        result = results[str(index)]
        assert result["ok"] and result["report"]["mode"] == "full", result
        images.append(Image.open(result["path"]).convert("RGB"))
    return images


def sheet(columns, headers, rows_titles, out: Path, tile=(560, 315)):
    """columns: list of image lists; rows_titles: per column, per row titles."""
    title_font = ImageFont.truetype("DejaVuSans.ttf", 17)
    head_font = ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    w, h = tile
    gap, cap, top = 24, 44, 52
    rows = len(columns[0])
    canvas = Image.new("RGB", (gap + len(columns) * (w + gap), top + rows * (h + cap + gap)), "#141414")
    draw = ImageDraw.Draw(canvas)
    for c, (images, header, titles) in enumerate(zip(columns, headers, rows_titles)):
        x = gap + c * (w + gap)
        draw.text((x, 16), header, fill="#EDEAE4", font=head_font)
        for r, (image, title) in enumerate(zip(images, titles)):
            y = top + r * (h + cap + gap)
            canvas.paste(image.resize(tile, Image.Resampling.LANCZOS), (x, y))
            draw.text((x, y + h + 10), title, fill="#EDEAE4", font=title_font)
    canvas.save(out, quality=92, subsampling=0, optimize=True)


def main():
    work = Path(tempfile.mkdtemp(prefix="thumbnail-ctr-review-"))
    old = work / "renderer_before.py"
    old.write_text(subprocess.run(["git", "-C", str(REPO), "show", f"{BASE}:src/lib/thumbnail/renderer.py"], check=True, capture_output=True, text=True).stdout)
    new = REPO / "src/lib/thumbnail/renderer.py"
    titles = lambda name: [spec["title"] for spec in json.loads((DOCS / name).read_text())]

    before, after = render(old, DOCS / "before.json", work), render(new, DOCS / "after.json", work)
    sheet([before, after], ["Before", "After"], [titles("before.json"), titles("after.json")], DOCS / "before-after.jpg")

    labels = ["A · headline", "B · visual-only", "C · question / verdict"]
    package = [render(old, DOCS / "package-before.json", work), render(new, DOCS / "package-after.json", work)]
    columns = [[package[0][i], package[1][i]] for i in range(3)]
    package_titles = [[a, b] for a, b in zip(titles("package-before.json"), titles("package-after.json"))]
    sheet(columns, labels, package_titles, DOCS / "package-before-after.jpg", tile=(480, 270))
    # Phone-size preview: YouTube's mobile home feed shows thumbnails ~ 360 px wide.
    phone = Image.new("RGB", (2 * 360 + 3 * 16, len(before) * (203 + 16) + 16), "#141414")
    for r, (b, a) in enumerate(zip(before, after)):
        phone.paste(b.resize((360, 203), Image.Resampling.LANCZOS), (16, 16 + r * 219))
        phone.paste(a.resize((360, 203), Image.Resampling.LANCZOS), (392, 16 + r * 219))
    phone.save(DOCS / "phone-size.jpg", quality=92, optimize=True)
    print(f"Renders: {work}")


if __name__ == "__main__":
    main()
