# Visual storytelling review

Each pair uses the same narration. **Before** is written to the previous
prompt's templates: header, `layout_scene`, a hero formula, `pop_in` and
`pulse`. **After** is written to the new prompt's visual devices and
helpers. Both use the current house style, so fonts, palette and canvas are
identical. The only difference is how the idea is shown.

These scenes are representative fixtures, not regenerated user videos. They
were written by hand to each prompt's instructions, because no generation
model or API key was available here. Production output also depends on how
well the generator follows the new prompt.

## Atom: a population first, then one, then inside it

A grain of salt dissolves into a sodium–chlorine lattice of 2,400 atoms. The
view zooms into one atom while the scale bar goes from 1 mm to 1 nm to
0.1 nm. The atom's neighbours dim, and the dot opens into a sodium atom
with 11 electrons on three shells. Its nucleus then sorts itself into
11 protons and 12 neutrons.

![Atom storyboard](atom-storyboard.jpg)
![Atom before and after](atom-before-after.gif)

## Bayes: make "out of N" countable

The before version is a chain of conditional probabilities. The after
version shows 1,000 people. The 10 who are sick light up and are all
caught, and then 10 healthy false positives join them, so the 50% answer
is something you can count.

![Bayes storyboard](bayes-storyboard.jpg)
![Bayes before and after](bayes-before-after.gif)

## Sun: true scale, then zoom into the speck

The Earth is drawn at 1/109 of the Sun's width, a speck you need an arrow
to find. The view then zooms into that speck until it becomes the globe.

![Sun storyboard](sun-storyboard.jpg)
![Sun before and after](sun-before-after.gif)

## Circuit: follow one particle

Electrons stream around the loop. One of them is followed while the rest
of the picture dims and the view zooms in on its slow drift. The view then
pulls back out to show every electron moving at once.

![Circuit storyboard](current-storyboard.jpg)
![Circuit before and after](current-before-after.gif)

## What changed

- **Prompts:**
  - The narrator writes for pictures: it anchors in a real object, travels
    through scale, makes numbers countable, opens things up and follows one
    particle.
  - The planner gives every scene a `visualDevice` and a `storyboard`, and
    can plan `population` and `prop` elements.
  - The animator gets a template for each device.
- **Helpers in `eduvids_style`:**
  - Devices: `crowd`, `zoom_to`, `reveal_detail`, `scale_bar`,
    `spotlight`/`release`, `explode`/`assemble`, `flow`, `to_scale` and
    `ghost`.
  - Props: `atom`, `molecule`, `person`, `die` and `cell`.
- **Render cost:**
  - A crowd is a single path, so thousands of members are one draw call.
  - A zoom transforms points in place and stops drawing members that leave
    the frame or would cross the title or caption lanes.
  - At 1080p30 on 4 cores (single process), before → after: atom 33 → 55 s,
    Bayes 31 → 52 s, Sun 20 → 22 s, circuit 21 → 30 s.

## Reproduce

```sh
python3 docs/visual-storytelling/render-review.py
npm test
```

You need Manim 0.20, XeLaTeX, dvisvgm, ffmpeg and Pillow. `manim_voiceover.py`
here is an offline stand-in that times each beat at about 2.6 words per
second, so no TTS or model API is called. Full-resolution MP4s stay in the
printed working directory.
