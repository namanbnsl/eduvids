# 🎨 Manim Community Edition v0.18.0 — Verified Reference

## ✅ Quick Compliance Checklist (LLM MUST satisfy before returning code)

Use this vibrant quick-reference to keep every scene polished, readable, and delightfully consistent.

- **Imports & scene setup:** Always include `from manim import *`, `from manim_voiceover import VoiceoverScene`, and `from manim_voiceover.services.gtts import GTTSService`. Define `class MyScene(VoiceoverScene)` with `self.set_speech_service(GTTSService())` inside `construct` for a crisp, reliable start.
- **Camera restrictions:** Never touch `self.camera.frame` inside a pure `VoiceoverScene`. If camera motion is required, inherit from both `VoiceoverScene` and `MovingCameraScene` and respect safe margins to keep the frame serene.
- **Reveal style:** Use `FadeIn`/`FadeOut` (or `Create` for shapes). Do **not** use `Write`, `Transform`, or other complex animations—keep transitions silky smooth.
- **Layout safety:** Define `SAFE_MARGIN = 0.4`. Keep text width ≤ 13.4 units, titles at the top (`to_edge(UP, buff=SAFE_MARGIN)`), and content centered or slightly below with ≥0.8 units spacing. Split long sentences into multiple lines so every composition stays breathable.
  Also remember there is no `TextAlign` type or `CENTER` constant in Manim—use `.move_to()`, `.to_edge()`, `.align_to()`, or `.next_to()` for placement.
- Keep definition callouts at body-scale fonts (≤36 horizontal, ≤30 vertical) so they never overpower the layout.
- Shorts should only flash quick labels—cap on-screen phrases at about five words and move full definitions or multi-sentence explanations into narration or staged reveals.
  Maintain ≥SAFE_MARGIN padding between distinct mobjects/groups so no layout ever feels cramped.
- **Visibility guard:** Double-check that every mobject is fully inside the frame before playing animations; if text feels wide, break it with `\n` or stacked `Text` objects so nothing gets clipped off-screen.
- **Object count & pacing:** Keep ≤ 5–7 visible elements at once, use simple shapes (Text, MathTex, Circle, Square, Rectangle, Arrow, Line, Dot), and keep `run_time` between 0.5–1.5 seconds unless narration requires longer, maintaining a lively but orderly tempo.
- **Naming hygiene:** Never shadow Python built-ins (`str`, `list`, `dict`, `int`, `float`, `len`, `max`, `min`, `sum`, `all`, `any`) so your code style stays classy and bug-free.
- **Safety:** Avoid prohibited modules (`os`, `sys`, `subprocess`, etc.) and stick to documented APIs only, trusting the well-lit path.

Primary documentation links: Scene: docs, Mobject: docs, VMobject: docs, Animation (base): docs, Text/Tex: docs, ValueTracker: docs.

## 🧭 Scene Essentials (`manim.scene.scene.Scene`)

- **Construction:** `Scene(renderer=None, camera_class=Camera, always_update_mobjects=False, random_seed=None, skip_animations=False)`. Do not override `__init__`; put setup code in `setup()`.
- **Lifecycle:** `render(preview=False)` runs `setup()` → `construct()` → `tear_down()`.
- **Sections:** `next_section(name=None, section_type=None, skip_animations=True)` inserts a section break.
- **Time:** `time` property holds elapsed scene time; use `wait(duration=1.0, stop_condition=None, frozen_frame=None)` to pause (alias `pause()`). Use `wait_until(stop_condition, max_time=60)` to pause until a condition.
- **Adding objects:**
  - `add(*mobjects)` / `remove(*mobjects)` / `clear()`: modify `self.mobjects`; draw order follows add order.
  - `add_foreground_mobjects(*mobjects)` / `remove_foreground_mobjects(*mobjects)` (and singular versions) manage objects always drawn above the main list.
  - `bring_to_front(*mobjects)` / `bring_to_back(*mobjects)`: move given mobjects to top/bottom of draw order.
  - `add_mobjects_from_animations(*animations)`: extract mobjects that animations have created (e.g. returned by `.animate`).
