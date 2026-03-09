FROM manimcommunity/manim:stable

USER root

RUN apt-get update && apt-get install -y \
    build-essential \
    ffmpeg \
    latexmk \
    dvisvgm \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-science \
    texlive-xetex \
    portaudio19-dev \
    python3-pyaudio \
    sox \
    libsox-fmt-all \
    gettext \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv directly into /usr/local/bin
RUN curl -Ls https://astral.sh/uv/install.sh | sh && \
    mv $HOME/.local/bin/uv /usr/local/bin/uv

# verify
RUN uv --version

# Install torch CPU (needed for whisper)
RUN uv pip install \
    torch \
    torchaudio \
    --index-url https://download.pytorch.org/whl/cpu

# setuptools>=77 for PEP 639 license support (evdev), <78 to keep pkg_resources (openai-whisper)
RUN uv pip install "setuptools>=77,<78" wheel

# Override openai-whisper version pin from manim-voiceover (20230314 is incompatible with Python 3.14)
RUN echo "openai-whisper>=20231117" > /tmp/overrides.txt && \
    uv pip install --no-build-isolation --override /tmp/overrides.txt \
    openai-whisper \
    stable-ts \
    "manim-voiceover[all]" \
    moviepy \
    opencv-python \
    manim-fonts

ENV MANIM_TEX_COMPILER=pdflatex
RUN ln -sf $(which pdflatex) /usr/bin/latex