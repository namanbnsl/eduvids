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
                return _lit(self, vmobject, graded)
            except Exception:
                pass
        return _modified_rgbas(self, vmobject, graded)

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
    group.set_z_index(50)  # zoomed or moving content passes beneath it
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
    mob._eduvids_overlay = True  # a screen lane: zoom_to leaves it in place
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
            stream.options = dict(stream.options, crf="18")
        return result

    _open_quality_stream.__eduvids_quality__ = True
    SceneFileWriter.open_partial_movie_stream = _open_quality_stream

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
                marked = frame.copy()
                region = marked[y0:y1, x0:x1, :3].astype(float)
                marked[y0:y1, x0:x1, :3] = (region * (1 - a) + rgb * a).astype(frame.dtype)
                _last[0], _last[1] = frame, marked
                return _write_frame(self, marked, *args, **kwargs)
        return _write_frame(self, frame, *args, **kwargs)

    SceneFileWriter.write_frame = _write_marked

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

# ---------------------------------------------------------------------------
# Visual storytelling: show scale, populations, insides and processes, so an
# idea is seen rather than only named. A crowd of a thousand atoms zooms in
# to one atom, which then opens up into its nucleus and shells.
#
# Built for Cairo speed: a crowd is ONE path (one draw call, one colour) with
# the picked item drawn on top as its own mobject; a zoom transforms points
# in place; nothing here adds an updater except flow(), which is motion.
# ---------------------------------------------------------------------------


def _item_template(item, size):
    """A unit-sized VMobject outline for one member of a crowd."""
    if isinstance(item, manim.VMobject):
        mob = item.copy()
    elif item == "square":
        mob = manim.Square(side_length=1)
    elif item == "person":
        mob = person(height=1)
    else:
        # Four cubic arcs are indistinguishable from eight at crowd sizes and
        # halve Cairo's per-curve path cost.
        mob = manim.Circle(radius=0.5, num_components=5)
    parts = [m for m in mob.family_members_with_points()]
    template = manim.VMobject()
    for part in parts:
        template.append_points(part.points)
    template.move_to(manim.ORIGIN)
    if template.height > 0:
        template.scale(size / max(template.height, template.width))
    return template


class Crowd(manim.VMobject):
    """Many identical items as one path: thousands cost one draw call.

    ``crowd.item(i)`` is a separate copy of item ``i`` to spotlight, zoom into
    or transform; ``crowd.subset(indices, color)`` recolours a share of the
    crowd ("one in a hundred") as another Crowd drawn on top.
    """

    def __init__(self, positions, template, color=None, opacity=1.0, **kwargs):
        super().__init__(**kwargs)
        self._stride = len(template.points)
        positions = np.array(positions, dtype=float).reshape(-1, 3)
        if len(positions):
            self.points = (template.points[None, :, :] + positions[:, None, :]).reshape(-1, 3)
        self.set_fill(ManimColor(color) if color is not None else PRIMARY, opacity=opacity)
        self.set_stroke(width=0)
        self._eduvids_layout_locked = True  # unlabelled geometry: guard skips it

    def __len__(self):
        return len(self.points) // self._stride if self._stride else 0

    def _items(self, points=None):
        return (self.points if points is None else points).reshape(-1, self._stride, 3)

    def _clip(self, points, top, bottom):
        """Only the items to draw: those inside the frame that stay clear of
        the title and caption lanes. Cairo then draws a zoomed-in lattice's
        hundred visible dots instead of all of them. The full layout is kept
        by the zoom, so a later zoom (in or out) starts from every item."""
        items = self._items(points)
        half_width = config.frame_width / 2
        top = min(top, config.frame_height / 2)
        bottom = max(bottom, -config.frame_height / 2)
        lo, hi = items.min(axis=1), items.max(axis=1)
        keep = (hi[:, 1] <= top) & (lo[:, 1] >= bottom) & (hi[:, 0] >= -half_width) & (lo[:, 0] <= half_width)
        if keep.all():
            return points
        if not keep.any():
            return np.zeros((0, 3))
        return items[keep].reshape(-1, 3)

    # Item indices refer to the layout before any zoom: pick items with
    # item(), subset() or nearest() before zooming in.
    def centers(self):
        """Current centre of every item (follows moves and zooms)."""
        return self._items().mean(axis=1)

    def nearest(self, point=None):
        """Index of the item closest to ``point`` (default: the middle)."""
        point = self.get_center() if point is None else np.asarray(point)
        return int(np.argmin(np.linalg.norm(self.centers() - point, axis=1)))

    def _piece(self, indices, color, grow=1.0):
        piece = Crowd([], manim.VMobject(), color=ManimColor(color) if color is not None else ACCENT)
        piece._stride = self._stride
        count = len(self)
        # Generated code sometimes counts from 1 or past the end: wrap, don't fail.
        indices = [int(i) % count for i in indices] if count else []
        items = self._items()[indices]
        if len(items):
            if grow != 1:
                # Each member swells about its own centre, so a lit share
                # reads at a glance in a crowd of a thousand.
                middles = items.mean(axis=1, keepdims=True)
                items = middles + (items - middles) * grow
            piece.points = items.reshape(-1, 3).copy()
        piece.set_z_index(self.z_index + 1)
        return piece

    def item(self, index=None, color=None):
        """A standalone copy of one item, in ACCENT, exactly on top of it."""
        return self._piece([self.nearest() if index is None else index], color)

    def subset(self, indices, color=None, grow=1.0):
        """Items ``indices`` as one recoloured crowd drawn over this one;
        ``grow`` (e.g. 1.4) enlarges each so a small share stands out."""
        return self._piece(indices, color, grow)