- **Animation control:**
  - `play(*animations, run_time=None, rate_func=None, lag_ratio=None, subcaption=None, **kwargs)`: plays one or more Animation or mobject animations (including the `_AnimationBuilder` from `.animate`).
  - `add_subcaption(content, duration=1, offset=0)`: schedule a subcaption entry at current time.
  - `add_sound(sound_file, time_offset=0, gain=None, **kwargs)`: schedule an audio clip.
- **Updaters and interaction:**
  - `add_updater(func)` / `remove_updater(func)`: scene-level updaters (take `dt` argument).
  - Event handlers: `on_mouse_motion`, `on_mouse_scroll`, `on_mouse_press`, `on_mouse_drag`, `on_key_press`, `on_key_release` – override to handle input.
  - Orbit controls: `mouse_scroll_orbit_controls` and `mouse_drag_orbit_controls` can be enabled for 3D scenes.
- **Camera:** Scenes have a `camera` (defaults to `Camera`). For moving-camera scenes (`camera_class=MovingCamera` or `MovingCameraScene`), `scene.camera.frame` is a rectangular `VMobject` defining the view. You can pan/zoom by animating `scene.camera.frame` with `.shift()`, `.scale()`, or `.move_to()`. Always size the frame so the focused group still has the safe margin on every side (e.g. set the frame width to `target.width + 2*MARGIN` before moving to `target`). (In a default `Scene` with `Camera`, no frame exists.) You can supply `camera_class` at construction (e.g. `ThreeDCamera` for 3D scenes).

## 🧱 Mobject Fundamentals (`manim.mobject.mobject.Mobject`)

- **Constructor:** `Mobject(color=WHITE, name=None, dim=3, target=None, z_index=0)`. Default color is white, dim is usually 3.
- **Core attributes:**
  - `submobjects` (list of child Mobjects),
  - `points` (NumPy array of shape (N, 3) for point coordinates),
  - `color` (global color applied),
  - `fill_color`, `stroke_color`, `stroke_width` (for VMobjects and shapes),
  - `width`, `height`, `depth` (properties from bounding box),
  - `z_index` (drawing order).
- **Common methods** (each returns `self` for chaining):
  - **Structure:** `add(*mobjects)`, `remove(*mobjects)`, `insert(index, mobject)`, `copy()`.
  - **Positioning:** `move_to(point_or_mobject)`, `next_to(mobject, direction, buff=0.25)`, `to_edge(edge, buff=0)`, `to_corner(corner, buff=0)`. Also `align_to`.
  - **Transform:** `scale(factor, about_point=None)`, `rotate(angle, about_point=None, axis=OUT)`, `shift(vector)`, `flip(axis)`.
  - **Styling:**
    - `set_color(color, family=True)`: sets base color;
    - `set_fill(color=None, opacity=None, family=True)`: fill (for VMobjects);
    - `set_stroke(color=None, width=None, opacity=None, background=False, family=True)`: stroke;
    - `set_opacity(opacity, family=True)`, `set_z_index(z, family=True)`.
  - **Layout:** `arrange(direction=RIGHT, buff=0.25)`, `arrange_in_grid(rows=None, cols=None, buff=0.25)`, `move_to` / `stretch_to_fit` helpers.
  - **Updaters:** `add_updater(func)` / `remove_updater(func)`: element updaters (`func(mobject, dt)` or `func(mobject)`). `get_updaters()` lists active updaters.
  - **Animation helper:** `.animate` property turns chained method calls into an `_AnimationBuilder`. Example: `square.animate(scale=2).rotate(PI/2)` yields an Animation.
  - **Bounds and geometry:** `get_center()`, `get_left()`, `get_right()`, `get_top()`, `get_bottom()`, `get_corner(corner)`. `width`, `height`, `depth` properties measure bounding-box extents. (Use these to align or fit objects.)
  - **Special:** `generate_points()` (called internally); `get_critical_point(direction)` (corner extreme).

## ✨ Vectorized Mobjects (VMobject)

(`manim.mobject.types.vectorized_mobject.VMobject`)

**Constructor:**

```python
VMobject(
    fill_color=None, fill_opacity=0.0,
    stroke_color=None, stroke_opacity=1.0, stroke_width=4,
    background_stroke_color=None, background_stroke_opacity=1.0,
    background_stroke_width=0,
    sheen_factor=0.0, joint_type=None, sheen_direction=None,
    close_new_points=False, n_points_per_cubic_curve=4,
    **kwargs
)
```

