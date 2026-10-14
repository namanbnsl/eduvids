# eduvids-render: the E2B render sandbox

Every video renders in an E2B sandbox built from this template. It holds:

- Python 3.12, Manim Community 0.22.0 (Cairo renderer, PyAV 19) and numpy 2
- manim-voiceover 0.4.0 and gTTS (the fallback narration service)
- XeLaTeX, dvisvgm and the TeX Live packages formulas need
- ffmpeg and SoX

The house style (`src/lib/thumbnail/video_style.py`) and the render driver are
written into each sandbox at render time, so changing them needs no rebuild.

Versions are pinned. The house style hooks into Manim internals that change
between releases (0.22 replaced the movie writer), so bump the versions
together and run the tests below before building.

## Building

```bash
cd sandbox-templates/eduvids-render
npm install e2b
E2B_API_KEY=... npm run e2b:build:prod
```

This builds the template `eduvids-manim22` at 2 vCPU / 1 GB. Set
`E2B_TEMPLATE_CPU_COUNT` and `E2B_TEMPLATE_MEMORY_MB` for a larger sandbox; the
render driver adapts to whatever it gets.

The app creates sandboxes from `eduvids-manim22` (`SANDBOX_TEMPLATE` in
`src/lib/e2b.ts`). Set `E2B_SANDBOX_TEMPLATE` to use another build, such as a
previous one, without a deploy. When you bump versions, build under a new name,
test it, then change the default.

## Testing a new build locally

Install the same versions in a virtualenv (`pip install manim==0.22.0
manim-voiceover==0.4.0 gTTS==2.5.4`, plus the apt packages in `template.ts`),
put it first on `PATH` and run:

- `npm test`: the Manim tests render real scenes, split scenes and narration
  through the house style; they skip when Manim is not installed.
- `scripts/bench`: the production prepare, render driver and postprocess on a
  two-minute sample video (see `scripts/bench/README.md`).

## History

Until October 2026 the template was `manim20-ffmpeg-bookmarks-latest`:
Python 3.11 with Whisper, torch 2.2 and stable-ts for voiceover bookmarks.
Their numpy 1.26 pin held Manim at 0.18.1, which encodes through an ffmpeg pipe
with none of the house style's encoder settings, and two of those encoders
overran the 1 GB sandbox. Bookmarks are not used (the prompts forbid them and
the narration service disables transcription), so they were dropped.
