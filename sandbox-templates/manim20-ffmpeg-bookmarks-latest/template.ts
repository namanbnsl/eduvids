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

    "fonts-ebgaramond",

    "git",
    "curl",
    "wget",
  ])
  .runCmd(
    `
pip install --upgrade pip setuptools wheel

# ✅ lock numpy
pip install numpy==1.26.4

# ✅ torch stack
pip install \
  torch==2.2.2 \
  torchvision==0.17.2 \
  torchaudio==2.2.2 \
  --index-url https://download.pytorch.org/whl/cpu

# deps compatible with numpy 1.x
pip install numba==0.59.1 llvmlite==0.42.0

pip install tqdm more-itertools tiktoken

# whisper
pip install git+https://github.com/openai/whisper.git

# ✅ install manim normally but prevent numpy upgrade
pip install manim --constraint <(echo "numpy==1.26.4")

# voiceover stack
pip install manim-voiceover[gtts] stable-ts --constraint <(echo "numpy==1.26.4")

# verify
python - <<EOF
import numpy, torch, torchaudio
print("numpy", numpy.__version__)
print("torch", torch.__version__)
print("torchaudio", torchaudio.__version__)
EOF
`,
  );
