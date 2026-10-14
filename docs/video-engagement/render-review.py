"""Render the video engagement before/after scenes and build review images.

Run from the repo root: python3 docs/video-engagement/render-review.py
Requires Manim, XeLaTeX, dvisvgm, ffmpeg and Pillow. Both variants use this
branch's house-style module and the same palette, so the comparison isolates
what the new prompt rules ask the generator to draw.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent
TOPICS = ["Monty", "Primes", "Chaos"]
# Moments to sample (seconds): opening, middle, the composition it ends on.
TIMES = [0.6, 0.45, 0.98]


def run(args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def duration(video):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                         check=True, capture_output=True, text=True).stdout
    return float(out)


def frame(video, seconds, path):
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{seconds:.3f}", "-i", str(video), "-frames:v", "1", str(path)])
    return Image.open(path).convert("RGB")


def main():
    work = Path(tempfile.mkdtemp(prefix="video-engagement-"))
    style = work / "style"
    (style / "eduvids-fonts").mkdir(parents=True)
    module = (REPO / "src/lib/thumbnail/video_style.py").read_text()
    (style / "eduvids_style.py").write_text(module.replace("__EDUVIDS_PALETTE__", "azure-coral").replace("__EDUVIDS_WATERMARK__", ""))
    for font in (REPO / "src/lib/thumbnail/fonts").glob("*.otf"):
        shutil.copy(font, style / "eduvids-fonts" / font.name)
    shutil.copy(DOCS / "scenes.py", style / "scenes.py")
    font = ImageFont.truetype(str(REPO / "src/lib/thumbnail/fonts/cmunrm.otf"), 30)
    small = ImageFont.truetype(str(REPO / "src/lib/thumbnail/fonts/cmunrm.otf"), 22)
    w, h, gap, label_w = 400, 225, 10, 120
    sheets = []
    for topic in TOPICS:
        rows = []
        for variant in ("Before", "After"):
            scene = f"{topic}{variant}"
            run(["python3", "-m", "manim", "-qm", "--disable_caching", "--media_dir", str(work / "media"), "scenes.py", scene],
                cwd=style, stdout=subprocess.DEVNULL)
            video = next((work / "media").rglob(f"{scene}.mp4"))
            length = duration(video)
            # Opening frame at a fixed second: what a viewer sees before deciding to stay.
            moments = [min(1.0, length * 0.2), length * 0.5, length - 0.1]
            rows.append([frame(video, t, work / f"{scene}-{i}.png").resize((w, h), Image.Resampling.LANCZOS) for i, t in enumerate(moments)])
            gif = [frame(video, t, work / f"{scene}-g{i}.png").resize((480, 270), Image.Resampling.LANCZOS)
                   for i, t in enumerate([k * 0.25 for k in range(int(length / 0.25))])]
            gif[0].save(work / f"{scene}.gif", save_all=True, append_images=gif[1:], duration=250, loop=0)
        sheet = Image.new("RGB", (label_w + 3 * (w + gap), 44 + 2 * (h + gap)), "#141414")
        draw = ImageDraw.Draw(sheet)
        for c, name in enumerate(["first second", "midway", "final frame"]):
            draw.text((label_w + c * (w + gap), 10), name, fill="#8A8F98", font=small)
        for r, (variant, row) in enumerate(zip(("before", "after"), rows)):
            y = 44 + r * (h + gap)
            draw.text((12, y + h // 2 - 16), variant, fill="#EDEAE4", font=font)
            for c, image in enumerate(row):
                sheet.paste(image, (label_w + c * (w + gap), y))
        sheets.append(sheet)
        # Side-by-side GIF of the whole scene: before on the left, after on the right.
        before = Image.open(work / f"{topic}Before.gif")
        after = Image.open(work / f"{topic}After.gif")
        frames = []
        for index in range(max(before.n_frames, after.n_frames)):
            pair = Image.new("RGB", (970, 270), "#141414")
            before.seek(min(index, before.n_frames - 1))
            after.seek(min(index, after.n_frames - 1))
            pair.paste(before.convert("RGB"), (0, 0))
            pair.paste(after.convert("RGB"), (490, 0))
            frames.append(pair.quantize(colors=128))
        frames[0].save(DOCS / f"{topic.lower()}-before-after.gif", save_all=True, append_images=frames[1:], duration=250, loop=0, optimize=True)
    total = Image.new("RGB", (sheets[0].width, sum(s.height for s in sheets) + 16 * (len(sheets) - 1)), "#0E0E0E")
    y = 0
    for sheet in sheets:
        total.paste(sheet, (0, y))
        y += sheet.height + 16
    total.save(DOCS / "storyboards.jpg", quality=90, optimize=True)
    print(f"Renders: {work}")


if __name__ == "__main__":
    main()