(By default, `stroke_width=4`.) Additional args in `**kwargs` (like `name`, `z_index`, etc.).

- **Path construction:** build a path via anchors/handles:
  - `start_new_path(point)`: begin a new sub-path at `point`.
  - `add_line_to(point)`: extend path with a straight line to `point`.
  - `add_cubic_bezier_curve_to(handle1, handle2, anchor)`: add a cubic Bezier.
  - `append_points(points)`: append a list of points (anchors+handles).
  - `set_points_as_corners(points)`: treat points as corner points (creates straight segments).
  - `set_points_smoothly(points)`: fit a smooth curve through given points.
  - `pointwise_become_partial(vmobj, a, b)`: replace this VMobject's points by the portion of another `vmobj` between proportions `a` and `b`.
- **Geometry queries:**
  - `point_from_proportion(alpha)`: point at fraction `alpha` ∈ [0,1] along the path.
  - `get_arc_length(sample_points_per_curve=None)`: approximate total length.
  - `get_num_curves()`: number of Bezier curves.
  - `get_nth_curve_points(n)`: control points of the nth curve.
  - `insert_n_curves(n)`: subdivide each curve to increase point density.
  - `get_nth_curve_function(n)`: symbolic curve function (for advanced use).
- **Styling** (in addition to Mobject): `set_sheen(factor, direction=None, family=True)` (apply a color gradient), `set_sheen_direction(direction, family=True)`.

**Points:** VMobject works with NumPy arrays of 3D points. When manipulating raw points, use these helpers.

## 🎞️ Common Animations (`manim.animation`)

- **Base class:** `Animation(mobject, lag_ratio=..., run_time=..., rate_func=..., reverse_rate_function=False, name=None, remover=False, suspend_mobject_updating=False, introducer=False)`. Key methods: `begin()`, `finish()`, `interpolate(alpha)`, `interpolate_mobject(alpha)`, `get_run_time()`, `set_rate_func(func)`, `copy()`.
- **Animation builders:** `.animate` on a Mobject (or Scene) creates an `_AnimationBuilder` that records chained calls and animation kwargs. Example:
  ```python
  square.animate(run_time=2, rate_func=linear).rotate(PI/4)
  ```
- **Common Animations:** (one-line signatures)
  - `Create(mobject)` – draw the outline of a Mobject.
  - `Write(mobject)` – write text or stroke-by-stroke.
  - `FadeIn(mobject, shift=0, scale=1, target_position=None)` / `FadeOut(mobject, shift=0, target_position=None)`.
  - `FadeTransform(source, target, stretch=True, path_arc=0)` / `FadeTransformPieces(source, target)`.
  - `Transform(mobject, target_mobject, replace_mobject_with_target_in_scene=False, path_arc=0, rate_func=smooth)`.
  - `ReplacementTransform(old_mobject, new_mobject, stretch=False, **kwargs)`.
  - `Rotate(mobject, angle, about_point=None, axis=OUT)`.
  - `MoveAlongPath(mobject, path, rate_func=smooth)`.
  - `AnimationGroup(*anims, lag_ratio=0.0)` / `LaggedStart(*anims, lag_ratio=0.5)` / `Succession(*anims)`.
  - `Wait(run_time=duration)`.
  - Ease constants: rate functions like `smooth`, `linear`, etc.

## 🌈 Coordinates, Angles, and Colors

Common constants (via `from manim import *`):
- **Unit vectors:** `ORIGIN`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `IN`, `OUT`, `UL`, `UR`, `DL`, `DR`.
- **Angles:** `PI`, `TAU`, `DEGREES` (for converting radians/degrees).
- **Colors:** Named colors: `WHITE`, `BLACK`, `RED`, `GREEN`, `BLUE`, `YELLOW`, `PINK`, `PURPLE`, etc. Also many CSS-style color names and hex codes are supported (via `color=...` in methods).

## 📝 Minimal Scene (from documented API)

