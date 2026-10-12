# Render benchmark

`harness.ts` times the production render path on this machine: the real
`prepareManimSandbox`, render job (`render_driver.py`) and postprocess, run
against a local stand-in for the E2B sandbox. Narration comes from
`narration.py`, which writes tone clips with realistic lengths where the TTS
adapter looks them up, so no provider is called.

```sh
# Toolchain (Debian/Ubuntu); a venv keeps Manim off the system Python.
apt-get install -y ffmpeg sox libsox-fmt-mp3 libcairo2-dev libpango1.0-dev pkg-config \
  texlive-xetex texlive-latex-extra texlive-science dvisvgm
python3 -m venv ~/manim-venv && ~/manim-venv/bin/pip install "manim==0.20.*" manim-voiceover gtts

# `python` must be the venv's interpreter (a wrapper script, not a symlink,
# so the venv is detected), and the house style must be importable.
export PATH=$HOME/bench-bin:$HOME/manim-venv/bin:$PATH   # bench-bin/python: exec ~/manim-venv/bin/python "$@"
export PYTHONPATH=$(python -c "import site; print(site.getusersitepackages())"):/home/user
export DEEPGRAM_API_KEY=bench   # selects the provider whose clips narration.py writes

npx tsx scripts/bench/harness.ts scripts/bench/sample-video.py /tmp/bench.json
```

The harness writes sandbox files under `/home/user` (as E2B does) and prints
per-stage timings, the driver's log and the output's duration and size.

- `taskset -c 0,1 npx tsx …` limits the run to two CPUs.
- `BENCH_MEM_MB=800` makes the driver see 800 MB free (a 1 GB sandbox), which
  sets how many scenes render at once.
- Point it at any generated script to measure a new scene type.

`sample-video.py` is a seven-scene, ~2 minute video in the generator's style:
graphs with live trackers, formulas, geometry and a lit 3D surface.
