FROM manimcommunity/manim:stable

USER root

RUN apt-get update && apt-get install -y ffmpeg latexmk dvisvgm texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra texlive-science portaudio19-dev python3-pyaudio sox libsox-fmt-all gettext

RUN which latex
RUN latex --version

ENV MANIM_TEX_COMPILER=pdflatex
RUN ln -sf $(which pdflatex) /usr/bin/latex

RUN pip install --upgrade "manim-voiceover[all]"