```python
from manim import *

class FormulaScene(Scene):
    def construct(self):
        title = Text("Divergence Theorem").to_edge(UP)
        formula = MathTex(r"\iiint_V (\nabla \cdot F)\,dV = \oiint_{\partial V} F \cdot n\,dS")
        formula.next_to(title, DOWN, buff=0.6)
        
        tracker = ValueTracker(0)
        circle = Circle(radius=1.8, color=BLUE)
        dot = Dot().move_to(circle.point_from_proportion(tracker.get_value()))
        dot.add_updater(lambda d: 
            d.move_to(circle.point_from_proportion(tracker.get_value())))
        
        self.add(title, formula, circle, dot)
        self.play(Create(circle), Write(formula))
        self.play(tracker.animate.set_value(1), run_time=4, rate_func=linear)
        self.wait()
```

The example only invokes names documented above. It uses `Text`, `MathTex`, `ValueTracker`, geometry, and common animations.

## 🖋️ Text, Tex, and MathTex

- `Text("string", font_size=..., color=..., slant=ITALIC, weight=BOLD, t2c=None, t2s=None, ...)`: high-level text (non-LaTeX) rendered with Pango/Cairo. Use `t2c={'a': BLUE}` to color substrings (e.g. letters).
- `Tex("LaTeX string", tex_environment='center', color=WHITE)`: a LaTeX-rendered string (internally a `MathTex`). `MathTex("math", tex_to_color_map=None, substrings_to_isolate=None)` is for math mode (default environment `'align*'`). You can color parts of a `MathTex` with `tex_to_color_map={'x': RED}`.
- `SingleStringMathTex` is a subclass of `MathTex` for a single string, same arguments.
- For full customization, use the various `t2*` arguments in `Text` (`t2f` for font, `t2g` for gradient, etc.).

**Examples:**

```python
text = Text("Hello, world", font_size=48, color=BLUE, t2c={'Hello': RED})
math = MathTex(r"\int_0^1 x^2 \,dx", tex_to_color_map={'x': YELLOW})
self.add(text, math)
```

**Note:** LaTeX (`Tex` / `MathTex`) requires a TeX installation. If LaTeX is not installed, rendering will fail.

## 🎚️ ValueTracker (`manim.mobject.value_tracker.ValueTracker`)

`ValueTracker(value=0)`: stores a numeric value that can be animated. Not shown on screen; its position encodes a number.

- **Methods:** `.get_value()` returns the current value; `.set_value(v)` sets it (and can be animated via `tracker.animate.set_value(v)`); `.increment_value(delta)` adds to it (can also use `.animate.increment_value()` in a play).
- **Usage:** Commonly used with an updater. Example:

```python
tracker = ValueTracker(0)
dot = Dot().add_updater(lambda d: 
    d.move_to(number_line.n2p(tracker.get_value())))
self.add(number_line, dot)
self.play(tracker.animate.set_value(5))
```

The updater moves dot as tracker changes.

## 🛡️ Layout and Visibility Contract (LLM MUST follow)

These hard rules are designed to prevent overlapping labels and off‑screen content in generated scenes.

1) **Always build layouts with groups instead of manual coordinates.**
   - Prefer `VGroup(...).arrange(direction=RIGHT, buff=0.5, center=True)` or `arrange_in_grid(...)` over ad‑hoc `shift`.
   - Use `next_to(target, direction, buff=0.3)` for labels/arrows. Never place a label directly at the same center as its target.

2) **Maintain a safe frame margin.**
   - Use a margin of at least 0.4 units on all sides (`MARGIN = 0.4`).
   - Only use `to_edge` / `to_corner` with `buff=MARGIN`.
   - If an object is too large, use `scale_to_fit_width(13.4)` or `.scale_to_fit_height(7.2)` (assuming MARGIN=0.4).
   - When zooming with `self.camera.frame` in a moving-camera scene, ensure the frame width/height stay at least the focus group's bounds plus `2*MARGIN` so nothing hits the edges during the zoom.