def crowd(count=400, width=None, height=None, item="dot", color=None, fill=0.72,
          jitter=0.0, seed=7, opacity=1.0):
    """``count`` items packed into a ``width`` x ``height`` block.

    By default the block fills the content area below a header (landscape or
    portrait), so a thousand people stay legible in a Short too.
    ``item`` is "dot", "square", "person" or any VMobject (its outline is
    reused). ``fill`` is the item size as a share of the grid spacing;
    ``jitter`` (0-0.5) loosens the grid into a gas or a crowd of people.
    A few thousand items still render quickly; for "billions", show a dense
    block and say the number, then zoom_to one item.
    """
    count = max(1, int(count))
    if width is None or height is None:
        # Below a one-line header, above an optional caption.
        top = config.frame_height / 2 - EDGE - 0.75 - HEADER_GAP
        bottom = -config.frame_height / 2 + EDGE + 0.6
        area_w, area_h = (config.frame_width - 2 * EDGE) * 0.92, (top - bottom) * 0.92
        width = area_w if width is None else width
        height = area_h if height is None else height
    shape = _item_template(item, 1.0)
    aspect = (shape.width / shape.height) if shape.height else 1.0  # tall people get narrow cells
    ideal = np.sqrt(count * width / (height * aspect))
    cols = max(1, int(np.ceil(ideal)))
    # Prefer a column count that fills the last row (1000 -> 40 x 25).
    for candidate in sorted(range(max(1, int(ideal * 0.9)), int(ideal * 1.12) + 2), key=lambda c: abs(c - ideal)):
        if count % candidate == 0:
            cols = candidate
            break
    rows = int(np.ceil(count / cols))
    pitch = min(height / rows, width / (cols * aspect))
    dx, dy = pitch * aspect, pitch
    rng = np.random.default_rng(seed)
    positions = []
    last = count - (rows - 1) * cols  # a short last row is centred
    for index in range(count):
        r, c = divmod(index, cols)
        width_here = last if r == rows - 1 else cols
        x = (c - (width_here - 1) / 2) * dx
        y = ((rows - 1) / 2 - r) * dy
        if jitter:
            x, y = np.array([x, y]) + rng.uniform(-jitter, jitter, 2) * np.array([dx, dy])
        positions.append((x, y, 0.0))
    mob = Crowd(positions, _item_template(item, max(dx, dy) * fill), color=color, opacity=opacity)
    mob.rows, mob.cols = rows, cols  # index = row * cols + col, row 0 at the top
    return mob


