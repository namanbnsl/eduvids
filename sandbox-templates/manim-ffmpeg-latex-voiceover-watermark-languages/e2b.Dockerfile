FROM manimcommunity/manim:stable

USER root

RUN apt-get update && apt-get install -y ffmpeg latexmk dvisvgm texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra texlive-science portaudio19-dev python3-pyaudio sox libsox-fmt-all gettext texlive-xetex

RUN which latex
RUN latex --version

# Default to pdflatex, but can be overridden with MANIM_TEX_COMPILER environment variable
ENV MANIM_TEX_COMPILER=pdflatex
RUN ln -sf $(which pdflatex) /usr/bin/latex

# Ensure XeLaTeX is available for multilingual support
RUN which xelatex
RUN xelatex --version

RUN pip install --upgrade "manim-voiceover[all]" moviepy opencv-python