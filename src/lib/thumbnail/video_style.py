"""Eduvids house style for generated Manim videos.

Every generated script gets ``from eduvids_style import *`` right after its
imports (see ``src/lib/video-style.ts``), so the video shares its thumbnail's
canvas, typography and palette whatever the model wrote:

- Canvas ``BG`` and ink ``INK``; pure white and pure black are graded to them.
- ``Text`` is set in CMU Serif, the Computer Modern face 3Blue1Brown and
  Welch Labs use, so words match the math.
- ``MathTex``/``Tex`` compile with XeLaTeX in Computer Modern (CMU Serif
  letters, Latin Modern Math symbols), as on the thumbnails. A formula that
  fails to compile falls back to Manim's default template (also Computer
  Modern) rather than failing the render.
- ``PRIMARY``/``ACCENT`` are the video's thumbnail palette; ``SECONDARY`` and
  ``TERTIARY`` support it. Manim's named colours are retuned to the same
  family, so ``BLUE`` or ``YELLOW`` still land on the house tones.
- A flat near-black canvas with crisp, unadorned strokes, in the manner of
  3Blue1Brown and Welch Labs: no vignette, no glow, no specular shine. 3D
  surfaces have matte, smooth shading without a patch wireframe.
- Explicit responsive layouts reserve title, hero, formula and caption lanes;
  the fallback guard handles nested labels and projected 3D screen overlays.
- No block-capital tags: ``header()`` ignores eyebrows and all-caps copy is
  set in sentence case. ``pop_in`` and ``pulse`` give reveals some snap.

Palette names and tones must match ``PALETTES`` in renderer.py.
"""

import os
import re
from itertools import combinations

import numpy as np
import manim
from manim import ManimColor, TexTemplate, config
from manim.camera.camera import Camera
from manim.camera.three_d_camera import ThreeDCamera
from manim.mobject.text import tex_mobject

PALETTE_NAME = "__EDUVIDS_PALETTE__"
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eduvids-fonts")
FONT = "CMU Serif"

BG = "#0A0A0A"
INK = "#EDEAE4"
MUTED = "#8A8F98"

# Classic mathematical-animation tones (3Blue1Brown's BLUE_C, TEAL_C, RED_C,
# GREEN_C, PURPLE_B; Welch Labs' yellow): bright enough to read on black,
# muted enough to stay calm.
HUES = {
    "teal": "#5CD0B3",
    "azure": "#58C4DD",
    "violet": "#B189C6",
    "rose": "#E07A9F",
    "amber": "#FFD35A",
    "coral": "#FC6255",
    "green": "#83C167",
}

# (primary, accent, secondary, tertiary). Supporting hues are chosen to stay
# distinct from the pair and from each other.
PALETTES = {
    "teal-amber": ("teal", "amber", "violet", "coral"),
    "azure-coral": ("azure", "coral", "amber", "teal"),
    "violet-amber": ("violet", "amber", "teal", "rose"),
    "teal-rose": ("teal", "rose", "amber", "azure"),
    "azure-amber": ("azure", "amber", "coral", "teal"),
}


def _rgb(hex_color):
    if not isinstance(hex_color, str):
        hex_color = ManimColor(hex_color).to_hex()
    value = hex_color.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=float) / 255


def _mix(a, b, t):
    rgb = _rgb(a) * (1 - t) + _rgb(b) * t
    return "#" + "".join(f"{round(channel * 255):02X}" for channel in rgb)


_roles = [HUES[name] for name in PALETTES.get(PALETTE_NAME, PALETTES["teal-amber"])]
PRIMARY, ACCENT, SECONDARY, TERTIARY = (ManimColor(tone) for tone in _roles)

# ---------------------------------------------------------------------------
# Named colours: keep the hue the model asked for, at the house tone.
# ---------------------------------------------------------------------------

_SHADES = {"A": (INK, 0.45), "B": (INK, 0.22), "C": (None, 0), "D": (BG, 0.18), "E": (BG, 0.36)}
_FAMILIES = {
    "BLUE": "azure", "TEAL": "teal", "GREEN": "green", "YELLOW": "amber",
    "GOLD": "amber", "RED": "coral", "MAROON": "rose", "PURPLE": "violet",
}
_named = {}
for _family, _hue in _FAMILIES.items():
    _tone = HUES[_hue]
    _named[_family] = _tone
    for _suffix, (_toward, _amount) in _SHADES.items():
        _named[f"{_family}_{_suffix}"] = _mix(_tone, _toward, _amount) if _toward else _tone
_named.update({
    "WHITE": INK, "BLACK": BG,
    "ORANGE": _mix(HUES["amber"], HUES["coral"], 0.5),
    "PINK": HUES["rose"], "LIGHT_PINK": _mix(HUES["rose"], INK, 0.35),
    "PURE_RED": HUES["coral"], "PURE_GREEN": HUES["green"], "PURE_BLUE": HUES["azure"],
    "DARK_BLUE": _mix(HUES["azure"], BG, 0.36),
    "DARK_BROWN": _mix(HUES["amber"], BG, 0.55), "LIGHT_BROWN": _mix(HUES["amber"], MUTED, 0.45),
    "GRAY_BROWN": _mix(MUTED, HUES["amber"], 0.2), "GREY_BROWN": _mix(MUTED, HUES["amber"], 0.2),
    "GRAY_A": _mix(MUTED, INK, 0.6), "GREY_A": _mix(MUTED, INK, 0.6),
    "GRAY_B": _mix(MUTED, INK, 0.3), "GREY_B": _mix(MUTED, INK, 0.3),
    "GRAY_C": MUTED, "GREY_C": MUTED, "GRAY": MUTED, "GREY": MUTED,
    "GRAY_D": _mix(MUTED, BG, 0.3), "GREY_D": _mix(MUTED, BG, 0.3),
    "GRAY_E": _mix(MUTED, BG, 0.55), "GREY_E": _mix(MUTED, BG, 0.55),
    "LIGHT_GRAY": _mix(MUTED, INK, 0.6), "LIGHT_GREY": _mix(MUTED, INK, 0.6),
    "LIGHTER_GRAY": _mix(MUTED, INK, 0.8), "LIGHTER_GREY": _mix(MUTED, INK, 0.8),
    "DARK_GRAY": _mix(MUTED, BG, 0.45), "DARK_GREY": _mix(MUTED, BG, 0.45),
    "DARKER_GRAY": _mix(MUTED, BG, 0.65), "DARKER_GREY": _mix(MUTED, BG, 0.65),
})
globals().update({name: ManimColor(tone) for name, tone in _named.items()})

# ---------------------------------------------------------------------------
# Canvas and draw-time colour grading.
# ---------------------------------------------------------------------------

config.background_color = BG

# Portrait (Shorts): rotate the landscape frame to 8 units wide instead of
# keeping its 14.2-unit width, which would render every design at half size.
if config.pixel_height > config.pixel_width:
    config.frame_width = 8.0
    config.frame_height = 8.0 * config.pixel_height / config.pixel_width
# Manim's own defaults (a bare Circle is RED, Indicate is YELLOW, plots are
# YELLOW, axes are WHITE) bypass the names above, so retune them at draw
# time: any exact Manim named colour is drawn as its house tone.
_REMAP = {}
for _name, _tone in _named.items():
    _original = getattr(manim, _name, None)
    if _original is not None:
        _key = tuple(int(round(c * 255)) for c in ManimColor(_original).to_rgb())
        _REMAP.setdefault(_key, _rgb(_tone))


def _grade(rgbas):
    rgbas = np.asarray(rgbas)
    if rgbas.ndim != 2 or not len(rgbas):
        return rgbas
    graded = None
    for index, key in enumerate(map(tuple, np.rint(rgbas[:, :3] * 255).astype(int).tolist())):
        tone = _REMAP.get(key)
        if tone is not None:
            if graded is None:
                graded = np.array(rgbas, dtype=float)
            graded[index, :3] = tone
    return rgbas if graded is None else graded


def _graded(method):
    def wrapper(self, *args, **kwargs):
        return _grade(method(self, *args, **kwargs))
    wrapper.__eduvids_graded__ = True
    return wrapper


