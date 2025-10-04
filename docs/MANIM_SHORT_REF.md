# Manim Community Edition v0.19.0 — verified reference

Derived from the public Manim Community Edition documentation (stable branch, v0.19.0). All member names and signatures below are copied or paraphrased from the official reference pages, in particular the `Scene`, `Mobject`, `VMobject`, `Animation`, `Text`, `Tex/MathTex`, and tracker sections under <https://docs.manim.community/en/stable/reference.html> and their linked `[source]` views.

## Primary documentation links
- Scene: <https://docs.manim.community/en/stable/reference/manim.scene.scene.Scene.html>
- Mobject: <https://docs.manim.community/en/stable/reference/manim.mobject.mobject.Mobject.html>
- VMobject: <https://docs.manim.community/en/stable/reference/manim.mobject.types.vectorized_mobject.VMobject.html>
- Animation base: <https://docs.manim.community/en/stable/reference/manim.animation.animation.Animation.html>
- Text / LaTeX mobjects: <https://docs.manim.community/en/stable/reference/manim.mobject.text.html>
- Value trackers: <https://docs.manim.community/en/stable/reference/manim.mobject.value_tracker.html>

---

## `Scene` essentials (`manim.scene.scene.Scene`)

### Lifecycle & properties
- `Scene(renderer=None, camera_class=Camera, always_update_mobjects=False, random_seed=None, skip_animations=False)`
- `render(preview=False)` calls `setup()`, `construct()`, then `tear_down()`; `preview=True` opens the rendered media.
- Overridable hooks: `setup(self)`, `construct(self)`, `tear_down(self)`.
- `next_section(name="unnamed", section_type=DefaultSectionType.NORMAL, skip_animations=False)` creates section boundaries for the file writer.
- `camera` property exposes the renderer camera; `time` property reports elapsed scene time.

### Managing displayed objects
- `add(*mobjects)` / `remove(*mobjects)` / `clear()` mutate `Scene.mobjects` (draw order matches add order).
- `add_foreground_mobjects(*mobjects)` / `remove_foreground_mobjects(*mobjects)` bring items above the standard render list; singular helpers accept one mobject.
- `bring_to_front(*mobjects)` / `bring_to_back(*mobjects)` adjust render order.
- `add_mobjects_from_animations(*animations)` collects mobjects produced by animations (e.g., `Write`).

### Animation control & timing
- `play(*args, subcaption=None, subcaption_duration=None, subcaption_offset=0, **kwargs)` accepts `Animation`, `Mobject`, or `_AnimationBuilder` objects; animation kwargs (`run_time`, `rate_func`, `lag_ratio`, etc.) are forwarded.
- `wait(duration=DEFAULT_WAIT_TIME, stop_condition=None, frozen_frame=None)`; `pause(duration=1.0)` is an alias that freezes the last frame.
- `wait_until(stop_condition, max_time=60)` polls a predicate until it returns `True` or the timeout elapses.
- `add_subcaption(content, duration=1, offset=0)` records a subcaption entry aligned to the current scene time.
- `add_sound(sound_file, time_offset=0, gain=None, **kwargs)` schedules audio playback.

### Scene-level updaters & interaction
- `add_updater(func)` and `remove_updater(func)` register scene-wide callbacks that receive `dt` each frame.
- Input hooks supplied by the interactive renderer: `on_mouse_motion`, `on_mouse_scroll`, `on_mouse_press`, `on_mouse_drag`, `on_key_press`, `on_key_release`, plus helpers `mouse_scroll_orbit_controls` and `mouse_drag_orbit_controls`.

---

## `Mobject` fundamentals (`manim.mobject.mobject.Mobject`)

### Construction & attributes
- `Mobject(color=WHITE, name=None, dim=3, target=None, z_index=0)`
- Documented attributes: `submobjects`, `points`, `dim`, `z_index`, `name`, and the `.animate` convenience property.
- Bounding-box helpers: `get_critical_point(direction)`, `get_center()`, `get_left()`, `get_right()`, `get_top()`, `get_bottom()`, `get_bounding_box()`; width/height/depth are exposed as properties.