def _screen_lane(mob):
    return getattr(mob, "_eduvids_header", False) or getattr(mob, "_eduvids_overlay", False)


def _lanes(scene):
    """Title, caption and scale-bar mobjects wherever they sit. Playing an
    AnimationGroup makes Manim regroup scene.mobjects under an anonymous
    Group, so lanes are searched in every family, not only at the top."""
    found, seen = [], set()
    for top in scene.mobjects:
        for mob in top.get_family():
            if _screen_lane(mob) and id(mob) not in seen:
                found.append(mob)
                seen.update(id(m) for m in mob.get_family())
    return found


def _units(scene, protected):
    """The largest pieces of the scene containing nothing in ``protected``
    (ids): what a zoom moves or a spotlight dims."""
    def walk(mob):
        family = mob.get_family()
        if id(mob) in protected:
            return
        if not any(id(m) in protected for m in family):
            if any(m.has_points() for m in family):
                yield mob
            return
        for sub in mob.submobjects:
            yield from walk(sub)

    for top in scene.mobjects:
        yield from walk(top)


class _ZoomPart(manim.Animation):
    """Scale one top-level mobject about ``focus`` exponentially (a camera
    zoom has constant perceived speed) while the focus glides to ``to``.
    Crowd items that would cross the title or caption lane are hidden."""

    def create_starting_mobject(self):
        return self.mobject  # points are snapshotted instead of deep-copied

    def __init__(self, mobject, focus, factor, shift, lane=None, **kwargs):
        self.focus, self.factor, self.shift = np.asarray(focus), float(factor), np.asarray(shift)
        self.lane = lane
        super().__init__(mobject, **kwargs)

    def begin(self):
        self._snapshot = []
        for mob in self.mobject.family_members_with_points():
            points = mob.points
            hidden = getattr(mob, "_eduvids_unclipped", None)
            # A crowd clipped by an earlier zoom resumes from its full layout.
            if hidden is not None and hidden[1].shape == points.shape and np.array_equal(hidden[1], points):
                points = hidden[0]
            self._snapshot.append((mob, points.copy()))
        super().begin()

    def interpolate_mobject(self, alpha):
        t = self.rate_func(alpha)
        k = self.factor ** t
        for mob, points in self._snapshot:
            moved = (points - self.focus) * k + self.focus + self.shift * t
            if isinstance(mob, Crowd) and self.lane is not None:
                shown = mob._clip(moved, *self.lane)
                mob._eduvids_unclipped = (moved, shown)
                mob.points = shown
            else:
                mob.points = moved


def zoom_to(scene, target, factor=None, to=None, keep=(), fill=0.55, run_time=2.5,
            rate_func=None):
    """Zoom the whole picture into ``target`` (a mobject or a point).

    Headers, captions, scale bars and anything in ``keep`` stay put, like
    text on a camera lens. By default the target grows to about ``fill`` of
    the content area and glides to its centre. ``factor`` < 1 zooms out;
    ``factor=1`` pans. Play several in a row for a powers-of-ten journey,
    swapping in finer detail between them with reveal_detail().
    """
    lanes = _lanes(scene)
    title = next((mob for mob in lanes if getattr(mob, "_eduvids_header", False)), None)
    notes = next((mob for mob in lanes if getattr(mob, "_eduvids_overlay", False) and mob.get_center()[1] < 0), None)
    center, width, height = content_box(title, notes)
    focus = np.asarray(target, dtype=float) if isinstance(target, (list, tuple, np.ndarray)) else target.get_center()
    if factor is None:
        size = max(target.height, target.width * height / width, 1e-3) if isinstance(target, manim.Mobject) else 1.0
        factor = height * fill / size
    factor = float(np.clip(factor, 1e-4, 1e4))
    destination = center if to is None else np.asarray(to, dtype=float)
    # In a ThreeDScene, screen overlays stay put like the title.
    kept = _family_ids([*keep, *lanes, *getattr(scene.camera, "fixed_in_frame_mobjects", ())])
    parts = list(_units(scene, kept))
    if not parts:
        return manim.Wait(run_time)
    # Updaters keep running, so live readouts and flows follow the zoom.
    kwargs = {"run_time": run_time, "rate_func": rate_func or manim.rate_functions.smooth,
              "suspend_mobject_updating": False}
    top = title.get_bottom()[1] - 0.15 if title is not None else np.inf
    bottom = notes.get_top()[1] + 0.15 if notes is not None else -np.inf
    return manim.AnimationGroup(*[_ZoomPart(mob, focus, factor, destination - focus, lane=(top, bottom), **kwargs)
                                  for mob in parts])