if not getattr(Camera.get_fill_rgbas, "__eduvids_graded__", False):
    Camera.get_fill_rgbas = _graded(Camera.get_fill_rgbas)
    Camera.get_stroke_rgbas = _graded(Camera.get_stroke_rgbas)
    _modified_rgbas = ThreeDCamera.modified_rgbas

    def _modified_graded(self, vmobject, rgbas):
        # Grade before shading so lit surfaces keep their falloff.
        graded = _grade(rgbas)
        if getattr(vmobject, "_eduvids_shaded", False) and self.should_apply_shading:
            try:
                entry = getattr(self, "_eduvids_light", {}).get(id(vmobject))
                if entry is not None and entry[0] is vmobject:
                    return _apply_light(graded, entry[1])
                return _lit(self, vmobject, graded)
            except Exception:
                pass
        return _modified_rgbas(self, vmobject, graded)

    def _apply_light(rgbas, factors):
        lit = np.array(rgbas, dtype=float)
        if len(lit) == 1:
            lit = lit.repeat(2, axis=0)
        rows = factors[np.minimum(np.arange(len(lit)), len(factors) - 1)]
        lit[:, :3] = np.clip(lit[:, :3] * rows[:, None], 0, 1)
        return lit

    def _unit(vectors, axis=-1):
        norms = np.linalg.norm(vectors, axis=axis, keepdims=True)
        return vectors / np.where(norms == 0, 1, norms)

    def _light_factors(camera, faces):
        """``_lit``'s diffuse factor at both gradient ends, for many faces at
        once: one numpy pass per frame instead of ~30 small calls per face,
        twice (fill and stroke) per face."""
        points = np.array([face.points[:8] for face in faces])
        coefficients = np.array([face._eduvids_normal_coefficients for face in faces])
        origin = points[:, 0]
        a = _unit(points[:, 3] - origin)  # anchors 1 and 3, as in _surface_basis
        b = _unit(points[:, 7] - origin)
        basis = np.stack((a, b, _unit(np.cross(a, b))), axis=2)
        normals = _unit(basis @ coefficients, axis=1)
        to_light = _unit(camera.light_source.points[0] - origin)
        facing = np.abs(np.einsum("kij,ki->kj", normals, to_light))
        return 0.62 + 0.38 * facing

    def _litable(mob):
        points = getattr(mob, "points", None)
        return (
            getattr(mob, "_eduvids_shaded", False)
            and getattr(mob, "_eduvids_normal_coefficients", None) is not None
            and getattr(mob, "n_points_per_cubic_curve", 0) == 4
            and points is not None and len(points) >= 8
        )

    _stock_reference_point = manim.Mobject.get_z_index_reference_point

    def _depth_key(rotation):
        def key(mob):
            if not getattr(mob, "shade_in_3d", False):
                return np.inf
            points = mob.points
            if (
                isinstance(mob, manim.VMobject) and not mob.submobjects
                and type(mob).get_z_index_reference_point is _stock_reference_point
                and getattr(mob, "z_index_group", mob) is mob and len(points) > 1
            ):
                # Mobject.get_center() for a leaf VMobject: the box centre of
                # its anchors, without walking the generic family machinery.
                step = mob.n_points_per_cubic_curve
                anchors = np.concatenate((points[::step], points[step - 1::step]))
                center = (anchors.min(axis=0) + anchors.max(axis=0)) / 2
            else:
                center = mob.get_z_index_reference_point()
            # The same expression as ThreeDCamera's own key, so ties between
            # patches break exactly as they did.
            return np.dot(center, rotation.T)[2]
        return key

    def _depth_keys(mobjects, rotation):
        """ThreeDCamera's sort keys. Surface patches (leaf VMobjects of 16
        points) are keyed in one pass; stacked matmul rounds exactly like
        the per-patch np.dot, so ties break as they always did."""
        key = _depth_key(rotation)
        keys = [None] * len(mobjects)
        patches = []
        for index, mob in enumerate(mobjects):
            if (
                getattr(mob, "shade_in_3d", False) and isinstance(mob, manim.VMobject)
                and not mob.submobjects and len(mob.points) == 16 and mob.n_points_per_cubic_curve == 4
                and type(mob).get_z_index_reference_point is _stock_reference_point
                and getattr(mob, "z_index_group", mob) is mob
            ):
                patches.append(index)
            else:
                keys[index] = key(mob)
        if patches:
            anchors = np.array([mobjects[index].points for index in patches])[:, [0, 4, 8, 12, 3, 7, 11, 15]]
            centers = (anchors.min(axis=1) + anchors.max(axis=1)) / 2
            for index, value in zip(patches, np.matmul(centers[:, None, :], rotation.T)[:, 0, 2]):
                keys[index] = value
        return keys

    def _get_mobjects_to_display(self, *args, **kwargs):
        mobjects = Camera.get_mobjects_to_display(self, *args, **kwargs)
        keys = _depth_keys(mobjects, self.get_rotation_matrix())
        mobjects = [mobjects[i] for i in sorted(range(len(mobjects)), key=keys.__getitem__)]
        self._eduvids_light = {}
        if self.should_apply_shading:
            faces = [mob for mob in mobjects if _litable(mob)]
            if faces:
                try:
                    factors = _light_factors(self, faces)
                    self._eduvids_light = {id(face): (face, row) for face, row in zip(faces, factors)}
                except Exception:
                    pass  # per-face lighting below still applies
        return mobjects

    _capture_3d = ThreeDCamera.capture_mobjects

    _frame = [0, False]  # frame number, inside a capture

    def _capture_lit(self, *args, **kwargs):
        _frame[0] += 1
        _frame[1] = True
        try:
            return _capture_3d(self, *args, **kwargs)
        finally:
            _frame[1] = False
            self._eduvids_light = {}  # factors are valid for one frame only

    def _shaded_axes(self):
        # ThreeDAxes gives every piece of an axis a gradient spanning the
        # whole axis, recomputed by walking the axis's family for each
        # piece's fill and stroke: ~200 walks a frame. The axis cannot move
        # while one frame is drawn, so compute it once per axis per frame.
        def make_func(axis):
            vect = self.light_source
            cache = [None, None]

            def ends():
                if _frame[1] and cache[0] == _frame[0]:
                    return cache[1]
                value = (axis.get_edge_center(-vect), axis.get_edge_center(vect))
                if _frame[1]:
                    cache[0], cache[1] = _frame[0], value
                return value
            return ends

        for axis in self:
            for submob in axis.family_members_with_points():
                submob.get_gradient_start_and_end_points = make_func(axis)
                submob.get_unit_normal = lambda a: np.ones(3)
                submob.set_sheen(0.2)

    manim.ThreeDAxes._set_axis_shading = _shaded_axes

    def _patch(mob, camera):
        """A surface patch the batched drawing below reproduces exactly."""
        return (
            _litable(mob) and len(mob.points) == 16 and mob.background_stroke_width == 0
            and mob not in camera.fixed_in_frame_mobjects
            and mob not in camera.fixed_orientation_mobjects
        )

    def _close_2d(p0, p1, atol):
        # VMobject.consider_points_equals_2d, for arrays of points.
        return (np.abs(p0[..., 0] - p1[..., 0]) <= atol + 1e-5 * np.abs(p1[..., 0])) & (
            np.abs(p0[..., 1] - p1[..., 1]) <= atol + 1e-5 * np.abs(p1[..., 1])
        )

    def _set_color(ctx, rgbas, start, end):
        if len(rgbas) == 1:
            ctx.set_source_rgba(*rgbas[0][2::-1], rgbas[0][3])
            return
        pattern = cairo.LinearGradient(start[0], start[1], end[0], end[1])
        offsets = (0.0, 1.0) if len(rgbas) == 2 else np.linspace(0, 1, len(rgbas))
        for rgba, offset in zip(rgbas, offsets):
            pattern.add_color_stop_rgba(offset, *rgba[2::-1], rgba[3])
        ctx.set_source(pattern)

    def _lit_colors(camera, faces, rgbas):
        """camera.get_fill_rgbas / get_stroke_rgbas for a batch of patches:
        graded and lit in one pass when every face has the same number of
        colour stops (two for the fill, one for the stroke)."""
        light = getattr(camera, "_eduvids_light", {})
        entries = [light.get(id(face)) for face in faces]
        stops = {len(row) for row in rgbas}
        if (
            camera.should_apply_shading
            and all(entry is not None and entry[0] is face for entry, face in zip(entries, faces))
            and stops in ({1}, {2})
        ):
            stacked = _grade(np.concatenate(rgbas)).reshape(len(faces), stops.pop(), 4)
            if stacked.shape[1] == 1:  # _apply_light lights a single stop at both ends
                stacked = stacked.repeat(2, axis=1)
            factors = np.array([entry[1] for entry in entries])
            lit = np.array(stacked, dtype=float)
            lit[:, :, :3] = np.clip(lit[:, :, :3] * factors[:, :, None], 0, 1)
            return lit
        return None

    def _draw_patches(camera, ctx, faces):
        """Camera.display_vectorized for many surface patches: one projection
        for all of them, then the same Cairo calls Manim makes for each."""
        points = np.array([face.points for face in faces])
        finite = np.isfinite(points).all(axis=(1, 2))
        projected = camera.project_points(points.reshape(-1, 3)).reshape(points.shape)
        atol = np.array([face.tolerance_for_point_equality for face in faces])[:, None]
        # A patch is one path unless consecutive curves come apart on screen.
        joined = _close_2d(projected[:, [3, 7, 11]], projected[:, [4, 8, 12]], atol).all(axis=1)
        closed = _close_2d(projected[:, 0], projected[:, 15], atol[:, 0])
        fills = _lit_colors(camera, faces, [face.get_fill_rgbas() for face in faces])
        widths = [face.get_stroke_width() for face in faces]
        stroked = [face for face, width in zip(faces, widths) if width]
        strokes = _lit_colors(camera, stroked, [face.get_stroke_rgbas() for face in stroked]) if stroked else None
        stroke_index = 0
        for index, face in enumerate(faces):
            width = widths[index]
            if not (finite[index] and joined[index]):
                camera.display_vectorized(face, ctx)
                stroke_index += bool(width)
                continue
            p = projected[index]
            ctx.new_path()
            ctx.new_sub_path()
            ctx.move_to(p[0, 0], p[0, 1])
            for i in (1, 5, 9, 13):
                ctx.curve_to(p[i, 0], p[i, 1], p[i + 1, 0], p[i + 1, 1], p[i + 2, 0], p[i + 2, 1])
            if closed[index]:
                ctx.close_path()
            # Gradient ends: get_3d_vmob_start/end_corner, points 0 and 6.
            _set_color(ctx, fills[index] if fills is not None else camera.get_fill_rgbas(face), p[0], p[6])
            ctx.fill_preserve()
            if width:
                colors = strokes[stroke_index] if strokes is not None else camera.get_stroke_rgbas(face)
                stroke_index += 1
                _set_color(ctx, colors, p[0], p[6])
                ctx.set_line_width(width * camera.cairo_line_width_multiple)
                if face.joint_type != manim.LineJointType.AUTO:
                    ctx.set_line_join(LINE_JOIN_MAP[face.joint_type])
                if face.cap_style != manim.CapStyleType.AUTO:
                    ctx.set_line_cap(CAP_STYLE_MAP[face.cap_style])
                ctx.stroke_preserve()

    def _display_batched(self, vmobjects, pixel_array):
        ctx = self.get_cairo_context(pixel_array)
        run = []
        for vmobject in vmobjects:
            if _patch(vmobject, self):
                run.append(vmobject)
                continue
            if run:
                _draw_patches(self, ctx, run)
                run = []
            self.display_vectorized(vmobject, ctx)
        if run:
            _draw_patches(self, ctx, run)

    import cairo
    from manim.camera.camera import CAP_STYLE_MAP, LINE_JOIN_MAP

    ThreeDCamera.get_mobjects_to_display = _get_mobjects_to_display
    ThreeDCamera.capture_mobjects = _capture_lit
    ThreeDCamera.display_multiple_non_background_colored_vmobjects = _display_batched

    def _lit(camera, face, rgbas):
        # Manim's lighting adds up to half a unit of white toward the light,
        # flattening a height gradient to one pale tone. House surfaces get a
        # two-sided Lambert term that keeps the hue.
        from manim.mobject.three_d.three_d_utils import get_3d_vmob_unit_normal

        points = face.points
        normal = get_3d_vmob_unit_normal(face, 0)
        to_light = camera.light_source.points[0] - points[0]
        to_light = to_light / (np.linalg.norm(to_light) or 1)
        # Smooth parametric vertex normals remove the per-patch lighting seams.
        coefficients = getattr(face, "_eduvids_normal_coefficients", None)
        normals = (_surface_basis(face) @ coefficients).T if coefficients is not None else (normal, normal)
        lit = np.array(rgbas, dtype=float)
        if len(lit) == 1:
            lit = lit.repeat(2, axis=0)
        for i in range(len(lit)):
            n = normals[min(i, len(normals) - 1)]
            n = n / (np.linalg.norm(n) or 1)
            facing = abs(float(np.dot(n, to_light)))
            # Matte diffuse light only: no specular shine, colour kept at peaks.
            lit[i, :3] = np.clip(lit[i, :3] * (0.62 + 0.38 * facing), 0, 1)
        return lit

    _modified_graded.__eduvids_graded__ = True
    ThreeDCamera.modified_rgbas = _modified_graded