### Layout & composition
- `add(*mobjects)`, `add_to_back(*mobjects)`, `remove(*mobjects)` and their `__add__`/`__sub__` operator aliases manage group membership.
- `arrange(direction=RIGHT, buff=DEFAULT_MOBJECT_TO_MOBJECT_BUFFER, center=True, **kwargs)` positions submobjects along a line.
- `arrange_in_grid(rows=None, cols=None, buff=MED_SMALL_BUFF, cell_alignment=ORIGIN, row_alignments=None, col_alignments=None, row_heights=None, col_widths=None, flow_order="dr")` lays out submobjects on a grid.

### Positioning & transforms
- `move_to(point_or_mobject, aligned_edge=ORIGIN, coor_mask=np.array([1, 1, 1]))`
- `next_to(mobject_or_point, direction=RIGHT, buff=DEFAULT_MOBJECT_TO_MOBJECT_BUFFER, aligned_edge=ORIGIN, submobject_to_align=None, index_of_submobject_to_align=None)`
- `to_edge(edge=LEFT, buff=DEFAULT_MOBJECT_TO_EDGE_BUFFER)` / `to_corner(corner=UR, buff=DEFAULT_MOBJECT_TO_EDGE_BUFFER)` / `align_on_border(direction, buff=DEFAULT_MOBJECT_TO_EDGE_BUFFER)`
- `shift(vector)` / `center()` / `stretch(factor, dim, about_point=ORIGIN)` / `rotate(angle, axis=OUT, about_point=None)` / `flip(axis=UP)`
- `scale(factor, about_point=None, about_edge=ORIGIN)` alongside `scale_to_fit_width(width)`, `scale_to_fit_height(height)`, `scale_to_fit_depth(depth)`, `stretch_to_fit_width/height/depth`.

### Styling
- `set_color(color, family=True)`
- `set_fill(color=None, opacity=None, family=True)` (implemented on `VMobject`, applies recursively when `family=True`).
- `set_stroke(color=None, width=None, opacity=None, background=False, family=True)`
- `set_opacity(opacity, family=True)`, `set_z_index(z, family=True)`

### Updaters & animation helpers
- `add_updater(update_function, index=None, call_updater=False)` registers per-mobject updaters (signatures can depend on helper type).
- `remove_updater(update_function=None)`, `clear_updaters()`, `has_time_based_updater()`, `suspend_updating()`, `resume_updating()`
- `generate_target()` prepares a copy for `MoveToTarget`; `.animate` turns chained method calls into an `_AnimationBuilder`.

---

## Vectorized mobjects (`manim.mobject.types.vectorized_mobject.VMobject`)

- `VMobject(fill_color=None, fill_opacity=0.0, stroke_color=None, stroke_opacity=1.0, stroke_width=DEFAULT_STROKE_WIDTH, background_stroke_color=None, sheen_factor=0.0, sheen_direction=None, close_new_points=False, joint_type=LineJointType.ROUND, shadow=None, **kwargs)`
- Path construction: `start_new_path(point)`, `add_line_to(point)`, `add_cubic_bezier_curve_to(handle1, handle2, anchor)`, `append_points(points)`, `set_points_as_corners(points)`, `set_points_smoothly(points)`, `become_partial(vmobject, a, b)`
- Geometry queries: `point_from_proportion(alpha)`, `get_arc_length(sample_points_per_curve=None)`, `get_num_curves()`, `get_nth_curve_points(n)`, `insert_n_curves(n)`
- Styling helpers inherit from `Mobject`: `set_fill`, `set_stroke`, plus `set_sheen(factor, direction=None)` / `set_sheen_direction(direction)`

---

## Text and LaTeX mobjects (`manim.mobject.text`)

