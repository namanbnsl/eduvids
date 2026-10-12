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

_open_stream = SceneFileWriter.open_partial_movie_stream
if not getattr(_open_stream, "__eduvids_quality__", False):

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
