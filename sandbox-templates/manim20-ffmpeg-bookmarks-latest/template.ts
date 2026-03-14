import { Template } from "e2b";

export const template = Template()
  .fromImage("python:3.11-bookworm")

  .aptInstall([
    "ffmpeg",

    "build-essential",
    "pkg-config",
    "libcairo2-dev",
    "libpango1.0-dev",
    "libffi-dev",
    "python3-dev",

    "latexmk",
    "dvisvgm",
    "texlive-latex-base",
    "texlive-latex-extra",
    "texlive-fonts-recommended",
    "texlive-fonts-extra",
    "texlive-science",
    "texlive-xetex",

    "sox",
    "libsox-fmt-all",
    "portaudio19-dev",
    "python3-pyaudio",

    "git",
    "curl",
    "wget",
  ]).runCmd(`
pip install --upgrade pip setuptools wheel

# torch cpu
pip install torch --index-url https://download.pytorch.org/whl/cpu

# whisper deps
pip install \
  numba \
  llvmlite \
  numpy \
  tqdm \
  more-itertools \
  tiktoken

pip install git+https://github.com/openai/whisper.git

# manim
pip install manim

# voiceover
pip install manim-voiceover[gtts] manim-fonts
`);
