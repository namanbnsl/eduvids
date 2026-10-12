#!/usr/bin/env python3
"""Pick the most thumbnail-worthy frames from a finished eduvids video.

    frame_picker.py --video final.mp4 --out-dir frames --count 2

Samples the video at low resolution, scores each moment, and exports the
best few at full resolution, cropped to their content. Writes frames.json:
``[{"path": ..., "time": ..., "score": ...}, ...]``, best first.

A good thumbnail frame is colourful, fills the frame with a visual rather
than a line of copy, and is caught at rest rather than mid-transition. The
scene title band at the top, the watermark corner, the first moments and
the end card are ignored: the thumbnail sets its own headline.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np

SAMPLE_FPS = 1.0
SAMPLE_W, SAMPLE_H = 256, 144
HEADER_BAND = 0.2      # scene titles live in the top fifth of the frame
SKIP_START = 1.5       # seconds; scenes open on an empty canvas
SKIP_END = 12.0        # seconds; the end card
MIN_GAP = 8.0          # seconds between picked frames
CONTENT_LUMA = 38      # brighter than the flat canvas (BG)


def probe_duration(video: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def sample_frames(video: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={SAMPLE_FPS},scale={SAMPLE_W}:{SAMPLE_H}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout
    frames = np.frombuffer(raw, dtype=np.uint8)
    return frames[: len(frames) // (SAMPLE_W * SAMPLE_H * 3) * SAMPLE_W * SAMPLE_H * 3].reshape(-1, SAMPLE_H, SAMPLE_W, 3)


def region_mask(h: int, w: int) -> np.ndarray:
    mask = np.ones((h, w), dtype=bool)
    mask[: int(h * HEADER_BAND)] = False
    mask[int(h * 0.88):, int(w * 0.8):] = False  # watermark
    return mask


def luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def colourfulness(rgb: np.ndarray) -> float:
    """Hasler and Süsstrunk's colourfulness, over content pixels only."""
    if not len(rgb):
        return 0.0
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))


def score_frames(frames: np.ndarray) -> np.ndarray:
    mask = region_mask(SAMPLE_H, SAMPLE_W)
    rows_in, cols_in = mask.any(axis=1).sum(), mask.any(axis=0).sum()
    data = frames.astype(np.float32)
    scores = np.zeros(len(frames), dtype=np.float32)
    for index, frame in enumerate(data):
        content = (luma(frame) > CONTENT_LUMA) & mask
        area = content.sum() / mask.sum()
        if area < 0.02:
            continue
        chroma = colourfulness(frame[content])
        # A line of copy is a thin band; a visual spreads across the frame.
        spread = (content.any(axis=1).sum() / rows_in) * (content.any(axis=0).sum() / cols_in)
        stability = 1.0
        for other in (index - 1, index + 1):
            if 0 <= other < len(data):
                change = np.abs(data[other][mask] - frame[mask]).mean() / 255
                stability = min(stability, max(0.0, 1 - change * 12))
        scores[index] = (chroma + 4) * np.sqrt(min(area, 0.45)) * (0.3 + 0.7 * min(1.0, spread * 2)) * (0.25 + 0.75 * stability)
    return scores


def pick(scores: np.ndarray, duration: float, count: int) -> list[int]:
    times = np.arange(len(scores)) / SAMPLE_FPS
    valid = (times >= SKIP_START) & (times <= max(SKIP_START, duration - SKIP_END))
    order = [i for i in np.argsort(-scores) if valid[i] and scores[i] > 0]
    chosen: list[int] = []
    for index in order:
        if all(abs(times[index] - times[other]) >= MIN_GAP for other in chosen):
            chosen.append(int(index))
        if len(chosen) == count:
            break
    return chosen


def export(video: str, seconds: float, out_path: str) -> bool:
    """Grab the frame at full size and crop it to its content."""
    from PIL import Image

    raw_path = out_path + ".raw.png"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", f"{seconds:.3f}", "-i", video, "-frames:v", "1", raw_path],
        check=True,
    )
    image = Image.open(raw_path).convert("RGB")
    os.remove(raw_path)
    rgb = np.asarray(image, dtype=np.float32)
    h, w = rgb.shape[:2]
    mask = region_mask(h, w)
    content = (luma(rgb) > CONTENT_LUMA) & mask
    rows, cols = np.nonzero(content)
    if len(rows) < 50:
        return False
    # Robust bounds: ignore stray pixels (a lone axis tick far from the visual).
    y0, y1 = np.percentile(rows, [0.5, 99.5]).astype(int)
    x0, x1 = np.percentile(cols, [0.5, 99.5]).astype(int)
    pad = int(0.06 * h)
    y0, y1 = max(int(h * HEADER_BAND), y0 - pad), min(h, y1 + pad)
    x0, x1 = max(0, x0 - pad), min(w, x1 + pad)
    # Keep a landscape-ish window so the thumbnail column is filled.
    min_w = int((y1 - y0) * 0.9)
    if x1 - x0 < min_w:
        grow = (min_w - (x1 - x0)) // 2
        x0, x1 = max(0, x0 - grow), min(w, x1 + grow)
    image.crop((x0, y0, x1, y1)).save(out_path, optimize=True)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--count", type=int, default=2)
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    results = []
    try:
        duration = probe_duration(args.video)
        frames = sample_frames(args.video)
        scores = score_frames(frames)
        for rank, index in enumerate(pick(scores, duration, args.count * 2)):
            if len(results) == args.count:
                break
            seconds = index / SAMPLE_FPS
            path = os.path.abspath(os.path.join(args.out_dir, f"frame-{rank}.png"))
            if export(args.video, seconds, path):
                results.append({"path": path, "time": round(seconds, 2), "score": round(float(scores[index]), 2)})
    except (subprocess.CalledProcessError, OSError, ValueError) as error:
        print(f"frame picker failed: {error}", file=sys.stderr)
    with open(os.path.join(args.out_dir, "frames.json"), "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2)
    print(json.dumps(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