# ---------------------------------------------------------------------------
# Drawing: the same Cairo calls as Manim, with less Python per frame.
# ---------------------------------------------------------------------------

_set_path = Camera.set_cairo_context_path
_set_pixels = Camera.set_pixel_array
if not getattr(_set_path, "__eduvids_fast__", False):

    def _fast_path(self, ctx, vmobject):
        """Camera.set_cairo_context_path with the subpath breaks found in one
        numpy pass instead of one Python comparison per curve."""
        points = self.transform_points_pre_display(vmobject, vmobject.points)
        if len(points) == 0:
            return self
        if vmobject.n_points_per_cubic_curve != 4 or len(points) % 4:
            return _set_path(self, ctx, vmobject)
        # VMobject.consider_points_equals_2d(points[n - 1], points[n]) at every
        # curve boundary n; a subpath starts wherever the two differ.
        atol = vmobject.tolerance_for_point_equality
        ends, starts = points[3:-1:4], points[4::4]
        joined = (np.abs(ends[:, 0] - starts[:, 0]) <= atol + 1e-5 * np.abs(starts[:, 0])) & (
            np.abs(ends[:, 1] - starts[:, 1]) <= atol + 1e-5 * np.abs(starts[:, 1])
        )
        breaks = [0, *((np.flatnonzero(~joined) + 1) * 4).tolist(), len(points)]
        xy = points[:, :2].tolist()
        ctx.new_path()
        for first, end in zip(breaks[:-1], breaks[1:]):
            ctx.new_sub_path()
            ctx.move_to(*xy[first])
            for k in range(first, end, 4):
                ctx.curve_to(*xy[k + 1], *xy[k + 2], *xy[k + 3])
            if vmobject.consider_points_equals_2d(points[first], points[end - 1]):
                ctx.close_path()
        return self

    def _fast_pixels(self, pixel_array, convert_from_floats=False):
        # Manim copies the frame into a new array, then into the canvas.
        current = getattr(self, "pixel_array", None)
        if (
            not convert_from_floats and isinstance(pixel_array, np.ndarray)
            and current is not None and current.shape == pixel_array.shape
        ):
            current[:, :, :] = pixel_array
            return None
        return _set_pixels(self, pixel_array, convert_from_floats)

    _get_family = manim.Mobject.get_family

    def _fast_family(self, recurse=True):
        """Mobject.get_family without building and deduplicating a list at
        every level: for a tree (no submobject twice) that is exactly the
        pre-order walk. Anything shared falls back to Manim's own walk."""
        family, seen, stack = [], set(), [self]
        while stack:
            mob = stack.pop()
            if id(mob) in seen:
                return _get_family(self, recurse)
            seen.add(id(mob))
            family.append(mob)
            stack.extend(reversed(mob.submobjects))
        return family

    # Copying a glyph (every DecimalNumber rebuilt by always_redraw copies its
    # cached digits each frame) deep-copied the parsed SVG path it was built
    # from, most of the copy's cost. Manim reads path_obj only while building
    # the glyph's points, so copies share it instead.
    from manim.mobject.svg.svg_mobject import VMobjectFromSVGPath

    _deepcopy_mobject = manim.Mobject.__deepcopy__

    def _share_svg_path(self, memo):
        path = self.__dict__.get("path_obj")
        if path is not None:
            memo[id(path)] = path
        return _deepcopy_mobject(self, memo)

    VMobjectFromSVGPath.__deepcopy__ = _share_svg_path

    _fast_path.__eduvids_fast__ = True
    Camera.set_cairo_context_path = _fast_path
    Camera.set_pixel_array = _fast_pixels
    manim.Mobject.get_family = _fast_family

# Canvas: flat BG (config.background_color), as in 3Blue1Brown and Welch Labs
# videos. Strokes are drawn as-is, without halos.


def glow(mob, on=True):
    """No-op kept for scripts written against the earlier glowing style."""
    return mob


# ---------------------------------------------------------------------------
# Text: CMU Serif. Small sizes are set large and scaled down, because Pango
# hints small text onto a coarse grid and the letter spacing goes uneven.
# ---------------------------------------------------------------------------

try:
    from manimpango import register_font

    for _name in sorted(os.listdir(FONT_DIR)):
        if _name.startswith("cmun"):
            register_font(os.path.join(FONT_DIR, _name))
except (ImportError, OSError):
    pass

_APOSTROPHE = re.compile(r"(?<=\w)'(?=\w)")
_HEAVY = {"SEMIBOLD", "BOLD", "ULTRABOLD", "HEAVY", "ULTRAHEAVY"}
_SMALL_TEXT = 32
_SMALL_TEXT_SCALE = 0.3
FRAME_MARGIN = 0.5


def _fit_frame(mob):
    """Never let a single line of copy or a formula run off the frame."""
    limit = config.frame_width - 2 * FRAME_MARGIN
    if mob.width > limit:
        mob.scale_to_fit_width(limit)
    return mob


# Common short words in all-caps tags. Any other word of three letters or
# fewer is taken for an acronym ("DNA", "FFT") and kept in capitals.
_SMALL_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "how", "in",
    "is", "it", "its", "of", "on", "or", "the", "to", "vs", "why", "who", "you",
    "our", "we", "big", "key", "new", "old", "one", "two", "end", "all", "but",
    "can", "not", "now", "way", "let", "set", "use", "up", "out", "sum", "law",
    "map", "top", "low", "odd", "try", "get", "go", "so", "no", "my", "me",
}