def reveal_detail(source, detail, run_time=1.2):
    """Open ``source`` (a dot, a blob) into ``detail`` laid out where it ends."""
    return manim.FadeTransform(source, detail, stretch=False, run_time=run_time)


class ScaleBar(manim.VGroup):
    """A short ruled bar in the lower right: '1 mm', then '1 nm' as you zoom."""

    def __init__(self, label, length=1.2, color=None):
        color = color or MUTED
        bar = manim.Line(manim.LEFT * length / 2, manim.RIGHT * length / 2, color=color, stroke_width=3)
        ticks = manim.VGroup(*[manim.Line(manim.UP * 0.09, manim.DOWN * 0.09, color=color, stroke_width=3).move_to(end)
                               for end in (bar.get_start(), bar.get_end())])
        text = MathTex(label, font_size=30, color=color).next_to(bar, manim.UP, buff=0.15)
        super().__init__(manim.VGroup(bar, ticks), text)
        self.to_corner(manim.DR, buff=EDGE)
        self._eduvids_overlay = True
        lock_layout(self)

    def relabel(self, label, run_time=0.8):
        new = MathTex(label, font_size=30, color=self[1].get_color()).move_to(self[1])
        lock_layout(new)
        return manim.Transform(self[1], new, run_time=run_time)


def scale_bar(label, length=1.2, color=None):
    return ScaleBar(label, length=length, color=color)


def _alpha_arrays(mob):
    out = []
    for m in mob.get_family():
        if isinstance(m, manim.VMobject):
            out.append((m, *(np.array(getattr(m, name), dtype=float)[:, 3].copy()
                              if len(getattr(m, name, [])) else None
                              for name in ("fill_rgbas", "stroke_rgbas", "background_stroke_rgbas"))))
    return out


class _Dim(manim.Animation):
    """Fade a unit's opacities to ``end`` x their originals, keeping relative
    transparency (a soft fill stays softer than its outline)."""

    def __init__(self, mobject, end, **kwargs):
        self.end = end
        super().__init__(mobject, **kwargs)

    def create_starting_mobject(self):
        return self.mobject

    def begin(self):
        if not hasattr(self.mobject, "_eduvids_alpha"):
            self.mobject._eduvids_alpha = _alpha_arrays(self.mobject)
            self.mobject._eduvids_dim = 1.0
        self.start = self.mobject._eduvids_dim
        super().begin()

    def interpolate_mobject(self, alpha):
        level = self.start + (self.end - self.start) * self.rate_func(alpha)
        for m, *alphas in self.mobject._eduvids_alpha:
            for name, base in zip(("fill_rgbas", "stroke_rgbas", "background_stroke_rgbas"), alphas):
                rgbas = getattr(m, name, None)
                if base is not None and rgbas is not None and len(rgbas) == len(base):
                    rgbas[:, 3] = base * level
        self.mobject._eduvids_dim = level

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        if self.end >= 1:
            del self.mobject._eduvids_alpha


