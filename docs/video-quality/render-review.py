"""Render real Manim before/after frames and motion, without paid services.

Run from the repo root: python3 docs/video-quality/render-review.py
Requires Manim 0.20, XeLaTeX, dvisvgm and ffmpeg. The historical baseline is
the exact shipped house module at 4de946a. Output stays in /tmp; only the
small PNG/GIF review artifacts are copied into this directory.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).resolve().parent


def run(args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def review_image(source, destination):
    image = Image.open(source).convert("RGB")
    image.thumbnail((1440, 1440), Image.Resampling.LANCZOS)
    image.save(destination, quality=95, subsampling=0, optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path)
    parser.add_argument("--stills-only", action="store_true")
    parser.add_argument("--variants", nargs="+", choices=("before", "after"), default=["before", "after"])
    args = parser.parse_args()
    root = args.workdir or Path(tempfile.mkdtemp(prefix="eduvids-review-"))
    print(f"Full-resolution renders: {root}", flush=True)
    for variant in args.variants:
        folder = root / variant
        folder.mkdir(parents=True, exist_ok=True)
        module = subprocess.check_output(["git", "show", "4de946a:src/lib/thumbnail/video_style.py"], cwd=REPO, text=True) if variant == "before" else (REPO / "src/lib/thumbnail/video_style.py").read_text()
        (folder / "eduvids_style.py").write_text(module.replace("__EDUVIDS_PALETTE__", "azure-coral").replace("__EDUVIDS_WATERMARK__", ""))
        shutil.copytree(REPO / "src/lib/thumbnail/fonts", folder / "eduvids-fonts", dirs_exist_ok=True)
        shutil.copyfile(DOCS / "scenes.py", folder / "scenes.py")
        env = dict(os.environ, PYTHONPATH=str(folder))
        scenes = ["Derivative", "WaveSurface", "NestedLabels"]
        # Same resolution on both sides isolates material and layout changes.
        base = ["python3", "-m", "manim", "scenes.py", "--media_dir", str(folder / "media"), "--disable_caching", "-qh", "--fps", "30"]
        run(base + ["-s", *scenes], cwd=folder, env=env)
        for scene in scenes:
            png = folder / f"media/images/scenes/{scene}_ManimCE_v0.20.1.png"
            matches = list((folder / "media/images/scenes").glob(f"{scene}*.png"))
            review_image(matches[0] if matches else png, DOCS / f"{scene.lower()}-{variant}.jpg")
        if not args.stills_only:
            run(base + ["Derivative", "WaveSurface"], cwd=folder, env=env)
            for scene in scenes[:2]:
                video = next((folder / "media/videos/scenes").glob(f"*/{scene}.mp4"))
                run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-filter_complex",
                     "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer",
                     str(DOCS / f"{scene.lower()}-{variant}.gif")])
    # Portrait is explicitly reviewed with the new layout helpers.
    folder = root / "after"
    env = dict(os.environ, PYTHONPATH=str(folder))
    run(["python3", "-m", "manim", "scenes.py", "Derivative", "WaveSurface", "-s", "-qh", "--fps", "30", "-r", "1080,1920",
         "--media_dir", str(folder / "portrait")], cwd=folder, env=env)
    for scene in ("Derivative", "WaveSurface"):
        png = next((folder / "portrait/images/scenes").glob(f"{scene}*.png"))
        review_image(png, DOCS / f"{scene.lower()}-portrait.jpg")


if __name__ == "__main__":
    main()