- `Text(text, font=None, warn_missing_font=True, t2c=None, t2f=None, t2g=None, t2s=None, line_spacing=0.0, disable_ligatures=False, font_size=DEFAULT_FONT_SIZE, weight=STANDARD, slant=NORMAL, gradient=None, **kwargs)` (Pango-backed plain text; behaves like a `VGroup` of characters).
- `MarkupText(markup_text, **pango_kwargs)` accepts Pango markup.
- `MathTex(*tex_strings, arg_separator=" ", substrings_to_isolate=None, tex_to_color_map=None, tex_environment="align*", font_size=DEFAULT_FONT_SIZE, tex_template=None)` renders LaTeX in math mode; `Tex` shares the signature but compiles in normal mode.
- Common helpers exposed on these classes: `get_part_by_tex(tex)`, `set_color_by_tex(tex, color)`, `set_opacity_by_tex(tex, opacity)`.

---

## Trackers (`manim.mobject.value_tracker`)

- `ValueTracker(value=0.0)` with `get_value()`, `set_value(value)`, `increment_value(delta)`.
- `DoubleValueTracker(x=0.0, y=0.0)` exposes `get_values()` / `set_values(x, y)`.
- `ComplexValueTracker(complex_number=0j)` tracks complex values; real and imaginary components are animated.
- Trackers inherit from `Mobject`, so `.animate` and updaters work exactly like other mobjects.

---

## Animation primitives (`manim.animation.animation` and friends)

### Base class
- `Animation(mobject, lag_ratio=DEFAULT_ANIMATION_LAG_RATIO, run_time=DEFAULT_ANIMATION_RUN_TIME, rate_func=smooth, reverse_rate_function=False, name=None, remover=False, suspend_mobject_updating=False, introducer=False)`
- Key methods: `begin()`, `finish()`, `clean_up_from_scene(scene)`, `interpolate(alpha)`, `interpolate_mobject(alpha)`, `update_mobjects(dt)`, `get_run_time()`, `set_run_time(run_time)`, `set_rate_func(func)`, `copy()`

### Frequently used subclasses (one-line signatures from docs)
- `Create(mobject, lag_ratio=1.0)` — draws path-defined mobjects.
- `Write(mobject, lag_ratio=1.0)` — sequentially writes text or strokes.
- `FadeIn(mobject, shift=0, scale=1, target_position=None)` / `FadeOut(mobject, shift=0, target_position=None)`
- `FadeTransform(source, target, stretch=True, path_arc=0)` / `FadeTransformPieces(source, target)`
- `Transform(mobject, target_mobject, replace_mobject_with_target_in_scene=False, path_arc=0, rate_func=smooth)`
- `ReplacementTransform(old_mobject, new_mobject, stretch=False, **kwargs)`
- `Rotate(mobject, angle, about_point=None, axis=OUT)`
- `MoveAlongPath(mobject, path, rate_func=smooth)`
- `AnimationGroup(*animations, lag_ratio=0.0, group=None)` / `LaggedStart(*animations, lag_ratio=0.5, group=None)` / `Succession(*animations)`
- `Wait(run_time=duration)`

`.animate` (available on `Scene`, `Mobject`, trackers, etc.) returns an `_AnimationBuilder` that records chained method/property calls and forwards animation keyword arguments, e.g. `square.animate(run_time=2, rate_func=linear).rotate(PI/4)`.

---

## Coordinates, angles, and colors

Common constants exported from the Manim namespace (`from manim import *`):
- Unit vectors & positions: `ORIGIN`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `IN`, `OUT`, `UL`, `UR`, `DL`, `DR`
- Angle helpers: `PI`, `TAU`, `DEGREES`
- Color names (non-exhaustive): `WHITE`, `BLACK`, `RED`, `GREEN`, `BLUE`, `YELLOW`, `PINK`, `PURPLE`

---

## Minimal scene (straight from documented API)

