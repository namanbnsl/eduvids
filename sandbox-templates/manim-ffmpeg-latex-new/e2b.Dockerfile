FROM manimcommunity/manim:stable

USER root

RUN apt-get update && apt-get install -y ffmpeg latexmk dvisvgm texlive-latex-base texlive-latex-extra texlive-fonts-recommended texlive-fonts-extra texlive-science

RUN which latex
RUN latex --version

ENV MANIM_TEX_COMPILER=pdflatex
RUN ln -sf $(which pdflatex) /usr/bin/latex