def spotlight(scene, *targets, dim=0.8, run_time=0.8):
    """Dim everything except ``targets`` (no glow, no frame): look here.

    Screen lanes (title, caption) stay lit. Undo with release(scene).
    """
    ids = _family_ids(targets)
    units = list(_units(scene, ids | _family_ids(_lanes(scene))))
    lit = [mob for mob in getattr(scene, "_eduvids_dimmed", []) if id(mob) in ids]
    scene._eduvids_dimmed = units
    animations = [_Dim(mob, 1 - dim, run_time=run_time) for mob in units]
    animations += [_Dim(mob, 1.0, run_time=run_time) for mob in lit if hasattr(mob, "_eduvids_alpha")]
    return manim.AnimationGroup(*animations) if animations else manim.Wait(run_time)


def release(scene, run_time=0.8):
    """Bring every dimmed object back to full strength."""
    units = [mob for mob in getattr(scene, "_eduvids_dimmed", []) if hasattr(mob, "_eduvids_alpha")]
    scene._eduvids_dimmed = []
    animations = [_Dim(mob, 1.0, run_time=run_time) for mob in units]
    return manim.AnimationGroup(*animations) if animations else manim.Wait(run_time)


def explode(group, factor=0.6, run_time=1.4):
    """Pull a group's parts away from its centre: an exploded view of what
    something is made of. assemble(group) puts them back."""
    center = group.get_center()
    animations = []
    for part in group.submobjects:
        offset = (part.get_center() - center) * factor
        part._eduvids_offset = getattr(part, "_eduvids_offset", 0) + offset
        animations.append(part.animate.shift(offset))
    return manim.AnimationGroup(*animations, run_time=run_time) if animations else manim.Wait(run_time)


def assemble(group, run_time=1.2):
    animations = []
    for part in group.submobjects:
        offset = getattr(part, "_eduvids_offset", None)
        if offset is not None:
            animations.append(part.animate.shift(-offset))
            del part._eduvids_offset
    return manim.AnimationGroup(*animations, run_time=run_time) if animations else manim.Wait(run_time)


def _sample_path(points, per_curve=12):
    """Points along a VMobject's Bezier curves and their running arc length."""
    curves = points[: len(points) // 4 * 4].reshape(-1, 4, 3)
    t = np.linspace(0, 1, per_curve, endpoint=False)[None, :, None]
    p0, p1, p2, p3 = (curves[:, i][:, None, :] for i in range(4))
    track = ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3).reshape(-1, 3)
    track = np.vstack([track, curves[-1, 3]])
    cumulative = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(track, axis=0), axis=1))])
    return track, cumulative


class Flow(manim.VMobject):
    """Particles streaming along a path: current, blood, heat, signals.

    The dots follow the path wherever it goes, including through a zoom."""

    def __init__(self, path, count=12, speed=1.2, radius=0.07, color=None):
        super().__init__()
        self.path, self.count, self.speed, self.phase = path, count, speed, 0.0
        self._path_points = None
        self._dot = manim.Circle(radius=radius).points
        self.set_fill(ManimColor(color) if color is not None else ACCENT, opacity=1)
        self.set_stroke(width=0)
        self._eduvids_layout_locked = True
        self._redraw()
        self.add_updater(lambda mob, dt: mob._advance(dt))

    def _redraw(self):
        points = self.path.points
        if self._path_points is None or points.shape != self._path_points.shape or not np.array_equal(points, self._path_points):
            self._path_points = points.copy()
            self._track, self._cumulative = _sample_path(points)
            self._length = max(self._cumulative[-1], 1e-6)
        offsets = (self.phase + np.arange(self.count) / self.count) % 1 * self._length
        centers = np.stack([np.interp(offsets, self._cumulative, self._track[:, k]) for k in range(3)], axis=1)
        self.points = (self._dot[None] + centers[:, None]).reshape(-1, 3)

    def _advance(self, dt):
        self.phase = (self.phase + dt * self.speed / self._length) % 1
        self._redraw()

    def stop(self):
        self.clear_updaters()
        return self