```python
from manim import *

class FormulaScene(Scene):
    def construct(self):
        title = Text("Divergence Theorem").to_edge(UP)
        formula = MathTex(r"\\iiint_V (\\nabla \\cdot F)\\,dV = \\oiint_{\\partial V} F \\cdot n\\,dS")
        formula.next_to(title, DOWN, buff=0.6)

        tracker = ValueTracker(0)
        circle = Circle(radius=1.8, color=BLUE)
        dot = Dot().move_to(circle.point_from_proportion(tracker.get_value()))
        dot.add_updater(lambda d: d.move_to(circle.point_from_proportion(tracker.get_value())))

        self.add(title, formula, circle, dot)
        self.play(Create(circle), Write(formula))
        self.play(tracker.animate.set_value(1), run_time=4, rate_func=linear)
        self.wait()
```

The example only invokes names documented above and mirrors the signatures in the Manim CE v0.19.0 reference manual.
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

## Layout and visibility contract (LLM MUST follow)
These hard rules are designed to prevent overlapping labels and off‑screen content in generated scenes.

1) Always build layouts with groups instead of manual coordinates
- Prefer `VGroup(...).arrange(direction=RIGHT, buff=0.5, center=True)` and `arrange_in_grid` over ad‑hoc `shift` calls.
- Use `next_to(target, direction, buff=0.3)` for labels and arrows. Never place a label directly at the same center as its target.

2) Maintain a safe frame margin
- Use a margin of at least 0.4 units on all sides: `MARGIN = 0.4`.
- Only use `to_edge/ to_corner` with an explicit `buff=MARGIN`.
- If scaling is needed, prefer `scale_to_fit_width`/`scale_to_fit_height` with `frame.get_width() - 2*MARGIN` or `frame.get_height() - 2*MARGIN`.

3) Ensure everything is on screen before playing
- Compute the frame once: `frame = self.camera.frame`.
- Before `self.play(...)` for any newly created `m`, ensure:
  - `m.width <= frame.width - 2*MARGIN` and `m.height <= frame.height - 2*MARGIN` (scale down if needed)
  - Move into view: `m.move_to(frame.get_center())` or `m.to_edge(..., buff=MARGIN)`

4) Z‑order and readability
- Labels should be above shapes: set `label.set_z_index(shape.z_index + 1)` or simply `label.set_z_index(10)`.
- When highlighting, add translucent fills and adequate stroke widths: e.g., `set_fill(opacity=0.15)` and `set_stroke(width=3)`.

5) Clear the screen between sections
- Fade out previous groups before introducing new ones: `self.play(FadeOut(VGroup(*self.mobjects)))` or keep an explicit `current_group` variable and fade out that.

6) Diagram recipes
- Function box: use `SurroundingRectangle` or `RoundedRectangle` sized to text plus `buff=0.3`. Place input label with `.next_to(box, UP, buff=0.3)` and output label with `.next_to(box, DOWN, buff=0.3)`.
- Two‑set mapping (like domain→codomain): create two `Ellipse`/`Circle` objects, then place items as a `VGroup(*dots_or_labels).arrange(DOWN, buff=0.4).move_to(left_ellipse)`. Arrows should start/end outside fills: use `buff=0.1` on `Arrow(start, end, buff=0.1)`.

7) Safe helper (recommended to include at top of each Scene)
```py
from manim import *

SAFE_MARGIN = 0.4

def fit_and_keep_on_screen(m: Mobject, frame: Mobject, margin: float = SAFE_MARGIN):
    # Scale down if too large for frame with margin
    max_w = frame.width - 2*margin
    max_h = frame.height - 2*margin
    if m.width > max_w:
        m.scale_to_fit_width(max_w)
    if m.height > max_h:
        m.scale_to_fit_height(max_h)
    # If still slightly out of view due to rounding, center it
    m.move_to(frame.get_center())
    return m
```
- Call `fit_and_keep_on_screen(group, self.camera.frame)` for any complex group before displaying it.

8) Timing hygiene
- Use short waits `self.wait(0.5)` between layout steps so viewers can perceive structure.

These rules exist to eliminate: overlapping titles and labels, off‑screen ellipses/ovals, and invisible numerals in set diagrams.

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