def sentence_case(text):
    """'WORKED EXAMPLE' -> 'Worked example'; 'DNA REPLICATION' -> 'DNA replication'.

    Block-capital tags ("SUMMARY", "KEY IDEA") read as template chrome, so
    all-caps copy is set in sentence case. Mixed-case text is left alone.
    """
    words = re.findall(r"[A-Z]+", text)
    if not text.isupper() or not any(len(w) > 3 or w.lower() in _SMALL_WORDS for w in words):
        return text

    def word(match):
        w = match.group(0)
        if len(w) <= 3 and w.lower() not in _SMALL_WORDS:
            return w
        return w.lower()

    out = re.sub(r"[A-Z]+", word, text)
    for i, c in enumerate(out):
        if c.isalpha():
            return out[:i] + c.upper() + out[i + 1:]
    return out


def _house_text(base):
    class HouseText(base):
        def __init__(self, text, *args, _fit=True, **kwargs):
            kwargs.pop("disable_ligatures", None)
            if isinstance(text, str):
                # Typographic apostrophes, as on the thumbnails ("Euler’s").
                text = _APOSTROPHE.sub("\u2019", text)
                if base is manim.Text:
                    text = sentence_case(text)
            kwargs["font"] = FONT
            size = kwargs.get("font_size") or manim.DEFAULT_FONT_SIZE
            weight = str(kwargs.get("weight") or "").upper()
            # CMU Serif ships Regular and Bold. Like 3Blue1Brown, headings stay
            # regular; bold only when the script asks for it.
            kwargs["weight"] = "BOLD" if weight in _HEAVY else "NORMAL"
            kwargs.setdefault("color", INK)
            scale = _SMALL_TEXT_SCALE if size < _SMALL_TEXT else 1
            kwargs["font_size"] = size / scale
            super().__init__(text, *args, **kwargs)
            # Manim 0.20 keeps an empty glyph per space at the origin, which
            # corrupts the bounding box once the text moves (0.18 drops them).
            empty = [glyph for glyph in self.submobjects if not glyph.has_points()]
            if empty:
                self.remove(*empty)
            if scale != 1:
                self.scale(scale)
            if _fit:
                _fit_frame(self)

    HouseText.__name__ = base.__name__
    HouseText.__qualname__ = base.__qualname__
    return HouseText


Text = _house_text(manim.Text)
MarkupText = _house_text(manim.MarkupText)

# Same as FUNCTION_WORDS in renderer.py.
_BREAK_BEFORE = {
    "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is",
    "it", "its", "of", "on", "or", "the", "to", "vs", "with", "that", "your",
}


def balanced_text(text, font_size=48, max_width=None, max_lines=3, **kwargs):
    """Set copy on the fewest even lines that fit, breaking at phrase edges.

    Lines never end on a function word ("a", "of", "the") and never leave a
    single word alone on a line, as on the thumbnails.
    """
    limit = max_width or config.frame_width - 2 * FRAME_MARGIN
    words = text.split()
    mob = None
    for count in range(1, min(max_lines, len(words)) + 1):
        options = []
        for cuts in combinations(range(1, len(words)), count - 1):
            bounds = (0, *cuts, len(words))
            lines = [words[a:b] for a, b in zip(bounds, bounds[1:])]
            lengths = [len(" ".join(line)) for line in lines]
            cost = (
                max(lengths) - min(lengths)
                + 100 * sum(line[-1].lower() in _BREAK_BEFORE for line in lines[:-1])
                + 6 * sum(len(line) == 1 for line in lines[1:])
            )
            options.append((cost, lines))
        _, lines = min(options, key=lambda option: option[0])
        # Measure at natural size: Text would otherwise shrink itself to fit.
        mob = Text("\n".join(" ".join(line) for line in lines), font_size=font_size, _fit=False, **kwargs)
        if mob.width <= limit:
            break
    if mob is not None and mob.width > limit:
        mob.scale_to_fit_width(limit)
    return mob


# ---------------------------------------------------------------------------
# Math: the thumbnails' XeLaTeX setup in Computer Modern.
# ---------------------------------------------------------------------------

_upright = "cmunrm.otf"
_italic = "cmunti.otf"
_path = FONT_DIR.rstrip("/") + "/"
# CMU Serif set by Pango is larger than TeX's 10pt at the same font_size; set
# TeX to match, so Text and MathTex share one type scale and labels line up.
TEX_POINT_SIZE = 13.4
_size_command = rf"\fontsize{{{TEX_POINT_SIZE}}}{{{TEX_POINT_SIZE * 1.2:.2f}}}\selectfont"
HOUSE_TEX_TEMPLATE = TexTemplate(
    tex_compiler="xelatex", output_format=".xdv", post_doc_commands=_size_command,
)
HOUSE_TEX_TEMPLATE.add_to_preamble("\n".join([
    r"\usepackage{fontspec}",
    r"\usepackage{unicode-math}",
    r"\usepackage{xcolor}",
    r"\defaultfontfeatures{Kerning=On}",
    rf"\setmainfont{{{_upright}}}[Path={_path}, ItalicFont={_italic}, BoldFont=cmunbx.otf, BoldItalicFont=cmunbi.otf]",
    rf"\setmathfont{{latinmodern-math.otf}}[Path={_path}]",
]))
_STOCK_TEX_TEMPLATE = TexTemplate()
_FALLBACK_TEX_TEMPLATE = TexTemplate(post_doc_commands=_size_command)
config.tex_template = HOUSE_TEX_TEMPLATE

# ---------------------------------------------------------------------------
# Graphs: bold, round-capped curves on quiet axes. Axis numbers sit at
# caption size with small arrowheads, so the axes stay quieter than the
# content they carry; plane grids are faint guides in the primary hue.
# ---------------------------------------------------------------------------

AXIS_COLOR = ManimColor(_mix(MUTED, INK, 0.25))
CURVE_WIDTH = 4.5
manim.NumberLine.set_default(
    font_size=26, tip_width=0.2, tip_height=0.2, color=AXIS_COLOR, stroke_width=2.5,
)
manim.ParametricFunction.set_default(stroke_width=CURVE_WIDTH)
manim.Dot.set_default(radius=0.1)
manim.NumberPlane.set_default(
    background_line_style={
        "stroke_color": ManimColor(_mix(_roles[0], BG, 0.35)),
        "stroke_width": 1.4,
        "stroke_opacity": 0.4,
    },
    faded_line_style={
        "stroke_color": ManimColor(_mix(_roles[0], BG, 0.35)),
        "stroke_width": 0.8,
        "stroke_opacity": 0.18,
    },
)


def _is_stock(template):
    # Manim restores a copy of its config between scenes, so recognise the
    # stock template by content rather than identity. Custom templates (for
    # example ctex for Chinese) are left alone.
    return template is None or (
        template.tex_compiler == _STOCK_TEX_TEMPLATE.tex_compiler
        and template.documentclass == _STOCK_TEX_TEMPLATE.documentclass
        and template.preamble == _STOCK_TEX_TEMPLATE.preamble
    )


def house_tex_job(expression, environment=None, tex_template=None):
    """The (expression, environment, template) Manim will actually compile.

    Shared with the render driver's batch precompile so both produce the same
    cache files. Returns None for custom templates, which are left alone.
    """
    if not (_is_stock(tex_template) or tex_template is HOUSE_TEX_TEMPLATE):
        return None
    # Computer Modern's own superscript prime is the classic f'(x): no rewrite.
    return expression, environment, HOUSE_TEX_TEMPLATE


_tex_to_svg_file = tex_mobject.tex_to_svg_file
if not getattr(_tex_to_svg_file, "__eduvids_fallback__", False):

    def _tex_with_fallback(expression, environment=None, tex_template=None):
        job = house_tex_job(expression, environment, tex_template)
        if job is None:
            return _tex_to_svg_file(expression, environment=environment, tex_template=tex_template)
        try:
            return _tex_to_svg_file(job[0], environment=environment, tex_template=HOUSE_TEX_TEMPLATE)
        except Exception:
            # A package or glyph the house fonts lack: keep the render alive.
            return _tex_to_svg_file(expression, environment=environment, tex_template=_FALLBACK_TEX_TEMPLATE)

    _tex_with_fallback.__eduvids_fallback__ = True
    tex_mobject.tex_to_svg_file = _tex_with_fallback


def _house_tex(base):
    class HouseTex(base):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            _fit_frame(self)

        def __getitem__(self, value):
            # Models often index a one-string formula as if it were split into
            # parts. Styling a part that does not exist should be a no-op, not
            # a failed render.
            if isinstance(value, int) and not -len(self.submobjects) <= value < len(self.submobjects):
                manim.logger.warning(f"{type(self).__name__} has no part {value}; ignoring")
                return manim.VGroup()
            return super().__getitem__(value)

    HouseTex.__name__ = base.__name__
    HouseTex.__qualname__ = base.__qualname__
    return HouseTex


MathTex = _house_tex(manim.MathTex)
Tex = _house_tex(manim.Tex)

# ---------------------------------------------------------------------------
# Layout helpers: one header position and one content area for every scene.
# ---------------------------------------------------------------------------

EDGE = 0.6          # margin from every frame edge
HEADER_GAP = 0.5    # space between the header and the content below it