def flow(path, count=12, speed=1.2, radius=0.07, color=None):
    if not path.has_points() and path.submobjects:
        path = path.family_members_with_points()[0]
    """Dots that keep moving along ``path`` while the narration runs.

    The path itself can be any curve (a wire loop, an artery, an orbit);
    draw it separately. Call .stop() before a long still hold.
    """
    return Flow(path, count=count, speed=speed, radius=radius, color=color)


def to_scale(*mobjects, sizes, height=3.2, gap=0.7, min_height=0.04):
    """Line things up at their true relative sizes on one baseline.

    to_scale(earth, sun, sizes=[1, 109]) makes the gap in size visible
    instead of only quoted; tiny objects stay a visible speck.
    """
    largest = max(sizes)
    for mob, size in zip(mobjects, sizes):
        if mob.height > 0 and largest > 0:
            mob.scale_to_fit_height(max(height * size / largest, min_height))
    return manim.VGroup(*mobjects).arrange(manim.RIGHT, buff=gap, aligned_edge=manim.DOWN)


def ghost(mob, opacity=0.25):
    """A faded copy left behind as a 'before' to compare with 'after'."""
    copy = mob.copy()
    for part in copy.get_family():
        if isinstance(part, manim.VMobject):
            part.set_fill(opacity=part.get_fill_opacity() * opacity, family=False)
            part.set_stroke(opacity=part.get_stroke_opacity() * opacity, family=False)
    copy.set_z_index(mob.z_index - 1)
    lock_layout(copy)
    return copy


# ---------------------------------------------------------------------------
# Props: recognisable, flat objects drawn in the house palette, so a video
# about atoms shows an atom, and probability shows people or dice.
# ---------------------------------------------------------------------------

_SHELLS = (2, 8, 8, 18, 18, 32)


class Atom(manim.VGroup):
    """A Bohr-model atom: packed nucleus, faint orbits, electrons on them.

    ``.protons`` and ``.neutrons`` are the nucleus balls by kind (to sort,
    count or recolour them); ``.shells`` holds each shell's electrons."""

    def __init__(self, protons=6, neutrons=None, electrons=None, radius=1.6,
                 electron_color=None, proton_color=None, neutron_color=None):
        neutrons = protons if neutrons is None else neutrons
        electrons = protons if electrons is None else electrons
        nucleons = protons + neutrons
        ball = 0.11
        rng = np.random.default_rng(protons * 31 + neutrons)
        kinds = np.array([1] * protons + [0] * neutrons)
        rng.shuffle(kinds)
        nucleus = manim.VGroup()
        golden = np.pi * (3 - np.sqrt(5))
        for i, kind in enumerate(kinds):
            r = ball * 0.95 * np.sqrt(i + 0.5)
            angle = i * golden
            tone = (proton_color or SECONDARY) if kind else (neutron_color or GREY_B)
            nucleus.add(manim.Circle(radius=ball, stroke_color=BG, stroke_width=1.5,
                                     fill_color=tone, fill_opacity=1).move_to([r * np.cos(angle), r * np.sin(angle), 0]))
        if nucleons > 0:
            # Innermost nucleons drawn last so the cluster reads as a ball.
            nucleus.submobjects.reverse()
            kinds = kinds[::-1]
        self.protons = manim.VGroup(*[ball for ball, kind in zip(nucleus, kinds) if kind])
        self.neutrons = manim.VGroup(*[ball for ball, kind in zip(nucleus, kinds) if not kind])
        shells, counts, left = [], [], electrons
        for capacity in _SHELLS:
            if left <= 0:
                break
            counts.append(min(capacity, left))
            left -= capacity
        # Built at natural size (shells evenly spaced outside the nucleus),
        # then scaled so the outermost orbit has the requested radius.
        inner = (nucleus.width / 2 if nucleons else 0) + 0.45
        orbits, dots = manim.VGroup(), manim.VGroup()
        for k, n in enumerate(counts):
            r = inner + 0.5 * k
            orbit = manim.Circle(radius=r, stroke_color=MUTED, stroke_width=2, stroke_opacity=0.7)
            orbits.add(orbit)
            shell = manim.VGroup(*[
                manim.Dot(radius=0.075, color=electron_color or PRIMARY).move_to(
                    [r * np.cos(2 * np.pi * j / n + k * 0.6), r * np.sin(2 * np.pi * j / n + k * 0.6), 0])
                for j in range(n)])
            dots.add(shell)
            shells.append(shell)
        super().__init__(orbits, nucleus, dots)
        self.orbits, self.nucleus, self.electrons, self.shells = orbits, nucleus, dots, shells
        outer = inner + 0.5 * (len(counts) - 1) if counts else nucleus.width / 2
        if outer > 0:
            self.scale(radius / outer, about_point=nucleus.get_center() if nucleons else manim.ORIGIN)

    def orbit(self, turns=0.5, run_time=3.0):
        """Electrons circle their shells (inner shells faster); no updater."""
        center = self.nucleus.get_center()
        return manim.AnimationGroup(*[
            manim.Rotate(shell, angle=2 * np.pi * turns / (k + 1) ** 0.5, about_point=center,
                         rate_func=manim.rate_functions.linear)
            for k, shell in enumerate(self.shells)], run_time=run_time)


