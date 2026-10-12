# Render performance

Measured with `scripts/bench/harness.ts`. It runs the real prepare, render job
and postprocess code on a seven-scene, 126 s, 1080p30 sample video
(`scripts/bench/sample-video.py`): graphs with live readouts, formulas,
geometry and a lit 3D surface. Narration uses tone clips of realistic length.
Before is `696bf4e` (main). Both sides ran back to back on the same machine.

![Render time before and after](render-times.png)

| Setup | Before | After |
| --- | --- | --- |
| Today's sandbox (2 vCPU, 1 GB) | 348.7 s | 177.7 s (2.0×) |
| 4 vCPU (resized sandbox) | 268.7 s | 76.9 s (3.5×) |
| One 48×48 lit surface scene, 16 s (2 vCPU) | 426.5 s | 127.0 s (3.4×) |
| Peak memory per render process | 0.75–1 GB | ~445 MB |
| Script error raised during an animation | hung until the 30 min job timeout | fails in ~3 s |

The production template builds with the E2B SDK defaults (2 vCPU, 1 GB). Only
one render fits in that, so scenes rendered one after another. The template now
asks for 8 vCPU / 8 GB. It takes effect once the template is rebuilt:
`npm run e2b:build:prod` in `sandbox-templates/manim20-ffmpeg-bookmarks-latest`.
Set `E2B_TEMPLATE_CPU_COUNT` and `E2B_TEMPLATE_MEMORY_MB` to match your plan.
The driver uses whatever the sandbox has.

## Same picture

![Frames from the old and new pipeline](frames-before-after.jpg)

Left is before, right is after, at 12 s, 50 s and 100 s of the final videos
(56–58 dB PSNR between them).

- The 3D batching and the faster path drawing are pixel-identical to Manim's own
  drawing, checked over four camera angles and 2,813 decoded frames.
- A held frame converted once decodes identically to converting it every frame.
- Encoding is x264 superfast at CRF 17 instead of medium at CRF 18. Against a
  lossless render that matches or slightly beats the old quality (SSIM 0.99982,
  PSNR 60.6 vs 59.8 dB). Files are about twice the size, around 0.75 Mbit/s.
- Split scenes join with the same frame count, timestamps and soundtrack as a
  whole render (`tests/render-segments.py`).

## Where the time went

| Change | Effect |
| --- | --- |
| Batched 3D lighting, projection and drawing | A lit surface spent most of each frame in per-patch Python; now 2.3–3.4× faster |
| x264 superfast at CRF 17 | 35% less encoder CPU, half its memory, same quality |
| Bounded frame queue | Manim could queue ~1 GB of 8 MB frames for x264 |
| Held frames converted once | Narration holds converted the same frame to YUV for every frame |
| One process per scene, longest first, per usable CPU | Replaces fixed groups split up front, which left cores idle |
| Long scenes split by frame range | A 3D camera move no longer runs on one core while the rest wait |
| Postprocess inside the render job | One launch and poll fewer, and scene audio decodes in parallel |
| Poll every 2 s on one connection | A finished job waited up to 10 s to be noticed |
| Titles, description and thumbnails during the render | They used to wait for the upload |
| Parallel steps and fewer round trips before the render | Language, scene plan and previous video run together |
