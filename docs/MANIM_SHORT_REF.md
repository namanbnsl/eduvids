# Manim (Community) Short Reference — for LLM context

Version note: this summary is based on Manim Community Edition docs (stable, v0.19.x series). Use these names and properties as authoritative; avoid inventing new API members.

## Purpose
A compact, factual reference for two LLM roles: a verifier model (checks generated Manim code) and a script-generator model (writes Manim scenes). Include only well-documented classes, common methods, parameter shapes, and common pitfalls.

## Quick glossary
- Scene: the canvas. User code typically subclasses `Scene` and implements `construct(self)`.
- Mobject: base drawable object. Common attributes: `.submobjects`, `.points`, `.color`, `.width`, `.height`, `.depth`, `.z_index`.
- VMobject: vectorized Mobject (paths/beziers). Extra attributes/methods for paths (anchors/handles, `set_fill`, `set_stroke`).
- Animation: base animation class (fixed runtime). Many helpers exist (Create, Transform, FadeOut, Rotate, etc.).

## Scene (key facts)
- Typical usage: subclass `Scene` and implement `construct(self)`.
- Display mobjects with `self.add(mobject)` and animate with `self.play(...)`.
- Common methods/args:
  - `play(*anims, run_time=None, rate_func=None, lag_ratio=None, subcaption=None, **renderer_kwargs)`
  - `wait(duration=1.0, stop_condition=None, frozen_frame=None)` (alias `pause(duration)`)
  - `add_sound(sound_file, time_offset=0, gain=None)`
  - `add_updater(func)` / `remove_updater(func)` — scene updaters take `dt` (time since last frame).
  - `render(preview=False)` runs setup → construct → tear_down.

Notes:
- Do not override `__init__` in Scenes; use `setup()` for pre-construct initialization.
- `play()` accepts Mobjects, Animations, and `_AnimationBuilder` (i.e., `.animate` chains).

## Mobject (key facts & common methods)
- Core concept: grouped drawable objects. Many geometry/text objects subclass Mobject/VMobject.
- Common attributes: `submobjects: list[Mobject]`, `points: numpy.ndarray`, `color`, `fill_color`, `stroke_color`, `stroke_width`, `width/height/depth`, `z_index`.
- Frequently used methods (return `self` for chaining):
  - Creation/structure: `add(*mobjects)`, `remove(*mobjects)`, `insert(index, mobj)`, `copy()`
  - Positioning: `move_to(point_or_mobject)`, `next_to(mobject, direction, buff=0.25)`, `to_edge(edge, buff=0)`, `to_corner(corner)`
  - Transform/modify: `scale(factor)`, `rotate(angle, about_point=None)`, `shift(vector)`, `flip(axis)`
  - Styling: `set_color(color, family=True)`, `set_fill(color=None, opacity=None, family=True)`, `set_stroke(color=None, width=None, opacity=None)`
  - Grouping/layout: `arrange(direction=RIGHT, buff=0.25)`, `arrange_in_grid(rows=None, cols=None, buff=0.25)`
  - Updaters: `add_updater(func)` / `remove_updater(func)` — updater signatures: `(mobject, dt)` or `(mobject)` depending on helper; `get_updaters()` returns active updaters.
  - Animation helper: `.animate` — turns method calls into animations (see notes below).

Special methods: `generate_points()` (called on creation), `get_center()`, `get_left()`, `get_right()`, `get_top()`, `get_bottom()`.

## VMobject (vectorized primitives)
- VMobject manages Bézier curves and anchors/handles. Use for paths, curves, and text outlines.
- Important VMobject methods:
  - Path building: `start_new_path(point)`, `add_line_to(point)`, `add_cubic_bezier_curve_to(handle1, handle2, anchor)`
  - Utilities: `point_from_proportion(alpha)` (alpha ∈ [0, 1]), `get_arc_length()`, `get_num_curves()`, `get_nth_curve_points(n)`
  - Styling: `set_fill(color, opacity, family=True)`, `set_sheen(factor, direction=None)`, `set_sheen_direction(direction)`
  - Point management: `set_points_as_corners(points)`, `append_points(points)`, `resize_points(new_length)`

Notes:
- Many VMobject APIs return the object for chaining. When manipulating points, VMobject expects arrays of 3D points (Point3D-like).

## Animation (key facts)
- Animations have fixed `run_time` and optional `rate_func` and `lag_ratio`.
- Common attributes: `.run_time`, `.rate_func`, `.remover` (whether to remove mobject after animation), `.suspend_mobject_updating`.
- Common methods: `begin()`, `finish()`, `interpolate(alpha)`, `interpolate_mobject(alpha)`, `get_run_time()`.
- Construction patterns:
  - `self.play(Create(m))`, `self.play(FadeOut(m))`, `self.play(Transform(a, b))`, `self.play(ReplacementTransform(a, b))`.

Notes:
- `lag_ratio` delays animation application on submobjects relative to total duration — useful for staggered effects.

## Constants & common names
- Coordinates & vectors: `ORIGIN`, `LEFT`, `RIGHT`, `UP`, `DOWN`, `UL`, `UR`, `DL`, `DR`.
- Angles/constants: `PI`, `TAU`, `DEGREES`.
- Colors: `RED`, `BLUE`, `GREEN`, `WHITE`, `BLACK`, etc., and flexible color parsing (hex, names).

## `.animate` behaviour (important gotchas)
- `.animate` converts method calls into an animation that interpolates between the mobject's start state and the result of the method call. It interpolates points and attributes.
- This interpolation can produce unexpected visuals when the start and end states are identical in point layout (e.g., rotating 180 degrees may yield odd interpolation). In such cases prefer explicit Animation classes (e.g., `Rotate(mobj, angle=PI)`) or use `ValueTracker` + updaters.
- You can chain calls on `.animate`: `m.animate.shift(RIGHT).scale(2)` and pass animation kwargs: `m.animate(run_time=2).rotate(PI)`.