def atom(protons=6, neutrons=None, electrons=None, radius=1.6, **kwargs):
    return Atom(protons, neutrons, electrons, radius=radius, **kwargs)


_ELEMENT_COLORS = {"H": "GREY_A", "C": "GREY_C", "O": "RED", "N": "BLUE", "Na": "PURPLE",
                   "Cl": "GREEN", "S": "YELLOW", "P": "ORANGE", "F": "TEAL", "Fe": "MAROON"}


def molecule(atoms, bonds=(), scale=1.0, labels=True):
    """atoms: [("O", (0, 0)), ("H", (-0.8, -0.6)), ...]; bonds: [(0, 1), (0, 2, 2)].

    Element colours follow the usual CPK convention at house tones; the third
    entry of a bond is its order (two parallel lines for a double bond).
    """
    group, balls, sticks = manim.VGroup(), manim.VGroup(), manim.VGroup()
    centers = [np.array([x, y, 0.0]) * scale for _, (x, y) in atoms]
    for bond in bonds:
        i, j, order = (*bond, 1)[:3]
        if not (0 <= i < len(centers) and 0 <= j < len(centers)):
            continue
        a, b = centers[i], centers[j]
        normal = np.array([-(b - a)[1], (b - a)[0], 0])
        normal = normal / (np.linalg.norm(normal) or 1) * 0.09 * scale
        for k in range(order):
            offset = normal * (k - (order - 1) / 2) * 2
            sticks.add(manim.Line(a + offset, b + offset, color=GREY_B, stroke_width=6 * scale ** 0.5))
    for (symbol, _), center in zip(atoms, centers):
        r = (0.24 if symbol == "H" else 0.36) * scale
        tone = globals().get(_ELEMENT_COLORS.get(symbol, "GREY_B"), MUTED)
        ball = manim.Circle(radius=r, fill_color=tone, fill_opacity=1, stroke_color=BG, stroke_width=2).move_to(center)
        if labels:
            letter = Text(symbol, font_size=max(20, 30 * scale), color=BG, _fit=False).move_to(center)
            lock_layout(letter)
            ball = manim.VGroup(ball, letter)
        balls.add(ball)
    group.add(sticks, balls)
    group.atoms, group.bonds = balls, sticks
    return group


