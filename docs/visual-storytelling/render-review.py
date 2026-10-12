"""Render the before/after storytelling fixtures and build review images.

Run from the repo root: python3 docs/visual-storytelling/render-review.py
Requires Manim 0.20, XeLaTeX, dvisvgm, ffmpeg and Pillow. Both variants use
the current house-style module, so the comparison isolates what the prompts
ask the generator to draw. Narration is timed offline by manim_voiceover.py
(about 2.6 words per second); no TTS or model API is called. Full-resolution
MP4s stay in the printed working directory; only compact JPEG storyboards and
GIFs are copied here.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent
TOPICS = ["Atom", "Bayes", "Sun", "Current"]
FONT = REPO / "src/lib/thumbnail/fonts/cmunrm.otf"


def run(args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def frame_at(video, seconds, destination):
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(seconds, 0):.3f}", "-i", str(video),
         "-frames:v", "1", str(destination)])
    return Image.open(destination).convert("RGB")


def storyboard(topic, videos, beats, work):
    """Two rows (before, after), one column per narration beat, each frame
    taken just before the beat ends, when its action has played out."""
    from narration import ATOM, BAYES, SUN, CURRENT  # noqa: E402
    lines = {"Atom": ATOM, "Bayes": BAYES, "Sun": SUN, "Current": CURRENT}[topic]
    width = 480
    rows = []
    for variant in ("before", "after"):
        spans = [b for b in beats if b["scene"] == f"{topic}{variant.title()}"]
        frames = [frame_at(videos[variant], b["end"] - 0.15, work / f"{topic}-{variant}-{i}.png")
                  for i, b in enumerate(spans)]
        rows.append([f.resize((width, width * f.height // f.width), Image.Resampling.LANCZOS) for f in frames])
    cell_h = rows[0][0].height
    caption_h, label_w, gap = 64, 120, 8
    sheet = Image.new("RGB", (label_w + len(lines) * (width + gap), caption_h + 2 * (cell_h + gap)), "#141414")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(str(FONT), 19)
    label = ImageFont.truetype(str(FONT), 30)
    for column, line in enumerate(lines):
        x = label_w + column * (width + gap)
        words, wrapped, current = line.split(), [], ""
        for word in words:
            trial = f"{current} {word}".strip()
            if draw.textlength(trial, font=font) > width - 12:
                wrapped.append(current)
                current = word
            else:
                current = trial
        wrapped.append(current)
        draw.multiline_text((x + 6, 6), "\n".join(wrapped[:2]), font=font, fill="#B8B4AC", spacing=4)
    for row, (name, colour) in enumerate((("Before", "#FC6255"), ("After", "#83C167"))):
        y = caption_h + row * (cell_h + gap)
        draw.text((14, y + cell_h // 2 - 18), name, font=label, fill=colour)
        for column, image in enumerate(rows[row]):
            sheet.paste(image, (label_w + column * (width + gap), y))
    sheet.save(DOCS / f"{topic.lower()}-storyboard.jpg", quality=88, optimize=True)


def side_by_side(topic, videos):
    run(["ffmpeg", "-y", "-v", "error", "-i", str(videos["before"]), "-i", str(videos["after"]), "-filter_complex",
         "[0]fps=10,scale=480:-1:flags=lanczos,tpad=stop_mode=clone:stop_duration=30[a];"
         "[1]fps=10,scale=480:-1:flags=lanczos,tpad=stop_mode=clone:stop_duration=30[b];"
         "[a][b]hstack=inputs=2,trim=duration=" + str(duration(videos)) + ",split[x][y];"
         "[x]palettegen=max_colors=64:stats_mode=diff[p];[y][p]paletteuse=dither=none:diff_mode=rectangle",
         str(DOCS / f"{topic.lower()}-before-after.gif")])


def duration(videos):
    return max(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                              "-of", "csv=p=0", str(v)], text=True)) for v in videos.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path)
    parser.add_argument("--topics", nargs="+", choices=TOPICS, default=TOPICS)
    args = parser.parse_args()
    root = args.workdir or Path(tempfile.mkdtemp(prefix="eduvids-storytelling-"))
    print(f"Full-resolution renders: {root}", flush=True)
    style = root / "style"
    style.mkdir(parents=True, exist_ok=True)
    module = (REPO / "src/lib/thumbnail/video_style.py").read_text()
    (style / "eduvids_style.py").write_text(module.replace("__EDUVIDS_PALETTE__", "azure-coral").replace("__EDUVIDS_WATERMARK__", ""))
    shutil.copytree(REPO / "src/lib/thumbnail/fonts", style / "eduvids-fonts", dirs_exist_ok=True)
    log = root / "beats.jsonl"
    log.unlink(missing_ok=True)
    env = dict(os.environ, PYTHONPATH=f"{style}{os.pathsep}{DOCS}", EDUVIDS_BEAT_LOG=str(log))
    videos = {}
    for variant in ("before", "after"):
        scenes = [f"{topic}{variant.title()}" for topic in args.topics]
        run(["python3", "-m", "manim", str(DOCS / f"scenes_{variant}.py"), *scenes, "--media_dir", str(root / "media"),
             "--disable_caching", "-qh", "--fps", "30"], cwd=root, env=env)
        for scene in scenes:
            videos[scene] = next((root / "media/videos").glob(f"scenes_{variant}/*/{scene}.mp4"))
    beats = [json.loads(line) for line in log.read_text().splitlines()]
    import sys
    sys.path.insert(0, str(DOCS))
    for topic in args.topics:
        pair = {"before": videos[f"{topic}Before"], "after": videos[f"{topic}After"]}
        storyboard(topic, pair, beats, root)
        side_by_side(topic, pair)
        print(f"{topic}: storyboard and GIF written", flush=True)


if __name__ == "__main__":
    main()