3) **Ensure everything is on screen before playing.**
   - DO NOT use `self.camera.frame` in VoiceoverScene (it doesn't exist!)
   - Default frame: ~14.2 units wide, ~8 units tall
   - Before `self.play(...)`, for any newly created `m`, ensure:
     - `m.width <= 14.2 - 2*MARGIN` (≈13.4) and `m.height <= 8 - 2*MARGIN` (≈7.2)
     - Move `m` to view: e.g. `m.move_to(ORIGIN)` or `m.to_edge(..., buff=MARGIN)`.

4) **Text layout and wrapping (CRITICAL for readability).**
   - **Long sentences:** Split into multiple Text/MathTex objects, one per line. NEVER let text exceed ~12 units width.
   - **Line breaks:** Use `\n` in Text strings or create separate Text objects arranged vertically.
   - **Multi-line text example:**
     ```python
     # GOOD: Split long text into lines
     line1 = Text("This is the first part of a long sentence")
     line2 = Text("and this is the continuation")
     lines = VGroup(line1, line2).arrange(DOWN, buff=0.2)
     
     # GOOD: Use newlines
     text = Text("First line\nSecond line\nThird line")
     
     # BAD: Long text that gets cut off
     text = Text("This is a very long sentence that will definitely get cut off at the edges")
     ```
   - **Font size:** Use `font_size=36` for body text, `font_size=48` for titles. Smaller if needed to fit.
   - **Definition callouts:** Match body text sizes (or smaller) and scale down if the block feels dominant.
   - **Width check:** After creating text, check `text.width <= 13.4`. If too wide, scale down or split into lines.

5) **Positioning and spacing (prevent overlaps).**
   - **Titles:** Always at top with `to_edge(UP, buff=0.5)`. NEVER place content in the same vertical space as title.
   - **Main content:** Center at `ORIGIN` or slightly below: `move_to(ORIGIN)` or `shift(DOWN*0.5)`.
   - **Math formulas:** Center standalone MathTex/Tex groups (`formula.move_to(ORIGIN)`) so equations stay balanced on screen.
   - **Padding:** Use buff values ≥ SAFE_MARGIN when arranging or positioning separate groups so elements always have visible breathing room.
   - **Title + content pattern:**
     ```python
     title = Text("Title", font_size=48).to_edge(UP, buff=0.5)
     self.play(Write(title))
     
     # Content MUST be below title, never overlapping
     content = VGroup(...).move_to(ORIGIN)  # or shift(DOWN*0.5)
     self.play(FadeIn(content))
     
     # OR: Fade out title before showing content
     self.play(FadeOut(title))
     content = VGroup(...).move_to(ORIGIN)
     self.play(FadeIn(content))
     ```
   - **Minimum vertical spacing:** At least 0.8 units between title and content.

6) **Bullet points and lists.**
   - **Alignment:** Bullet points MUST start at the LEFT side of the frame, not centered.
   - **Left-aligned pattern:**
     ```python
     # GOOD: Left-aligned bullets
     bullet1 = Text("• First point", font_size=36)
     bullet2 = Text("• Second point", font_size=36)
     bullet3 = Text("• Third point", font_size=36)
     bullets = VGroup(bullet1, bullet2, bullet3).arrange(DOWN, buff=0.3, aligned_edge=LEFT)
     bullets.to_edge(LEFT, buff=1.0)  # Start from left side
     
     # BAD: Centered bullets (looks wrong)
     bullets = VGroup(bullet1, bullet2, bullet3).arrange(DOWN).move_to(ORIGIN)
     ```
   - **Bullet spacing:** `buff=0.3` to `buff=0.4` between items.
   - **Max bullets visible:** No more than 5-6 bullets on screen at once.

7) **Z-order and readability.**
   - Labels should be above shapes: e.g. `label.set_z_index(shape.z_index + 1)` (or simply a high z-index).
   - When highlighting, use translucent fills and thick strokes: `set_fill(opacity=0.15)`, `set_stroke(width=3)` (with an appropriate color).

8) **Clear between sections.**
   - Fade out or remove previous elements before new ones. Example:
     ```python
     self.play(FadeOut(Group(*self.mobjects)))
     ```
     Use `Group` (not `VGroup`) when collecting existing scene mobjects, since `self.mobjects`
     may include plain `Mobject` instances such as `ImageMobject` or `ThreeDAxes` that are not
     `VMobject`s and would raise a `TypeError` if added to a `VGroup`.
   - Or keep track of a `current_group` and `self.play(FadeOut(current_group))`.