def person(height=1.0, color=None):
    """A simple head-and-shoulders figure for populations and probability."""
    head = manim.Circle(radius=0.2, num_components=5).move_to([0, 0.3, 0])
    # Shoulders: a rounded top, flat base.
    p = lambda x, y: np.array([x, y, 0.0])
    body = manim.VMobject()
    body.start_new_path(p(-0.32, -0.5))
    body.add_line_to(p(0.32, -0.5))
    body.add_line_to(p(0.32, -0.2))
    body.add_cubic_bezier_curve_to(p(0.32, 0.02), p(0.18, 0.06), p(0, 0.06))
    body.add_cubic_bezier_curve_to(p(-0.18, 0.06), p(-0.32, 0.02), p(-0.32, -0.2))
    body.add_line_to(p(-0.32, -0.5))
    figure = manim.VMobject()
    figure.append_points(head.points)
    figure.append_points(body.points)
    figure.set_fill(ManimColor(color) if color is not None else PRIMARY, opacity=1).set_stroke(width=0)
    figure.scale_to_fit_height(height)
    return figure


_PIPS = {1: [(0, 0)], 2: [(-1, 1), (1, -1)], 3: [(-1, 1), (0, 0), (1, -1)],
         4: [(-1, 1), (1, 1), (-1, -1), (1, -1)], 5: [(-1, 1), (1, 1), (0, 0), (-1, -1), (1, -1)],
         6: [(-1, 1), (1, 1), (-1, 0), (1, 0), (-1, -1), (1, -1)]}


def die(value=6, size=1.0, color=None, pip_color=None):
    """A flat die face showing ``value`` (1-6)."""
    face = manim.RoundedRectangle(width=size, height=size, corner_radius=size * 0.16,
                                  stroke_color=ManimColor(color) if color is not None else PRIMARY, stroke_width=4,
                                  fill_color=ManimColor(color) if color is not None else PRIMARY, fill_opacity=0.18)
    pips = manim.VGroup(*[manim.Dot([x * size * 0.27, y * size * 0.27, 0], radius=size * 0.075,
                                    color=pip_color or INK) for x, y in _PIPS[max(1, min(6, int(value)))]])
    group = manim.VGroup(face, pips)
    group.face, group.pips = face, pips
    return group


def cell(width=4.0, color=None):
    """A flat animal cell: membrane, nucleus, a few organelles."""
    tone = ManimColor(color) if color is not None else PRIMARY
    membrane = manim.Ellipse(width=width, height=width * 0.68, stroke_color=tone, stroke_width=5,
                             fill_color=tone, fill_opacity=0.12)
    nucleus = manim.Circle(radius=width * 0.14, stroke_color=SECONDARY, stroke_width=4,
                           fill_color=SECONDARY, fill_opacity=0.3).shift(manim.LEFT * width * 0.08 + manim.UP * width * 0.03)
    nucleolus = manim.Dot(nucleus.get_center() + manim.RIGHT * width * 0.03, radius=width * 0.035, color=SECONDARY)
    mitochondria = manim.VGroup(*[
        manim.Ellipse(width=width * 0.17, height=width * 0.07, stroke_color=TERTIARY, stroke_width=3,
                      fill_color=TERTIARY, fill_opacity=0.35).rotate(angle).move_to([x * width, y * width, 0])
        for x, y, angle in ((0.25, 0.1, 0.5), (0.18, -0.15, -0.3), (-0.3, -0.12, 1.1))])
    rng = np.random.default_rng(3)
    ribosomes = manim.VGroup(*[
        manim.Dot([x * width, y * width * 0.68, 0], radius=0.03 * width / 4, color=GREY_A)
        for x, y in rng.uniform(-0.36, 0.36, (18, 2)) if (x / 0.4) ** 2 + (y / 0.4) ** 2 < 0.8])
    group = manim.VGroup(membrane, ribosomes, mitochondria, nucleus, nucleolus)
    group.membrane, group.nucleus, group.mitochondria = membrane, manim.VGroup(nucleus, nucleolus), mitochondria
    return group


__all__ += [
    "Crowd", "crowd", "zoom_to", "reveal_detail", "ScaleBar", "scale_bar",
    "spotlight", "release", "explode", "assemble", "Flow", "flow", "to_scale", "ghost",
    "Atom", "atom", "molecule", "person", "die", "cell",
]