def header(title, eyebrow=None, font_size=52):
    """Section title at the upper left, the same place in every scene.

    ``eyebrow`` is accepted for older scripts and ignored: small block-capital
    tags above titles ("SUMMARY", "WORKED EXAMPLE") read as template chrome.
    """
    group = manim.VGroup(balanced_text(str(title), font_size=font_size, max_lines=2))
    group.to_corner(manim.UL, buff=EDGE)
    group._eduvids_header = True
    lock_layout(group)
    return group


def content_box(above=None, below=None):
    """(center, width, height) of the free area below ``above`` (a header)."""
    top = config.frame_height / 2 - EDGE
    if above is not None:
        top = above.get_bottom()[1] - HEADER_GAP
    bottom = -config.frame_height / 2 + EDGE
    if below is not None:
        bottom = below.get_top()[1] + HEADER_GAP
    width = config.frame_width - 2 * EDGE
    height = max(top - bottom, 1.0)
    return np.array([0.0, (top + bottom) / 2, 0.0]), width, height


def place_in_content(mob, above=None, fill=0.86, max_scale=1.6, below=None):
    """Scale the main visual to fill the content area and centre it there."""
    center, width, height = content_box(above, below)
    if mob.width > 0 and mob.height > 0:
        factor = min(width * fill / mob.width, height * fill / mob.height, max_scale)
        mob.scale(factor)
    mob.move_to(center)
    return mob


def lock_layout(mob):
    """Keep an explicitly arranged block aligned during progressive reveals."""
    for part in mob.get_family():
        part._eduvids_layout_locked = True
    return mob


def caption(text, font_size=32, color=None):
    """A reserved bottom annotation, outside the hero's content rectangle."""
    mob = balanced_text(text, font_size=font_size, color=color or MUTED, max_lines=2)
    mob.to_edge(manim.DOWN, buff=EDGE)
    return lock_layout(mob)


def layout_scene(visual, title=None, notes=None, side=None, gap=0.7):
    """Lay out the complete composition *before* animating its parts.

    Reserve title and caption lanes. An optional equation/annotation column
    is beside the hero in landscape, below it in portrait. Return the same
    objects, so graphs' c2p coordinates and updaters remain valid.
    """
    center, width, height = content_box(title, notes)
    if side is None:
        place_in_content(visual, above=title, below=notes, fill=0.90)
    else:
        portrait = config.frame_height > config.frame_width
        if portrait:
            side_width, side_height = width, height * 0.30
            hero_width, hero_height = width, height - side_height - gap
            hero_center = center + manim.UP * (side_height + gap) / 2
            side_center = center - manim.UP * (hero_height + gap) / 2
        else:
            side_width, side_height = (width - gap) * 0.34, height
            hero_width, hero_height = width - side_width - gap, height
            hero_center = center + manim.LEFT * (side_width + gap) / 2
            side_center = center + manim.RIGHT * (hero_width + gap) / 2
        for mob, w, h, point in ((visual, hero_width, hero_height, hero_center),
                                  (side, side_width, side_height, side_center)):
            if mob.width and mob.height:
                mob.scale(min(w * 0.92 / mob.width, h * 0.90 / mob.height, 1.6))
            mob.move_to(point)
        lock_layout(side)
    # The hero's annotations were included in its bounds and keep their anchors.
    lock_layout(visual)
    return visual


def fixed_overlay(scene, *mobjects):
    """Register screen typography without adding it ahead of its reveal.

    ThreeDScene.add_fixed_in_frame_mobjects also adds the object immediately;
    using it before FadeIn causes labels to appear too early.
    """
    if not isinstance(scene.camera, ThreeDCamera):
        raise TypeError("fixed_overlay needs a Cairo ThreeDScene")
    scene.camera.add_fixed_in_frame_mobjects(*mobjects)
    for mob in mobjects:
        mob.set_z_index(100)
    return mobjects[0] if len(mobjects) == 1 else manim.VGroup(*mobjects)


def place_3d_in_content(scene, mob, above=None, below=None, orbit=0.0, fill=0.88):
    """Fit the *projected* hero for a bounded orbit, reserving overlay lanes.

    Never use 2D width/height fitting for a 3D object: its silhouette is a
    function of the camera angle. Camera frame_center also offsets overlays,
    so centre the hero in the camera's screen axes instead.
    """
    camera = scene.camera
    if not isinstance(camera, ThreeDCamera):
        raise TypeError("place_3d_in_content needs a Cairo ThreeDScene")
    center, width, height = content_box(above, below)
    mob.move_to(manim.ORIGIN)
    theta = camera.get_theta()
    camera.reset_rotation_matrix()
    rotation = camera.get_rotation_matrix().copy()
    try:
        for _ in range(5):
            bounds = []
            for angle in np.linspace(theta, theta + orbit, 9 if orbit else 1):
                camera.set_theta(angle)
                camera.reset_rotation_matrix()
                points = camera.project_points(mob.get_all_points())
                bounds.append((points[:, :2].min(axis=0), points[:, :2].max(axis=0)))
            lo = np.min([b[0] for b in bounds], axis=0)
            hi = np.max([b[1] for b in bounds], axis=0)
            factor = min(width * fill / max(hi[0] - lo[0], 1e-6),
                         height * fill / max(hi[1] - lo[1], 1e-6), 1.5)
            # Smaller passes converge despite perspective changing with scale.
            if abs(factor - 1) < 0.01:
                break
            mob.scale(factor, about_point=manim.ORIGIN)
        camera.set_theta(theta)
        camera.reset_rotation_matrix()
        projected = camera.project_points(mob.get_all_points())[:, :2]
        midpoint = (projected.min(axis=0) + projected.max(axis=0)) / 2
        shift = np.array([center[0] - midpoint[0], center[1] - midpoint[1], 0.0])
        # Offset perpendicular to the view; depth and the surface shape survive.
        mob.shift(rotation.T @ (shift / camera.get_zoom()))
    finally:
        camera.set_theta(theta)
        camera.reset_rotation_matrix()
    return mob


# ---------------------------------------------------------------------------
# 3D: surfaces are shaded by height, matte, with continuous normals. Same-colour seams close Cairo cracks without a patch grid.
# A surface the script colours itself (a checkerboard
# of distinct colours, set_fill_by_value) keeps the script's colours.
# ---------------------------------------------------------------------------

def shade_surface(surface, color=None, opacity=None, mesh=False):
    """Colour a Surface by height in one hue, from shadow to highlight."""
    faces = [face for face in surface.submobjects if face.has_points()]
    if not faces:
        return surface
    base = ManimColor(color) if color is not None else PRIMARY
    base_hex = base.to_hex()
    low, high = _mix(base_hex, BG, 0.40), _mix(base_hex, INK, 0.12)
    heights = np.array([face.get_center()[2] for face in faces])
    span = heights.max() - heights.min()
    flat = span < 1e-6
    if flat:
        # A flat sheet: shade by distance from its middle instead.
        centers = np.array([face.get_center()[:2] for face in faces])
        heights = -np.linalg.norm(centers - centers.mean(axis=0), axis=1)
        span = heights.max() - heights.min() or 1.0
    minimum = heights.min()
    levels = (heights - minimum) / span

    def material(t):
        t = float(np.clip(t, 0, 1))
        return _mix(low, base_hex, t / 0.6) if t < 0.6 else _mix(base_hex, high, ((t - 0.6) / 0.4) ** 1.5)

    for face, t in zip(faces, levels):
        tone = material(t)
        anchors = face.get_anchors()
        # Both material and lighting interpolate across each patch, rather
        # than jumping between uniform colours at every patch boundary.
        colors = [tone, tone] if flat else [material((anchors[i][2] - minimum) / span) for i in (0, min(2, len(anchors) - 1))]
        face.set_fill(colors, opacity=face.get_fill_opacity() if opacity is None else opacity)
        face._eduvids_shaded = True
        if mesh:
            face.set_stroke(_mix(tone, INK, 0.12), width=0.35, opacity=0.16)
        else:
            # Same-colour hairline closes Cairo's anti-alias cracks without
            # outlining all 2,000 patches as a distracting wireframe.
            face.set_stroke(tone, width=0.5, opacity=1)
    return surface


def _smooth_surface_normals(surface):
    """Average shared corner normals for continuous Cairo patch lighting."""
    from manim.mobject.three_d.three_d_utils import get_3d_vmob_unit_normal

    corners, buckets = [], {}
    for face in surface:
        if not face.has_points():
            continue
        # Surface patches are closed four-sided VMobjects. Camera shading
        # uses their first and last corner for its Cairo gradient.
        anchors = face.get_anchors()
        normal = get_3d_vmob_unit_normal(face, 0)
        keys = [tuple(np.round(point, 5)) for point in anchors]
        for key in keys:
            buckets.setdefault(key, []).append(normal)
        corners.append((face, keys))
    averaged = {}
    for key, normals in buckets.items():
        # A parametric surface has consistent winding, including at seams.
        normal = np.sum(normals, axis=0)
        averaged[key] = normal / (np.linalg.norm(normal) or 1)
    for face, keys in corners:
        normals = np.array([averaged[keys[0]], averaged[keys[min(2, len(keys) - 1)]]]).T
        face._eduvids_normal_coefficients = np.linalg.pinv(_surface_basis(face)) @ normals