## Updaters & ValueTracker
- Updaters are for frame-by-frame changes. Mobject updaters typically have signature `(mobject, dt)` or just `(mobject)` depending on helper.
- For time-based continuous animation use `ValueTracker(value)` and an updater that reads the tracker: `t = ValueTracker(0); m.add_updater(lambda m: m.set_x(t.get_value()))`. Animate with `self.play(t.animate.set_value(5))`.

## Common pitfalls for LLMs (verifier guidance)
- Do not invent properties. Only use attributes/methods listed above or in official docs. If a property is used in generated code, the verifier should cross-check existence on the relevant class (`Scene`, `Mobject`, `VMobject`, `Animation`).
- When generating code that manipulates `.points` or anchors, ensure types: NumPy arrays of shape (N, 3). Prefer higher-level helpers such as `set_points_as_corners`, `append_points`, or `add_line_to` unless code intentionally operates on raw arrays.
- For transforms between different shaped Mobjects, use `Transform` (aligns points) or `ReplacementTransform` (replaces instance). For complex shape morphing, call `align_points()` or `match_points()` first.

## LLM generation contract (short)
- Inputs: plain-text description of desired animation, optional constraints (duration, resolution).
- Output: a Python file containing one or more `Scene` subclasses whose `construct()` implements the animation using only documented APIs.
- Error modes verifier must catch: unknown properties/method names, wrong argument shapes (e.g., passing scalar where array expected), using `.animate` incorrectly for path-oriented interpolations.

## Small examples (illustrative)
```py
from manim import *

class Example(Scene):
    def construct(self):
        c = Circle().set_fill(PINK, opacity=0.5)
        s = Square().next_to(c, RIGHT, buff=0.5)
        self.play(Create(c), Create(s))
        self.play(s.animate.rotate(PI/4))
        self.play(Transform(s, c))
        self.wait()
```

## Where to check more
- Reference manual: https://docs.manim.community/en/stable/reference/
- Tutorials/Quickstart: https://docs.manim.community/en/stable/tutorials/quickstart.html

---
Short, authoritative, and intentionally conservative: prefer using the documented helpers over low-level point math. If a generated script needs a method not in this file, verify it exists in Manim docs before accepting it.

## Text, Tex, and MathText
- `Text`: high-level text (wraps system fonts). Useful for UI-style captions and labels. Uses Pango/Cairo (Cairo renderer) or font backends for OpenGL.
- `Tex` / `MathTex`: LaTeX-rendered text. `MathTex` is specialized for math; `Tex` is generic LaTeX. Prefer `MathTex` for math expressions.

Common patterns:
  - `Text("Hello", font_size=48, color=WHITE)`
  - `MathTex("\\int_0^1 x^2 \, dx")`

Notes:
- LaTeX tooling must be installed for `Tex`/`MathTex` to work (pdflatex/latexmk and related packages). If missing, rendering fails.

## Camera (overview)
- Scenes have a `camera` attribute. Camera responsibilities: render frames, manage frame dimensions and coordinate system.
- Common camera methods / usage:
  - `self.camera.frame` is the main mobject representing the view. Use `.shift()`, `.scale()` or `.move_to()` on `self.camera.frame` to pan/zoom.
  - `camera_class` can be provided when constructing a `Scene` to swap camera behavior (e.g., `ThreeDCamera`).

Notes:
- For moving-camera effects, animate the camera frame: `self.play(self.camera.frame.animate.move_to(point))`.

## ImageMobject
- `ImageMobject(path_or_pil_image)` displays raster images. Useful for backgrounds, texture references, or combining rendered images with vector mobjects.
- Typical usage: `img = ImageMobject("fig.png").scale(2); self.add(img)`

## Common Animations (Create, FadeOut, Rotate, Transform, ReplacementTransform)
- `Create(mobject, run_time=..., rate_func=...)`: draws mobject on screen.
- `FadeOut(mobject, run_time=...)`: fades a mobject away and (by default) removes it from the scene.
- `Rotate(mobject, angle, about_point=None, run_time=...)`: rotates using an Animation class — preferable for rotations where `.animate` interpolation is ambiguous.
- `Transform(mobject, target_mobject, run_time=...)`: interpolate points and attributes; good for morphs when you want to alter shape.
- `ReplacementTransform(old, new, run_time=...)`: replace `old` with `new` (keeps `new` instance on scene).

Examples:
```py
self.play(Create(circle))
self.play(Rotate(square, angle=PI, run_time=2))
self.play(Transform(square, circle))
self.play(FadeOut(circle))
```

## More LLM verifier guidance (programmatic checks)
- For any generated script, verify:
  1. All imported symbols exist in Manim namespace (`from manim import *` or explicit import).
  2. Methods called on classes are present in this reference (or in upstream docs).
  3. `.points` manipulations operate on NumPy arrays with shape (N, 3).
  4. `Tex`/`MathTex` usage implies LaTeX availability; flag when environment probably lacks LaTeX.

## Examples (more)
```py
class CameraPan(Scene):
    def construct(self):
        grid = VGroup(*[Dot().shift(RIGHT*i) for i in range(-5,6)])
        self.add(grid)
        self.play(self.camera.frame.animate.shift(RIGHT*3), run_time=2)
        self.wait()
```

---
If you'd like a narrower JSON schema (e.g., classes-only, or a flattened method list for quick lookup), tell me which format your verifier expects and I will adapt the JSON accordingly.