9) **Diagram recipes:**
   - Function box: use `SurroundingRectangle` or `RoundedRectangle` sized to text with `buff=0.3`. Place input label above (`.next_to(box, UP, buff=0.3)`) and output below (`.next_to(box, DOWN, buff=0.3)`).
   - Mapping diagram: create two `Circle` or `Ellipse` for domain/codomain. Place points as `VGroup(*dots).arrange(DOWN, buff=0.4).move_to(left_ellipse)` and similarly for right. Use `Arrow(start, end, buff=0.1)` so arrows end outside the circles.
   - Angle highlight: build angle arcs with `Angle(Line(vertex, leg1), Line(vertex, leg2), radius=0.6, color=ANGLE_COLOR)` so **both** supporting lines start at the shared vertex; keep the radius modest so the arc stays inside the figure.

7) **Safe helper (include at top of each Scene):**

```python
from manim import *

SAFE_MARGIN = 0.4
FRAME_WIDTH = 14.2  # Default manim frame width
FRAME_HEIGHT = 8.0  # Default manim frame height

def fit_and_keep_on_screen(m: Mobject, margin: float = SAFE_MARGIN):
    # Scale down if too large for frame with margin (works in ALL scene types)
    max_w = FRAME_WIDTH - 2*margin
    max_h = FRAME_HEIGHT - 2*margin
    if m.width > max_w:
        m.scale_to_fit_width(max_w)
    if m.height > max_h:
        m.scale_to_fit_height(max_h)
    # Center in frame
    m.move_to(ORIGIN)
    return m
```

Call `fit_and_keep_on_screen(group)` for any complex group before displaying it. This works in Scene, VoiceoverScene, MovingCameraScene, etc.

8) **Timing hygiene:** Use short waits (`self.wait(0.5)`) between layout steps so viewers can perceive structure.

These rules prevent overlapping titles/labels, off-screen shapes, and unreadable diagrams.

## ImageMobject

`ImageMobject(path_or_PIL_image)`: displays a raster image. Useful for backgrounds or textures. Example:

```python
img = ImageMobject("figure.png").scale(2)
self.add(img)
```

## Common animations (examples)

- `Create(m, run_time=...)`: draw the mobject.
- `FadeOut(m, run_time=...)`: fade out and remove `m`.
- `Rotate(m, angle, about_point=None, run_time=...)`: rotates (use when `.animate.rotate` is ambiguous).
- `Transform(m, target_mobject, run_time=...)`: morph between shapes (interpolate points).
- `ReplacementTransform(old, new, run_time=...)`: replaces old with new instance on screen (good for distinct objects).

**Example usage:**

```python
self.play(Create(circle))
self.play(Rotate(square, angle=PI, run_time=2))
self.play(Transform(square, circle))
self.play(FadeOut(circle))
```

## Examples (more)

```python
class CameraPan(MovingCameraScene):
    def construct(self):
        grid = VGroup(*[Dot().shift(RIGHT*i) for i in range(-5, 6)])
        self.add(grid)
        # Pan the camera view 3 units to the right
        self.play(self.camera.frame.animate.shift(3*RIGHT), run_time=2)
        self.wait()

class ValueTrackerExample(Scene):
    def construct(self):
        number_line = NumberLine()
        pointer = Vector(DOWN)
        label = MathTex("x").add_updater(lambda m: m.next_to(pointer, UP))
        
        tracker = ValueTracker(0)
        pointer.add_updater(lambda m: m.next_to(
            number_line.n2p(tracker.get_value()), UP
        ))
        
        self.add(number_line, pointer, label)
        # Animate tracker increasing
        self.play(tracker.animate.set_value(5), run_time=3)
        self.wait()
```

## More LLM verifier guidance (programmatic checks)

### API and Type Checks
- Ensure all used symbols exist in Manim (with `from manim import *` or explicit import). Only use methods/attributes listed above or in official docs. The verifier should flag any unknown names.
- `.points` and anchor manipulations should use NumPy arrays of shape (N, 3). If code manipulates raw points, check array shapes. Prefer using higher-level helpers (`set_points_as_corners`, `append_points`, `add_line_to`, etc.) rather than manual NumPy math unless intentional.
- For transforms between differently-shaped mobjects, use `Transform` or `ReplacementTransform` (or call `align_points()` / `match_points()` first).