def _surface_basis(face):
    anchors = face.get_anchors()
    a, b = anchors[1] - anchors[0], anchors[3] - anchors[0]
    a = a / (np.linalg.norm(a) or 1)
    b = b / (np.linalg.norm(b) or 1)
    n = np.cross(a, b)
    n = n / (np.linalg.norm(n) or 1)
    return np.column_stack((a, b, n))


_surface_init = manim.Surface.__init__
_surface_checkerboard = manim.Surface.set_fill_by_checkerboard
if not getattr(_surface_init, "__eduvids_shaded__", False):

    def _shaded_init(self, *args, **kwargs):
        kwargs.setdefault("resolution", (48, 48))
        _surface_init(self, *args, **kwargs)
        try:
            colors = self.checkerboard_colors or [self.fill_color]
            hexes = {ManimColor(c).to_hex() for c in colors}
            stock = {ManimColor(manim.BLUE_D).to_hex(), ManimColor(manim.BLUE_E).to_hex()}
            if hexes <= stock:
                base = PRIMARY  # Manim's default blue: use the video's palette
            elif len(hexes) == 1:
                base = ManimColor(hexes.pop())
            else:
                return
            shade_surface(self, base)
            _smooth_surface_normals(self)
        except Exception as error:
            manim.logger.warning(f"surface shading skipped: {error}")
        finally:
            self._eduvids_ready = True

    def _shaded_checkerboard(self, *colors, opacity=None):
        if getattr(self, "_eduvids_ready", False) and len({ManimColor(c).to_hex() for c in colors}) == 1:
            # A single-colour "checkerboard" asks for a solid surface: shade it.
            return shade_surface(self, colors[0], opacity=opacity, mesh=False)
        return _surface_checkerboard(self, *colors, opacity=opacity)

    _shaded_init.__eduvids_shaded__ = True
    manim.Surface.__init__ = _shaded_init
    manim.Surface.set_fill_by_checkerboard = _shaded_checkerboard

# ---------------------------------------------------------------------------
# Motion: calm, smooth entrances, as in 3Blue1Brown videos (no bounce).
# ---------------------------------------------------------------------------


def pop_in(*mobjects, scale=0.6, run_time=0.7, **kwargs):
    """Fade and grow in from ``scale`` on a smooth curve."""
    kwargs.setdefault("rate_func", manim.rate_functions.smooth)
    anims = [manim.FadeIn(mob, scale=scale, run_time=run_time, **kwargs) for mob in mobjects]
    return anims[0] if len(anims) == 1 else manim.AnimationGroup(*anims, lag_ratio=0.12)


def pulse(mob, color=None, scale=1.12, run_time=0.6):
    """A quick swell-and-settle on the thing being named, in ACCENT."""
    return manim.Indicate(mob, color=color or ACCENT, scale_factor=scale, run_time=run_time)


# ---------------------------------------------------------------------------
# Layout guard: a label that would land on a line, another label, or the
# frame edge is moved to the nearest clear spot before it appears.
# ---------------------------------------------------------------------------

_LABEL_TYPES = (manim.Text, manim.MarkupText, manim.SingleStringMathTex, manim.DecimalNumber)
_LEAVING = ("FadeOut", "Uncreate", "Unwrite", "ShrinkToCenter", "FadeTransform")
# Animations that bring in a separate target mobject. (.animate and
# MoveToTarget are Transforms too, but their target is the same object moved
# where the script asked, so it is left alone.)
_REPLACING = {
    "Transform", "ReplacementTransform", "TransformFromCopy", "ClockwiseTransform",
    "CounterclockwiseTransform", "FadeTransform", "FadeTransformPieces",
    "TransformMatchingTex", "TransformMatchingShapes",
}
_PAD = 0.12          # breathing room around the whole text block
_SAFE = EDGE         # use the same safe area as explicit layouts
_STEP, _REACH = 0.1, 2.2


def _is_label(mob):
    if isinstance(mob, _LABEL_TYPES):
        return True
    subs = getattr(mob, "submobjects", None)
    return bool(subs) and type(mob) in (manim.VGroup, manim.Group, manim.VDict) and all(_is_label(s) for s in subs)


def _glyph_boxes(mob, camera=None):
    # Glyph-level boxes allow another label to slip into word spaces or the
    # middle of a multiline paragraph. Typography occupies one rectangle.
    points = mob.get_all_points()
    if not len(points):
        return np.zeros((0, 4))
    if camera is not None and isinstance(camera, ThreeDCamera):
        points = camera.transform_points_pre_display(mob, points.copy())
    lo, hi = points[:, :2].min(axis=0), points[:, :2].max(axis=0)
    return np.array([[lo[0], lo[1], hi[0], hi[1]]])


