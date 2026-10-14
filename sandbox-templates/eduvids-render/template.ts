import { Template } from "e2b";

// The render sandbox: Manim Community with the Cairo renderer, XeLaTeX for
// formulas, and manim-voiceover with the narration services eduvids uses
// (Deepgram / OpenRouter over HTTP, gTTS as the fallback).
//
// Versions are pinned so a rebuild installs exactly what was tested:
// src/lib/thumbnail/video_style.py hooks into Manim internals that change
// between releases (0.22 rewrote the movie writer). Bump them together and
// run the render tests (see README.md) before switching the app over.
//
// No Whisper/torch: transcription only serves voiceover bookmarks, which the
// prompts do not use, and it pinned numpy to 1.x (and so Manim to 0.18).
export const template = Template()
  .fromImage("python:3.12-bookworm")

  .aptInstall([
    "ffmpeg",

    "build-essential",
    "pkg-config",
    "libcairo2-dev",
    "libpango1.0-dev",
    "libffi-dev",

    "latexmk",
    "dvisvgm",
    "texlive-latex-base",
    "texlive-latex-extra",
    "texlive-fonts-recommended",
    "texlive-fonts-extra",
    "texlive-science",
    "texlive-xetex",

    // manim-voiceover adjusts narration speed with SoX.
    "sox",
    "libsox-fmt-all",

    "fonts-ebgaramond",

    "git",
    "curl",
    "wget",
  ])
  .runCmd(
    `
set -e
pip install --no-cache-dir --upgrade pip setuptools wheel
pip install --no-cache-dir \\
  manim==0.22.0 \\
  manim-voiceover==0.4.0 \\
  gTTS==2.5.4

python - <<PY
import importlib.metadata as metadata
from manim.scene.video_segment_encoder import VideoSegmentEncoder
from manim_voiceover import VoiceoverScene
from gtts import gTTS
for name in ("manim", "manim-voiceover", "av", "numpy", "gTTS"):
    print(name, metadata.version(name))
PY
`,
  );