### ⚠️ Python Built-in Shadowing (CRITICAL)
**This causes "'str' object is not callable" and similar cryptic errors!**

**NEVER use these as variable names:**
- String/collection types: `str`, `list`, `dict`, `tuple`, `set`, `frozenset`
- Numeric types: `int`, `float`, `complex`, `bool`
- Built-in functions: `len`, `max`, `min`, `sum`, `abs`, `round`, `pow`
- Iterators/filters: `all`, `any`, `map`, `filter`, `zip`, `range`, `enumerate`
- I/O: `print`, `input`, `open`, `file`
- Other: `type`, `id`, `hash`, `format`, `sorted`, `reversed`

**Use descriptive alternatives:**
```python
# ❌ BAD - shadows built-ins (causes "'X' is not callable")
str = "Hello World"
list = [1, 2, 3]
dict = {"key": "val"}
max = 100
len = 5

# ✅ GOOD - descriptive names
text_str = "Hello World"  # or just: text
items = [1, 2, 3]         # or: numbers, values
config = {"key": "val"}   # or: settings, params
max_value = 100           # or: upper_bound, limit
length = 5                # or: count, size
```

**Common problematic patterns to catch:**
```python
# ❌ BAD
for str in strings:           # shadows built-in str()
    print(str(number))        # ERROR: str is now the loop variable!

# ✅ GOOD
for text in strings:
    print(str(number))        # works correctly

# ❌ BAD
list = some_function()        # shadows built-in list()
my_list = list(data)          # ERROR: list is now a variable!

# ✅ GOOD  
items = some_function()
my_list = list(data)          # works correctly
```

**Verifier must REJECT any script that shadows built-ins and provide a fixed version with renamed variables.**

## Text, Tex, and MathText

- **Text:** high-level text (system font or registered). Good for UI-like captions or labels. Uses Pango/Cairo (or OpenGL text backends). Example: `Text("Hello", font_size=48, color=WHITE)`.
- **Tex / MathTex:** LaTeX-rendered text. `MathTex` is math mode; `Tex` for general LaTeX. Prefer `MathTex` for equations. Example: `MathTex(r"\int_0^1 x^2 \,dx")`.
- **Customization:** All have `color`, `font_size`, `font`, `slant`, `weight`, etc. In `MathTex`, use `tex_to_color_map={'x': YELLOW}` or the equivalent `set_color_by_tex`.
- **Note:** LaTeX must be installed (e.g. pdflatex). Without it, `Tex` / `MathTex` will not render.

## Camera (overview)

- Scenes have a `camera` attribute (instance of `Camera` or subclass). It manages frame size, rendering, etc.
- **CRITICAL:** `self.camera.frame` is ONLY available in `MovingCameraScene` and `ThreeDScene`. Regular `Scene` and `VoiceoverScene` DO NOT have `camera.frame`!
- **Default frame dimensions:** ~14.2 units wide × ~8 units tall (centered at ORIGIN)
- **Moving camera:** Only for `MovingCameraScene` or `class MyScene(VoiceoverScene, MovingCameraScene):`
  ```python
  # ONLY works in MovingCameraScene!
  self.play(self.camera.frame.animate.move_to(point))
  ```
- **For VoiceoverScene (default):** Use fixed coordinates. Objects are visible if centered near ORIGIN with reasonable size.
- You can specify `camera_class` when creating a Scene (e.g. `camera_class=ThreeDCamera`), but this is rarely needed.
- **References:** Frame width/height: `config.frame_width`, `config.frame_height`

## Layout and visibility contract - Summary

**See the comprehensive Layout and visibility contract section above for full details.**

Key reminders:
- Split long text into multiple lines (max width ~12 units)
- Titles at top (`to_edge(UP, buff=0.5)`), content at center (`ORIGIN`) or below
- Bullet points must be LEFT-aligned (`to_edge(LEFT, buff=1.0)`)
- Minimum 0.8 units vertical spacing between title and content
- Clear previous content before showing new sections
- Check text width after creation: `text.width <= 13.4`
- Use `font_size=36` for body, `font_size=48` for titles

Failing to follow these may lead to parts being off-screen, overlapping, or unreadable.

---