def _stroke_samples(leaf, camera=None):
    points = leaf.points
    if camera is not None and isinstance(camera, ThreeDCamera):
        points = camera.transform_points_pre_display(leaf, points.copy())
    if len(points) < 4:
        return None
    curves = points[: len(points) // 4 * 4].reshape(-1, 4, 3)[:, :, :2]
    chord = np.linalg.norm(curves[:, 3] - curves[:, 0], axis=1).max(initial=0)
    count = int(np.clip(np.ceil(chord / 0.04), 2, 48))
    t = np.linspace(0, 1, count)[None, :, None]
    p0, p1, p2, p3 = (curves[:, i][:, None, :] for i in range(4))
    samples = ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3
    return samples.reshape(-1, 2)


def _obstacles(scene, skip, region):
    """Points of visible strokes and boxes of glyphs/small solids near region."""
    x0, y0, x1, y1 = region
    points, boxes = [], []
    seen = set()

    def near(lo, hi):
        return not (hi[0] < x0 or lo[0] > x1 or hi[1] < y0 or lo[1] > y1)

    for top in scene.mobjects:
        if id(top) in skip:
            continue
        for mob in top.get_family():
            if id(mob) in skip or id(mob) in seen:
                continue
            if isinstance(mob, (manim.NumberPlane, manim.ImageMobject)):
                seen.update(id(m) for m in mob.get_family())
                continue
            if isinstance(mob, _LABEL_TYPES):
                seen.update(id(m) for m in mob.get_family())
                for box in _glyph_boxes(mob, scene.camera):
                    if near(box[:2], box[2:]):
                        boxes.append(box)
                continue
            if not isinstance(mob, manim.VMobject) or not mob.has_points():
                continue
            seen.add(id(mob))
            displayed = mob.points
            if isinstance(scene.camera, ThreeDCamera):
                displayed = scene.camera.transform_points_pre_display(mob, displayed.copy())
            lo, hi = displayed.min(axis=0), displayed.max(axis=0)
            if not near(lo, hi):
                continue
            if mob.get_stroke_width() > 0 and mob.get_stroke_opacity() > 0.05:
                samples = _stroke_samples(mob, scene.camera)
                if samples is not None:
                    points.append(samples)
            if mob.get_fill_opacity() > 0.5 and (isinstance(scene.camera, ThreeDCamera) or max(hi[0] - lo[0], hi[1] - lo[1]) < 0.6):
                boxes.append((lo[0], lo[1], hi[0], hi[1]))
    points = np.concatenate(points) if points else np.zeros((0, 2))
    return points, np.array(boxes, dtype=float).reshape(-1, 4)


def _clear(glyphs, offset, points, boxes):
    shifted = glyphs + np.array([offset[0], offset[1], offset[0], offset[1]])
    lo = shifted[:, :2] - _PAD
    hi = shifted[:, 2:] + _PAD
    half_w, half_h = config.frame_width / 2 - _SAFE, config.frame_height / 2 - _SAFE
    if lo[:, 0].min() < -half_w or hi[:, 0].max() > half_w or lo[:, 1].min() < -half_h or hi[:, 1].max() > half_h:
        return False
    if len(points):
        inside = (
            (points[:, None, 0] > lo[None, :, 0]) & (points[:, None, 0] < hi[None, :, 0])
            & (points[:, None, 1] > lo[None, :, 1]) & (points[:, None, 1] < hi[None, :, 1])
        )
        if inside.any():
            return False
    if len(boxes):
        overlap = (
            (boxes[:, None, 0] < hi[None, :, 0]) & (boxes[:, None, 2] > lo[None, :, 0])
            & (boxes[:, None, 1] < hi[None, :, 1]) & (boxes[:, None, 3] > lo[None, :, 1])
        )
        if overlap.any():
            return False
    return True


def _inside_outline(glyphs, scene, skip):
    """A label deliberately set inside a closed shape (a value in a circle)."""
    lo, hi = glyphs[:, :2].min(axis=0), glyphs[:, 2:].max(axis=0)
    for top in scene.mobjects:
        if id(top) in skip:
            continue
        for mob in top.get_family():
            if isinstance(mob, manim.VMobject) and mob.has_points() and not isinstance(mob, _LABEL_TYPES):
                mlo, mhi = mob.get_critical_point(manim.DL), mob.get_critical_point(manim.UR)
                if mlo[0] < lo[0] and mlo[1] < lo[1] and mhi[0] > hi[0] and mhi[1] > hi[1] and mob.is_closed():
                    return mob
    return None


_DIRECTIONS = [(0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1),
               (2, 1), (-2, 1), (2, -1), (-2, -1), (1, 2), (-1, 2), (1, -2), (-1, -2)]
_DIRECTIONS = [np.array(d, dtype=float) / np.linalg.norm(d) for d in _DIRECTIONS]


def _place(scene, unit, skip):
    if getattr(unit, "_eduvids_layout_locked", False):
        return
    glyphs = _glyph_boxes(unit)
    if not len(glyphs):
        return
    lo, hi = glyphs[:, :2].min(axis=0), glyphs[:, 2:].max(axis=0)
    region = (lo[0] - _REACH - 1, lo[1] - _REACH - 1, hi[0] + _REACH + 1, hi[1] + _REACH + 1)
    outline = None if isinstance(scene.camera, ThreeDCamera) else _inside_outline(glyphs, scene, skip)
    if outline is not None:
        # Only the outline itself is in the way of a contained label.
        skip = skip | {id(m) for m in outline.get_family()}
    points, boxes = _obstacles(scene, skip, region)
    if _clear(glyphs, (0, 0), points, boxes):
        return
    for radius in np.arange(_STEP, _REACH + 1e-9, _STEP):
        for direction in _DIRECTIONS:
            offset = direction * radius
            if _clear(glyphs, offset, points, boxes):
                unit.shift([offset[0], offset[1], 0])
                return
    # Record failure instead of silently claiming the fallback solved overlap.
    manim.logger.warning("eduvids layout: no clear position for %s", getattr(unit, "original_text", type(unit).__name__))
    for radius in np.arange(_STEP, _REACH + 1e-9, _STEP):
        for direction in _DIRECTIONS:
            if _clear(glyphs, direction * radius, np.zeros((0, 2)), np.zeros((0, 4))):
                unit.shift([direction[0] * radius, direction[1] * radius, 0])
                return


def _walk(animations):
    for anim in animations:
        if not isinstance(anim, manim.Animation):
            continue
        yield anim
        if isinstance(anim, manim.AnimationGroup) and type(anim).__name__ not in _REPLACING:
            yield from _walk(anim.animations)


def _guarded(scene):
    return not isinstance(scene, manim.MovingCameraScene)


def _family_ids(mobs):
    return {id(m) for mob in mobs for m in mob.get_family()}


def _label_units(mob, scene):
    """Walk mixed groups, treating aligned all-text blocks as one unit.

    Never detach an axis number or a live/updater-owned annotation from its
    coordinates. In 3D, only screen overlays can move in screen units.
    """
    if mob.updaters or getattr(mob, "_eduvids_layout_locked", False):
        return
    if isinstance(mob, (manim.Axes, manim.NumberLine, manim.NumberPlane)):
        return
    if _is_label(mob):
        if isinstance(scene.camera, ThreeDCamera):
            if not all(part in scene.camera.fixed_in_frame_mobjects for part in mob.family_members_with_points()):
                return
        yield mob
        return
    for sub in mob.submobjects:
        yield from _label_units(sub, scene)


def _arrange_units(scene, incoming, leaving=()):
    # Make all incoming geometry and labels visible to the collision search
    # before positioning the first label, even within the same play()/add().
    original = list(scene.mobjects)
    scene.mobjects = original + [mob for mob in incoming if mob not in original]
    try:
        skip = _family_ids(leaving)
        if isinstance(scene.camera, ThreeDCamera):
            scene.camera.reset_rotation_matrix()
        for root in incoming:
            for unit in _label_units(root, scene):
                if getattr(unit, "_eduvids_placed", False):
                    continue
                _place(scene, unit, skip | _family_ids([unit]))
                unit._eduvids_placed = True
    finally:
        scene.mobjects = original


def _arrange_incoming(scene, animations):
    on_screen = _family_ids(scene.mobjects)
    leaving, incoming = [], []
    for anim in _walk(animations):
        name = type(anim).__name__
        mob = getattr(anim, "mobject", None)
        if isinstance(anim, manim.AnimationGroup) and name not in _REPLACING:
            continue
        if name.startswith(_LEAVING) and mob is not None:
            leaving.append(mob)
        if name in _REPLACING:
            target = getattr(anim, "target_mobject", None) or getattr(anim, "to_add", None)
            if mob is not None:
                leaving.append(mob)  # it becomes the target
            if target is not None and id(target) not in on_screen:
                incoming.append(target)
        elif mob is not None and id(mob) not in on_screen and not name.startswith(_LEAVING):
            incoming.append(mob)
    _arrange_units(scene, incoming, leaving)


_play = manim.Scene.play
_add = manim.Scene.add
if not getattr(_play, "__eduvids_guard__", False):

    def _guarded_play(self, *args, **kwargs):
        if _guarded(self):
            try:
                _arrange_incoming(self, args)
            except Exception as error:  # the guard must never fail a render
                manim.logger.warning(f"layout guard skipped: {error}")
        return _play(self, *args, **kwargs)

    def _guarded_add(self, *mobjects):
        if _guarded(self):
            try:
                on_screen = _family_ids(self.mobjects)
                _arrange_units(self, [mob for mob in mobjects if id(mob) not in on_screen])
            except Exception as error:
                manim.logger.warning(f"layout guard skipped: {error}")
        return _add(self, *mobjects)

    _guarded_play.__eduvids_guard__ = True
    manim.Scene.play = _guarded_play
    manim.Scene.add = _guarded_add

# ---------------------------------------------------------------------------
# Encoding: retain thin typography and gradients in Manim's intermediate
# movies. PyAV opens the codec lazily on its first frame, so set its quality
# after the stream is created and before any frame is written.
# ---------------------------------------------------------------------------

from manim.scene.scene_file_writer import SceneFileWriter

# Manim < 0.19 uses an FFmpeg pipe instead of a PyAV stream. The optional
# quality override must not prevent those sandboxes from importing the style.
_open_stream = getattr(SceneFileWriter, "open_partial_movie_stream", None)
if _open_stream is not None and not getattr(_open_stream, "__eduvids_quality__", False):

    def _open_quality_stream(self, *args, **kwargs):
        result = _open_stream(self, *args, **kwargs)
        stream = getattr(self, "video_stream", None)
        if stream is not None and stream.codec_context.name == "libx264":
            # Measured against a lossless render of house scenes: superfast at
            # CRF 16 without B-frames matches the old medium/CRF 18 (SSIM
            # 0.99982, PSNR 60.5 vs 59.8 dB) with half the encoder CPU. Without
            # B-frames x264 buffers no frames ahead: ~75 MB less per render, so
            # two renders fit a 1 GB sandbox. Files are ~2.8x the old size
            # (~1 Mbit/s at 1080p).
            stream.options = dict(stream.options, crf="16", preset="superfast", bf="0")
        # Manim queues finished frames for the encoder thread without limit.
        # Each 1080p frame is 8 MB, so a fast scene piled up ~1 GB waiting
        # for x264; a short queue keeps both threads busy at a fixed cost.
        queue = getattr(self, "queue", None)
        if queue is not None and not queue.maxsize:
            queue.maxsize = FRAME_QUEUE
        return result

    _open_quality_stream.__eduvids_quality__ = True
    SceneFileWriter.open_partial_movie_stream = _open_quality_stream

FRAME_QUEUE = 4

# A held frame (every wait and narration hold) arrives once with a repeat
# count; Manim converted the same RGBA frame to YUV again for every repeat.
# Convert it once and resend it, with a fresh timestamp each time so the
# encoder numbers it like any other frame. Every frame is also wrapped in
# place (VideoFrame.from_numpy_buffer) rather than copied into a new frame
# first: the same YUV, converted 4x faster. The array is the renderer's own
# copy of the frame, so nothing else writes to it.
_encode_frames = getattr(SceneFileWriter, "encode_and_write_frame", None)
if _encode_frames is not None and not getattr(_encode_frames, "__eduvids_held__", False):

    def _encode_held(self, frame, num_frames):
        import av

        stream = getattr(self, "video_stream", None)
        if (
            stream is None or frame.shape[:2] != (stream.height, stream.width)
            or not hasattr(av.VideoFrame, "from_numpy_buffer") or not frame.flags.c_contiguous
        ):
            return _encode_frames(self, frame, num_frames)
        source = av.VideoFrame.from_numpy_buffer(frame, format="rgba")
        if num_frames < 2:
            for packet in stream.encode(source):
                self.video_container.mux(packet)
            return
        held = source.reformat(width=stream.width, height=stream.height, format=stream.codec_context.pix_fmt)
        for _ in range(num_frames):
            held.pts = None
            for packet in stream.encode(held):
                self.video_container.mux(packet)

    _encode_held.__eduvids_held__ = True
    SceneFileWriter.encode_and_write_frame = _encode_held


# ---------------------------------------------------------------------------
# Watermark: composited into each frame as it is written, so the finished
# video needs no second encoding pass.
# ---------------------------------------------------------------------------

WATERMARK = "__EDUVIDS_WATERMARK__"
_mark = {}


def _watermark_patch(width, height):
    key = (width, height)
    if key not in _mark:
        from manim.camera.camera import Camera as _Camera

        camera = _Camera(pixel_width=width, pixel_height=height, background_opacity=0,
                         frame_width=config.frame_width, frame_height=config.frame_height)
        mob = Text(WATERMARK, font_size=18, color=INK, _fit=False)
        unit = config.frame_width / width
        mob.move_to([
            config.frame_width / 2 - 28 * unit - mob.width / 2,
            -config.frame_height / 2 + 24 * unit + mob.height / 2,
            0,
        ])
        camera.capture_mobjects([mob])
        rgba = camera.pixel_array.astype(float) / 255
        alpha = rgba[:, :, 3]
        rows, cols = np.nonzero(alpha)
        if not len(rows):
            _mark[key] = None
        else:
            y0, y1, x0, x1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
            patch_alpha = alpha[y0:y1, x0:x1][:, :, None]
            # Cairo stores premultiplied colour; recover the straight colour.
            straight = rgba[y0:y1, x0:x1, :3] / np.maximum(patch_alpha, 1e-6)
            _mark[key] = (y0, y1, x0, x1, straight * 255, patch_alpha * 0.55)
    return _mark[key]


if WATERMARK and WATERMARK != "__EDUVIDS_" + "WATERMARK__":
    from manim.scene.scene_file_writer import SceneFileWriter

    _write_frame = SceneFileWriter.write_frame
    _last = [None, None]

    def _write_marked(self, frame, *args, **kwargs):
        if isinstance(frame, np.ndarray) and frame.ndim == 3:
            if _last[0] is frame:
                return _write_frame(self, _last[1], *args, **kwargs)
            patch = _watermark_patch(frame.shape[1], frame.shape[0])
            if patch is not None:
                y0, y1, x0, x1, rgb, a = patch
                # The Cairo renderer hands over a fresh copy of each frame
                # (renderer.get_frame), so mark that copy without another
                # 8 MB copy. Anything that may be shared is copied first.
                camera = getattr(getattr(self, "renderer", None), "camera", None)
                shared = frame.base is not None or not frame.flags.writeable or (
                    camera is not None and frame is getattr(camera, "pixel_array", None)
                )
                marked = frame.copy() if shared else frame
                region = marked[y0:y1, x0:x1, :3].astype(float)
                marked[y0:y1, x0:x1, :3] = (region * (1 - a) + rgb * a).astype(frame.dtype)
                _last[0], _last[1] = frame, marked
                return _write_frame(self, marked, *args, **kwargs)
        return _write_frame(self, frame, *args, **kwargs)

    SceneFileWriter.write_frame = _write_marked

# ---------------------------------------------------------------------------
# Scene soundtracks: Manim encodes each scene's audio to AAC only because an
# MP4 will not hold WAV. The postprocess decodes every scene's audio again and
# encodes the final soundtrack once, so store it losslessly (ALAC, also valid
# in MP4): 5x cheaper than AAC, and one lossy generation fewer.
# ---------------------------------------------------------------------------

import manim.scene.scene_file_writer as _writer_module

_convert_audio = _writer_module.convert_audio
if not getattr(_convert_audio, "__eduvids_lossless__", False):

    def _convert_lossless(input_path, output_path, codec_name):
        if codec_name != "aac":
            return _convert_audio(input_path, output_path, codec_name)
        import av

        with av.open(input_path) as source, av.open(output_path, "w", format="ipod") as output:
            stream = output.add_stream("alac", rate=source.streams.audio[0].rate)
            for frame in source.decode(source.streams.audio[0]):
                for packet in stream.encode(frame):
                    output.mux(packet)
            for packet in stream.encode():
                output.mux(packet)

    _convert_lossless.__eduvids_lossless__ = True
    _writer_module.convert_audio = _convert_lossless

# ---------------------------------------------------------------------------
# Errors: an exception raised while an animation plays (in an updater, an
# always_redraw function, an interpolation) left Manim's encoder thread waiting
# for frames forever, so the process never exited and the render job ran into
# its 30-minute timeout instead of reporting the error for repair. Let the
# thread finish so the error surfaces at once.
# ---------------------------------------------------------------------------

from manim.renderer.cairo_renderer import CairoRenderer as _CairoRenderer

_renderer_play = _CairoRenderer.play
if not getattr(_renderer_play, "__eduvids_release__", False):

    def _play_releasing_writer(self, scene, *args, **kwargs):
        try:
            return _renderer_play(self, scene, *args, **kwargs)
        except BaseException:
            writer = getattr(self, "file_writer", None)
            thread = getattr(writer, "writer_thread", None)
            if thread is not None and thread.is_alive():
                writer.queue.put((-1, None))
            raise

    _play_releasing_writer.__eduvids_release__ = True
    _CairoRenderer.play = _play_releasing_writer

# ---------------------------------------------------------------------------
# Segments: the render driver can split one long scene across processes.
# EDUVIDS_SEGMENT="start,end" (seconds) renders only the scene's frames in
# that span, counted the way a whole render counts them, and fast-forwards
# through the rest. Every process numbers frames identically, so the segments
# partition the whole render's frames, even inside one long animation (a
# camera move), and their movies concatenate into the full scene.
# ---------------------------------------------------------------------------

_SEGMENT = os.environ.get("EDUVIDS_SEGMENT")
if _SEGMENT:
    from manim.renderer.cairo_renderer import CairoRenderer
    from manim.utils.exceptions import EndSceneEarlyException
    from tqdm import tqdm

    _segment_first, _segment_last = (round(float(value) * config.frame_rate) for value in _SEGMENT.split(","))

    def _frame_count(scene):
        """Frames this play adds to a whole render (see CairoRenderer.play)."""
        dt = 1 / config.frame_rate
        if scene.is_current_animation_frozen_frame():
            return int(scene.duration / dt)
        return len(np.arange(0, scene.duration, dt))

    _cairo_skipping = CairoRenderer.update_skipping_status
    _cairo_play = CairoRenderer.play
    _cairo_freeze = CairoRenderer.freeze_current_frame
    _compile = manim.Scene.compile_animation_data
    _progression = manim.Scene._get_animation_time_progression

    def _segment_skipping(self):
        _cairo_skipping(self)
        if getattr(self, "_eduvids_frame", 0) >= _segment_last:
            self.skip_animations = True
            raise EndSceneEarlyException()

    def _segment_compile(self, *args, **kwargs):
        result = _compile(self, *args, **kwargs)
        start = getattr(self.renderer, "_eduvids_frame", 0)
        self.renderer._eduvids_span = (start, start + _frame_count(self))
        if start + _frame_count(self) <= _segment_first:
            self.renderer.skip_animations = True  # wholly before the segment
        return result

    def _overlap(renderer, count):
        start, _ = renderer._eduvids_span
        return max(0, _segment_first - start), min(count, _segment_last - start)

    def _segment_progression(self, animations, duration):
        times = _progression(self, animations, duration)
        if self.renderer.skip_animations:
            # A rendered animation's updaters last run at its final frame's
            # time, not at its run time; stop there too, so dt-driven updaters
            # (a dot flowing along a path) keep the whole render's phase.
            times.close()
            return tqdm(list(np.arange(0, duration, 1 / config.frame_rate))[-1:], disable=True)
        low, high = _overlap(self.renderer, len(times.iterable))
        kept = list(times.iterable)[low:high]
        times.close()
        return tqdm(kept, disable=True)

    def _segment_freeze(self, duration):
        low, high = _overlap(self, int(duration / (1 / config.frame_rate)))
        if high > low:
            self.add_frame(self.get_frame(), num_frames=high - low)

    def _segment_play(self, scene, *args, **kwargs):
        before = self.time
        _cairo_play(self, scene, *args, **kwargs)
        start, end = self._eduvids_span
        self._eduvids_frame = end
        # As far as a whole render would have advanced, so narration added
        # later (and the soundtrack) lands on the same frames.
        self.time = before + (end - start) / config.frame_rate

    _update_frame = CairoRenderer.update_frame

    def _segment_update_frame(self, *args, **kwargs):
        # A skipped animation writes no frames, so drawing its static
        # background or held frame (a full 3D render each) is wasted.
        if self.skip_animations:
            return None
        return _update_frame(self, *args, **kwargs)

    CairoRenderer.update_frame = _segment_update_frame
    CairoRenderer.update_skipping_status = _segment_skipping
    CairoRenderer.play = _segment_play
    CairoRenderer.freeze_current_frame = _segment_freeze
    manim.Scene.compile_animation_data = _segment_compile
    manim.Scene._get_animation_time_progression = _segment_progression

# Export the neutrals as colours too, so they work with interpolate_color().
INK, MUTED, BG = ManimColor(INK), ManimColor(MUTED), ManimColor(BG)

__all__ = [
    "PRIMARY", "ACCENT", "SECONDARY", "TERTIARY", "INK", "MUTED", "BG",
    "HOUSE_TEX_TEMPLATE",
    "Text", "MarkupText", "MathTex", "Tex", "balanced_text",
    "header", "content_box", "place_in_content", "sentence_case",
    "caption", "layout_scene", "lock_layout", "fixed_overlay", "place_3d_in_content",
    "glow", "shade_surface", "pop_in", "pulse", "AXIS_COLOR", *_named,
]
