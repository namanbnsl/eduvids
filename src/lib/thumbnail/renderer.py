#!/usr/bin/env python3
"""eduvids thumbnail renderer.

Data in, PNG out: every thumbnail is described by a JSON spec (copy, palette,
hero visual and its parameters). The model never writes code; it only fills
slots that this module validates, lays out and checks.

    renderer.py batch  --spec specs.json --out-dir DIR --font-dir FONTS
    renderer.py render --spec specs.json --index N --out FILE.png --font-dir FONTS [--safe]

Design system
- Canvas 1280x720 on the video's flat near-black canvas, fixed margins and a
  two-column grid: a big headline on the left, one hero on the right. The
  hero is a crisp drawn visual with no glow or shine; 3D heroes are matte,
  in perspective. Legacy explicit ``frame`` specs remain readable, but new
  thumbnails use diagrams whose geometry and labels can be verified.
- Typography is typeset by XeLaTeX in Computer Modern, as in 3Blue1Brown and
  Welch Labs: CMU Serif for text, Latin Modern Math for formulas, so math and prose
  share one family and one baseline.
- One cool hue carries the visual; one warm hue marks the single focal detail
  and the accent words of the headline. No eyebrow or other small tag: the
  headline and the picture carry the thumbnail.
- Curiosity devices are part of the system, not decoration: a struck-through
  wrong intuition in the headline ("~~50%~~ 67%"), one short callout whose
  warm arrow points at the hero's focal detail, and short copy set larger.
- Layout is verified, not hoped for: the copy block, the hero, every label,
  the safe area and YouTube's duration badge are checked for collisions.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field

import numpy as np

# ---------------------------------------------------------------------------
# Canvas and grid (all layout constants are in pixels, converted once)
# ---------------------------------------------------------------------------

WIDTH, HEIGHT = 1280, 720
FRAME_H = 8.0
FRAME_W = FRAME_H * WIDTH / HEIGHT
PX = WIDTH / FRAME_W  # pixels per scene unit (90)


def u(px: float) -> float:
    return px / PX


def x_at(px: float) -> float:
    return -FRAME_W / 2 + u(px)


def y_at(px: float) -> float:
    return FRAME_H / 2 - u(px)


MARGIN_X, MARGIN_Y = 84, 72
TEXT_COL_W = 528
GUTTER = 56
HERO_LEFT = MARGIN_X + TEXT_COL_W + GUTTER
# YouTube draws the duration badge over the bottom-right corner.
BADGE_ZONE = (WIDTH - 168, HEIGHT - 64, WIDTH, HEIGHT)
SAFE_PAD = 40

BG = "#0A0A0A"
INK = "#EDEAE4"
MUTED = "#8A8F98"

PALETTES = {
    "teal-amber": ("#5CD0B3", "#FFD35A"),
    "azure-coral": ("#58C4DD", "#FC6255"),
    "violet-amber": ("#B189C6", "#FFD35A"),
    "teal-rose": ("#5CD0B3", "#E07A9F"),
    "azure-amber": ("#58C4DD", "#FFD35A"),
}

# Type scale (em size in px). Headlines step down a tier only when the copy
# cannot fit the column at the larger size.
# Short, punchy copy earns the larger tiers; it is what reads on a phone.
HEADLINE_TIERS = (124, 108, 92, 84, 76)
HEADLINE_LEADING = 1.06
LABEL_SIZE = 34
CALLOUT_SIZE = 60
CAPTION_SIZE = 30
EQUATION_SIZES = (92, 82, 72, 64)
CAP_HEIGHT = 0.683  # Computer Modern cap height / em

FUNCTION_WORDS = {
    "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "is",
    "it", "its", "of", "on", "or", "the", "to", "vs", "with", "that", "your",
}


class LayoutError(RuntimeError):
    """The composition violates a layout rule (overlap, overflow, safe area)."""


# ---------------------------------------------------------------------------
# Spec handling
# ---------------------------------------------------------------------------

EXPR_TOKEN = re.compile(
    r"sin|cos|tan|exp|log|sqrt|abs|pi|x|y|(?:\d+(?:\.\d*)?|\.\d+)|\*\*|[()+\-*/]"
)
LATEX_COMMANDS = {
    "frac", "dfrac", "tfrac", "sqrt", "int", "iint", "oint", "sum", "prod",
    "lim", "infty", "partial", "nabla", "cdot", "cdots", "ldots", "times",
    "div", "pm", "mp", "mid", "le", "leq", "ge", "geq", "ne", "neq", "approx",
    "equiv", "sim", "simeq", "propto", "to", "rightarrow", "leftarrow",
    "Rightarrow", "iff", "mapsto", "in", "notin", "subset", "subseteq",
    "cup", "cap", "forall", "exists", "emptyset", "vec", "hat", "bar",
    "dot", "ddot", "tilde", "overline", "mathbf", "mathbb", "mathrm",
    "mathcal", "operatorname", "text", "left", "right", "big", "Big",
    "langle", "rangle", "lfloor", "rfloor", "lceil", "rceil", "sin", "cos",
    "tan", "log", "ln", "exp", "det", "max", "min", "hl", "quad", "qquad",
    "imath", "jmath", "ell", "hbar", "prime", "circ", "degree", "angle",
    "triangle", "perp", "parallel", "binom", "alpha", "beta", "gamma",
    "Gamma", "delta", "Delta", "epsilon", "varepsilon", "zeta", "eta",
    "theta", "Theta", "vartheta", "iota", "kappa", "lambda", "Lambda", "mu",
    "nu", "xi", "Xi", "pi", "Pi", "rho", "sigma", "Sigma", "tau", "upsilon",
    "phi", "Phi", "varphi", "chi", "psi", "Psi", "omega", "Omega",
}


def clean_expression(value, variables=("x",)) -> str:
    """Re-validate a plot expression (the TypeScript side already parsed it)."""
    if not isinstance(value, str):
        return ""
    expression = value.replace(" ", "").replace("^", "**")
    if not expression or len(expression) > 100 or "//" in expression:
        return ""
    tokens = EXPR_TOKEN.findall(expression)
    if "".join(tokens) != expression:
        return ""
    allowed_vars = set(variables)
    if any(token in ("x", "y") and token not in allowed_vars for token in tokens):
        return ""
    return expression


def clean_latex(value) -> str:
    """Allow a conservative LaTeX subset: math symbols, no file or macro access."""
    if not isinstance(value, str):
        return ""
    latex = value.strip()
    if not latex or len(latex) > 90:
        return ""
    if re.search(r"[#%~`\"@$]|\^\^", latex):
        return ""
    for command in re.findall(r"\\([A-Za-z]+)", latex):
        if command not in LATEX_COMMANDS:
            return ""
    depth = 0
    for char in latex:
        depth += char == "{"
        depth -= char == "}"
        if depth < 0:
            return ""
    return latex if depth == 0 else ""


BINARY = r"\+|-|\\pm|\\mp|\\times|\\cdot|\\div|\\cup|\\cap"
RELATION = r"=|<|>|\\le|\\leq|\\ge|\\geq|\\ne|\\neq|\\approx|\\equiv|\\sim|\\to|\\propto"


def math_spacing(latex: str) -> str:
    """Colouring wraps a term in a group, which turns "-" or "=" into an
    ordinary symbol and removes its spacing; restore the operator class."""
    latex = re.sub(rf"\\hl\{{\s*({BINARY})\s*\}}", r"\\mathbin{\\hl{\1}}", latex)
    return re.sub(rf"\\hl\{{\s*({RELATION})\s*\}}", r"\\mathrel{\\hl{\1}}", latex)


def make_function(expression: str, variables=("x",)):
    namespace = {
        "sin": np.sin, "cos": np.cos, "tan": np.tan, "exp": np.exp,
        "log": np.log, "sqrt": np.sqrt, "abs": np.abs, "pi": np.pi,
    }
    code = compile(expression, "<expression>", "eval")
    for name in code.co_names:
        if name not in namespace and name not in variables:
            raise ValueError(f"unexpected name in expression: {name}")

    def evaluate(*values):
        scope = dict(namespace)
        scope.update(zip(variables, values))
        with np.errstate(all="ignore"):
            return eval(code, {"__builtins__": {}}, scope)  # noqa: S307 - validated grammar

    return evaluate


def number(value, default, low=None, high=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    value = float(value)
    if not math.isfinite(value):
        return default
    if low is not None and value < low:
        return default
    if high is not None and value > high:
        return default
    return value


# ---------------------------------------------------------------------------
# Typography (XeLaTeX)
# ---------------------------------------------------------------------------

TEX_ESCAPES = {
    "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
    "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def smart_punctuation(text: str) -> str:
    text = re.sub(r"(?<=\w)'(?=\w)", "\u2019", text)
    text = re.sub(r"(^|[\s(\[])'", "\\1\u2018", text)
    text = text.replace("'", "\u2019")
    text = re.sub(r'(^|[\s(\[])"', "\\1\u201c", text)
    text = text.replace('"', "\u201d")
    text = text.replace("...", "\u2026").replace(" -- ", " \u2013 ").replace(" - ", " \u2013 ")
    text = re.sub(r"(?<=\d)-(?=\d)", "\u2013", text)
    return text


def tex_escape(text: str) -> str:
    return "".join(TEX_ESCAPES.get(char, char) for char in text)


def tex_log_errors(message: str) -> str:
    """The "!" error lines (with context) from the TeX log named in Manim's error."""
    match = re.search(r"(/\S+\.log)", message)
    if not match or not os.path.exists(match.group(1)):
        return ""
    with open(match.group(1), encoding="utf-8", errors="replace") as handle:
        lines = handle.read().splitlines()
    picked = [" | ".join(lines[i:i + 3]) for i, line in enumerate(lines) if line.startswith("!")]
    return "TeX: " + " || ".join(picked[:3]) if picked else "TeX log: " + " | ".join(lines[-8:])


SVG_SHAPES = {"path", "use", "rect", "polygon", "polyline", "circle", "ellipse", "line"}


def svg_fills(path: str) -> list:
    """Fill colour of every drawn element in document order, with inheritance."""
    import xml.etree.ElementTree as ElementTree

    fills = []

    def walk(element, fill):
        tag = element.tag.rsplit("}", 1)[-1]
        if tag in ("defs", "clipPath", "mask", "symbol"):
            return
        style = dict(
            item.split(":", 1) for item in (element.get("style") or "").split(";") if ":" in item
        )
        fill = (style.get("fill") or element.get("fill") or fill or "").strip() or None
        if tag in SVG_SHAPES:
            fills.append(fill)
        for child in element:
            walk(child, fill)

    walk(ElementTree.parse(path).getroot(), None)
    return fills


def normalize_hex(value):
    if not value or not value.startswith("#"):
        return None
    value = value[1:]
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return "#" + value.upper() if len(value) == 6 else None


def apply_svg_fills(mob) -> None:
    """Colour glyphs from TeX's own colour output.

    Manim versions differ in whether nested SVG fills survive parsing (0.18
    drops them), so read them from the SVG and apply them glyph by glyph.
    """
    path = getattr(mob, "file_name", None)
    glyphs = mob.family_members_with_points()
    if not path or not os.path.exists(path):
        return
    fills = [normalize_hex(fill) for fill in svg_fills(path)]
    if len(fills) != len(glyphs):
        return
    for glyph, fill in zip(glyphs, fills):
        glyph.set_fill(fill or INK, opacity=1).set_stroke(width=0)


@dataclass
class Typesetter:
    font_dir: str
    cool: str
    warm: str
    region_w: float = 0.0
    _templates: dict = field(default_factory=dict)
    _em_units: dict = field(default_factory=dict)

    def template(self, weight: str):
        from manim import TexTemplate

        if weight in self._templates:
            return self._templates[weight]
        path = self.font_dir.rstrip("/") + "/"
        # Headlines ("SemiBold") and labels both use CMU Serif Roman, the face of
        # the video titles. Computer Modern's 10pt design spaces words for small
        # text, so headlines set at display size get tighter word spacing.
        upright, italic = "cmunrm.otf", "cmunti.otf"
        word_space = ", WordSpace=0.8" if weight == "SemiBold" else ""
        preamble = "\n".join([
            r"\usepackage{amsmath}",
            r"\usepackage{fontspec}",
            r"\usepackage{unicode-math}",
            r"\usepackage{xcolor}",
            r"\defaultfontfeatures{Kerning=On}",
            rf"\setmainfont{{{upright}}}[Path={path}, ItalicFont={italic}, BoldFont={upright}, BoldItalicFont={italic}{word_space}]",
            rf"\setmathfont{{latinmodern-math.otf}}[Path={path}]",
            rf"\definecolor{{ink}}{{HTML}}{{{INK[1:]}}}",
            rf"\definecolor{{muted}}{{HTML}}{{{MUTED[1:]}}}",
            rf"\definecolor{{cool}}{{HTML}}{{{self.cool[1:]}}}",
            rf"\definecolor{{accent}}{{HTML}}{{{self.warm[1:]}}}",
            r"\newcommand{\hl}[1]{\textcolor{accent}{#1}}",
            # The wrong intuition: muted words under a warm rule that overhangs
            # both ends slightly, like a correction made by hand.
            r"\newsavebox{\strikebox}",
            r"\newcommand{\strike}[1]{\sbox{\strikebox}{\color{muted}#1}\usebox{\strikebox}"
            r"\llap{\textcolor{accent}{\rule[0.25em]{\dimexpr\wd\strikebox+0.12em\relax}{0.075em}}\kern-0.06em}}",
            r"\setlength{\tabcolsep}{0pt}",
        ])
        template = TexTemplate(
            tex_compiler="xelatex",
            output_format=".xdv",
            documentclass=r"\documentclass[preview]{standalone}",
            preamble=preamble,
        )
        self._templates[weight] = template
        return template

    def em_units(self, weight: str) -> float:
        """Scene units per em at Manim's default font size, measured once."""
        if weight not in self._em_units:
            probe = self._tex(r"\fontsize{10}{12}\selectfont H", weight)
            self._em_units[weight] = probe.height / CAP_HEIGHT
        return self._em_units[weight]

    def _tex(self, body: str, weight: str):
        from manim import Tex

        try:
            mob = Tex(body, tex_template=self.template(weight), tex_environment=None, color=None)
        except ValueError as error:
            raise RuntimeError(f"{error}\n{tex_log_errors(str(error))}") from None
        apply_svg_fills(mob)
        return mob

    def block(self, lines: list[str], size_px: float, weight="SemiBold",
              color="ink", leading=HEADLINE_LEADING, tracking=0.0):
        """Typeset pre-broken lines as one block so leading is exact."""
        body = (
            rf"\fontsize{{10}}{{{10 * leading:.2f}}}\selectfont"
            + (rf"\addfontfeatures{{LetterSpace={tracking}}}" if tracking else "")
            + rf"\color{{{color}}}"
            + r"\begin{tabular}{@{}l@{}}"
            + r"\\".join(lines)
            + r"\end{tabular}"
        )
        mob = self._tex(body, weight)
        mob.scale(u(size_px) / self.em_units(weight))
        return mob

    def math(self, latex: str, size_px: float, color="ink", weight="Medium",
             highlight_color="cool"):
        latex = math_spacing(latex)
        # Equation heroes use a cool focal term, distinct from warm copy.
        # Do this in TeX so symbol spacing and SVG glyph colours survive.
        if highlight_color != "accent":
            latex = latex.replace(r"\hl{", rf"\textcolor{{{highlight_color}}}{{")
        body = rf"\fontsize{{10}}{{12}}\selectfont\color{{{color}}}$\displaystyle {latex}$"
        mob = self._tex(body, weight)
        mob.scale(u(size_px) / self.em_units(weight))
        return mob


# ---------------------------------------------------------------------------
# Headline copy: tokenising, line breaking, accent colouring
# ---------------------------------------------------------------------------

@dataclass
class Word:
    text: str  # source text, may contain $math$
    start: int
    end: int


def split_words(headline: str) -> list[Word]:
    """Split on spaces outside $...$; '~' binds words that must share a line."""
    words, current, start, in_math = [], "", 0, False
    for index, char in enumerate(headline):
        if char == "$":
            in_math = not in_math
        if char == " " and not in_math:
            if current:
                words.append(Word(current, start, index))
            current, start = "", index + 1
            continue
        if not current:
            start = index
        current += char
    if current:
        words.append(Word(current, start, len(headline)))
    return words


GLYPH_EM = {
    **{c: 0.53 for c in "abcdeghknopqsuvxyz"},
    **{c: 0.27 for c in "fijlrt.,:;'\u2019!|"},
    **{c: 0.80 for c in "mw"},
    **{c: 0.66 for c in "ABCDEFGHKLNOPQRSTUVXYZ"},
    **{c: 0.30 for c in "IJ"},
    **{c: 0.86 for c in "MW"},
    **{c: 0.58 for c in "0123456789?"},
    " ": 0.24, "~": 0.24,
}


def estimate_em(text: str) -> float:
    total = 0.0
    for segment_index, segment in enumerate(text.split("$")):
        if segment_index % 2:
            visible = re.sub(r"\\[A-Za-z]+", "x", segment)
            visible = re.sub(r"[{}_^]", "", visible)
            total += 0.55 * len(visible) + 0.1
        else:
            total += sum(GLYPH_EM.get(char, 0.56) for char in segment)
    return total


def line_options(words: list[Word], accent_span, max_lines=3):
    """Rank line breaks: balanced, phrase-aware, no orphans, accent kept whole."""
    count = len(words)
    options = []

    def visit(start, lines):
        if start == count:
            options.append(lines)
            return
        if len(lines) == max_lines:
            return
        for end in range(start + 1, count + 1):
            visit(end, lines + [(start, end)])

    visit(0, [])
    visible = sum(1 + word.text.count("~") for word in words)
    ranked = []
    for lines in options:
        widths = [estimate_em(" ".join(w.text for w in words[a:b])) for a, b in lines]
        widest = max(widths)
        # Raggedness is normalised so phrase rules, not width, decide close calls.
        score = 12 * sum(((widest - width) / widest) ** 2 for width in widths)
        for a, b in lines[:-1]:
            tail = words[b - 1].text.split("~")[-1].strip(".,:;?!").lower()
            if tail in ("a", "an", "the", "of"):
                score += 40
            elif tail in FUNCTION_WORDS:
                score += 8
            if words[b].text.split("~")[0].lower() == "of":
                score += 10
        sizes = [sum(1 + w.text.count("~") for w in words[a:b]) for a, b in lines]
        if len(lines) > 1 and sizes[-1] == 1 and visible >= 3:
            score += 5
        if visible >= 4 and any(size == 1 for size in sizes[:-1]):
            score += 6
        if len(lines) == 3:
            score += 6 + 6 * sizes.count(1)
        if len(lines) == 1 and widest > 9:
            score += 4
        if accent_span and len(lines) > 1:
            touched = {
                index for index, (a, b) in enumerate(lines)
                if any(words[i].start < accent_span[1] and words[i].end > accent_span[0] for i in range(a, b))
            }
            if len(touched) > 1:
                score += 4
        ranked.append((score, widest, lines))
    ranked.sort(key=lambda item: item[0])
    return ranked


def accent_range(headline: str, accent: str):
    if not accent:
        return None
    index = headline.find(accent)
    if index < 0:
        index = headline.lower().find(accent.lower())
    if index < 0:
        return None
    return index, index + len(accent)


def strike_range(headline: str, strike: str, accent_span):
    """The struck word must be one whole word of the copy, apart from the accent."""
    span = accent_range(headline, strike.strip())
    if span is None or " " in strike.strip():
        return None
    if accent_span and span[0] < accent_span[1] and span[1] > accent_span[0]:
        return None
    before = headline[span[0] - 1] if span[0] else " "
    after = headline[span[1]] if span[1] < len(headline) else " "
    return span if before in " ~" and after in " ~,.?!:;" else None


def span_style(start: int, end: int, spans: dict):
    for style, span in spans.items():
        if span is not None and start < span[1] and end > span[0]:
            return style
    return None


def word_tex(word: Word, accent_span, safe: bool, strike_span=None) -> str:
    """Escape prose, keep validated $math$, colour the accent characters and
    strike through the wrong intuition."""
    spans = {"hl": accent_span, "strike": strike_span}
    parts = re.split(r"(\$[^$]*\$)", word.text)
    out, offset = [], word.start
    for part in parts:
        if not part:
            continue
        span = (offset, offset + len(part))
        offset += len(part)
        if part.startswith("$") and part.endswith("$") and len(part) > 1:
            latex = clean_latex(part[1:-1])
            if not latex or safe:
                rendered = tex_escape(smart_punctuation(re.sub(r"\\[A-Za-z]+|[{}_^$]", "", part)))
            else:
                rendered = f"${math_spacing(latex)}$"
            style = span_style(*span, spans)
            out.append(rf"\{style}{{{rendered}}}" if style else rendered)
            continue
        text = smart_punctuation(part.replace("~", " "))
        if accent_span is None and strike_span is None:
            out.append(tex_escape(text))
            continue
        current, flag = "", None
        for position, char in enumerate(text):
            absolute = span[0] + position
            inside = span_style(absolute, absolute + 1, spans)
            if current and inside != flag:
                out.append(rf"\{flag}{{{tex_escape(current)}}}" if flag else tex_escape(current))
                current = ""
            current += char
            flag = inside
        if current:
            out.append(rf"\{flag}{{{tex_escape(current)}}}" if flag else tex_escape(current))
    return "".join(out)


# ---------------------------------------------------------------------------
# Geometry helpers: sampling, collisions, label placement
# ---------------------------------------------------------------------------

def bezier_samples(mob, steps=(0.0, 0.25, 0.5, 0.75, 1.0)) -> np.ndarray:
    from manim import VMobject

    chunks = []
    for member in mob.family_members_with_points():
        if not isinstance(member, VMobject):
            continue
        if member.get_stroke_opacity() == 0 and member.get_fill_opacity() == 0:
            continue
        points = member.points
        usable = len(points) // 4 * 4
        if not usable:
            continue
        curves = points[:usable].reshape(-1, 4, 3)
        for t in steps:
            mt = 1 - t
            chunks.append(
                mt ** 3 * curves[:, 0] + 3 * mt ** 2 * t * curves[:, 1]
                + 3 * mt * t ** 2 * curves[:, 2] + t ** 3 * curves[:, 3]
            )
    return np.vstack(chunks)[:, :2] if chunks else np.zeros((0, 2))


def filled_polygons(mob, min_opacity=0.08) -> list[np.ndarray]:
    from manim import VMobject

    polygons = []
    for member in mob.family_members_with_points():
        if isinstance(member, VMobject) and member.get_fill_opacity() >= min_opacity:
            points = bezier_samples_single(member)
            if len(points) >= 3:
                polygons.append(points)
    return polygons


def bezier_samples_single(member) -> np.ndarray:
    points = member.points
    usable = len(points) // 4 * 4
    if not usable:
        return np.zeros((0, 2))
    curves = points[:usable].reshape(-1, 4, 3)
    samples = []
    for t in np.linspace(0, 1, 6):
        mt = 1 - t
        samples.append(mt ** 3 * curves[:, 0] + 3 * mt ** 2 * t * curves[:, 1] + 3 * mt * t ** 2 * curves[:, 2] + t ** 3 * curves[:, 3])
    return np.stack(samples, axis=1).reshape(-1, 3)[:, :2]


def point_in_polygon(point, polygon) -> bool:
    x, y = point
    inside = False
    xs, ys = polygon[:, 0], polygon[:, 1]
    j = len(polygon) - 1
    for i in range(len(polygon)):
        if (ys[i] > y) != (ys[j] > y):
            cross = (xs[j] - xs[i]) * (y - ys[i]) / (ys[j] - ys[i] + 1e-12) + xs[i]
            if x < cross:
                inside = not inside
        j = i
    return inside


def bbox(mob, pad=0.0):
    low = mob.get_corner(np.array([-1, -1, 0]))[:2] - pad
    high = mob.get_corner(np.array([1, 1, 0]))[:2] + pad
    return np.array([low[0], low[1], high[0], high[1]])


def boxes_overlap(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def box_union(boxes):
    boxes = np.array(boxes)
    return np.array([boxes[:, 0].min(), boxes[:, 1].min(), boxes[:, 2].max(), boxes[:, 3].max()])


@dataclass
class Label:
    mob: object
    anchor: np.ndarray
    directions: list
    buff: float = u(14)
    inside: object = None  # a filled mobject the label should sit inside
    optional: bool = False


def place_labels(graphics, labels: list[Label], region, strict=True) -> list:
    """Place each label at the first candidate that touches nothing."""
    from manim import DL, DOWN, DR, LEFT, RIGHT, UL, UP, UR

    strokes = bezier_samples(graphics)
    polygons = filled_polygons(graphics)
    placed_boxes, placed = [], []
    pad = u(8)
    for label in labels:
        candidates = []
        if label.inside is not None:
            candidates.append(label.inside.get_center())
        for direction in label.directions + [UR, RIGHT, DR, DOWN, DL, LEFT, UL, UP]:
            offset = (
                direction * (np.array([label.mob.width, label.mob.height, 0]) / 2)
                + direction / max(np.linalg.norm(direction), 1e-9) * label.buff
            )
            candidates.append(label.anchor + offset)
        best, best_hits = None, None
        for center in candidates:
            label.mob.move_to(center)
            box = bbox(label.mob, pad)
            inner = (strokes[:, 0] > box[0]) & (strokes[:, 0] < box[2]) & (strokes[:, 1] > box[1]) & (strokes[:, 1] < box[3])
            hits = int(inner.sum())
            if label.inside is None:
                corners = [(box[0], box[1]), (box[2], box[1]), (box[0], box[3]), (box[2], box[3]), tuple(center[:2])]
                hits += sum(5 for polygon in polygons for corner in corners if point_in_polygon(corner, polygon))
            hits += sum(50 for other in placed_boxes if boxes_overlap(box, other))
            if box[0] < region[0] or box[2] > region[2] or box[1] < region[1] or box[3] > region[3]:
                hits += 25
            if hits == 0:
                best, best_hits = center, 0
                break
            if best_hits is None or hits < best_hits:
                best, best_hits = center, hits
        if best_hits:
            if label.optional:
                continue
            if strict:
                raise LayoutError(f"label cannot be placed without overlap ({best_hits} collisions)")
        label.mob.move_to(best)
        placed_boxes.append(bbox(label.mob, pad))
        placed.append(label.mob)
    return placed


CALLOUT_EM_LIMIT = 7.5


def callout_copy(value, ts, safe):
    """A few words or one $math$ token beside the hero, e.g. "Why $0$?"."""
    if not isinstance(value, str):
        return None
    value = re.sub(r"\s+", " ", value).strip()
    if not value or len(value) > 28 or value.count("$") % 2 or len(value.split(" ")) > 3:
        return None
    if re.search(r"[\\{}#_^]", "".join(value.split("$")[::2])):
        return None
    if estimate_em(value) > CALLOUT_EM_LIMIT:
        return None
    words = split_words(value)
    line = " ".join(word_tex(word, None, safe) for word in words)
    return ts.block([line], CALLOUT_SIZE, "SemiBold", tracking=-1.0)


def place_callout(callout, focus, graphics, labels, room, warm):
    """Put the callout in clean space near the focal detail and return a warm
    arrow from it to the detail, or None when there is no clean room."""
    from manim import CurvedArrow

    strokes = bezier_samples(graphics)
    polygons = filled_polygons(graphics)
    label_boxes = [bbox(label, u(10)) for label in labels]
    badge = np.array([x_at(BADGE_ZONE[0]), y_at(BADGE_ZONE[3]), x_at(BADGE_ZONE[2]), y_at(BADGE_ZONE[1])])
    hero_center = graphics.get_center()
    outward = focus - hero_center
    outward_angle = math.atan2(outward[1], outward[0]) if np.linalg.norm(outward[:2]) > 0.2 else math.pi / 2
    half = np.array([callout.width / 2, callout.height / 2])
    candidates = []
    for step in range(16):
        angle = step * math.pi / 8
        turn = abs((angle - outward_angle + math.pi) % (2 * math.pi) - math.pi)
        for gap in (1.1, 1.6, 2.2, 2.9):
            candidates.append((turn + 0.35 * gap, angle, gap))
    candidates.sort()
    for _, angle, gap in candidates:
        direction = np.array([math.cos(angle), math.sin(angle)])
        reach = abs(direction[0]) * half[0] + abs(direction[1]) * half[1]
        center = focus[:2] + direction * (gap + reach)
        box = np.array([center[0] - half[0], center[1] - half[1], center[0] + half[0], center[1] + half[1]])
        padded = box + np.array([-1, -1, 1, 1]) * u(14)
        if padded[0] < room[0] or padded[1] < room[1] or padded[2] > room[2] or padded[3] > room[3]:
            continue
        if boxes_overlap(padded, badge) or any(boxes_overlap(padded, other) for other in label_boxes):
            continue
        inside = (strokes[:, 0] > padded[0]) & (strokes[:, 0] < padded[2]) & (strokes[:, 1] > padded[1]) & (strokes[:, 1] < padded[3])
        if inside.any():
            continue
        corners = [(padded[0], padded[1]), (padded[2], padded[1]), (padded[0], padded[3]), (padded[2], padded[3]), tuple(center)]
        if any(point_in_polygon(corner, polygon) for polygon in polygons for corner in corners):
            continue
        # The arrow leaves the box edge facing the detail and stops short of it.
        towards = focus[:2] - center
        distance = np.linalg.norm(towards)
        unit = towards / max(distance, 1e-9)
        exit_t = min(half[0] / max(abs(unit[0]), 1e-9), half[1] / max(abs(unit[1]), 1e-9))
        start = center + unit * (exit_t + u(14))
        end = focus[:2] - unit * u(26)
        if np.linalg.norm(end - start) < u(60):
            continue
        start3, end3 = np.append(start, 0.0), np.append(end, 0.0)
        # Bow the arrow away from the hero so it reads as an annotation.
        arrows = [
            CurvedArrow(start3, end3, angle=bend, color=warm, stroke_width=6, tip_length=u(24))
            for bend in (0.55, -0.55)
        ]
        arrow = max(arrows, key=lambda a: np.linalg.norm(a.point_from_proportion(0.5) - hero_center))
        if np.linalg.norm(arrow.point_from_proportion(0.5) - hero_center) < np.linalg.norm(((start3 + end3) / 2) - hero_center):
            arrow = arrows[0]
        arrow_box = bbox(arrow)
        if arrow_box[0] < room[0] or arrow_box[2] > room[2] or arrow_box[3] > room[3] or arrow_box[1] < room[1] or any(boxes_overlap(arrow_box, other) for other in label_boxes):
            continue
        callout.move_to(np.append(center, 0.0))
        return arrow
    return None


# ---------------------------------------------------------------------------
# Hero visuals
# ---------------------------------------------------------------------------

@dataclass
class Hero:
    graphics: object
    labels: list = field(default_factory=list)
    # The warm focal detail, in the same coordinates as ``graphics``. A
    # callout's arrow points here; None means the hero takes no callout.
    focus: object = None


def hex_mix(a: str, b: str, t: float) -> str:
    ca = np.array([int(a[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    cb = np.array([int(b[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    c = np.clip(ca + (cb - ca) * float(np.clip(t, 0, 1)), 0, 255).round().astype(int)
    return "#" + "".join(f"{v:02X}" for v in c)


def stroke(mob, color, width, opacity=1.0):
    return mob.set_stroke(color=color, width=width, opacity=opacity)


def smooth_path(points):
    from manim import VMobject

    path = VMobject()
    path.set_points_smoothly([np.array([p[0], p[1], 0.0]) for p in points])
    return path


def corner_path(points):
    from manim import VMobject

    path = VMobject()
    path.set_points_as_corners([np.array([p[0], p[1], 0.0]) for p in points])
    return path


def axis_lines(x_range, y_range, to_screen):
    from manim import Line, VGroup

    group = VGroup()
    (x0, x1), (y0, y1) = x_range, y_range
    baseline = 0.0 if y0 <= 0 <= y1 else y0
    group.add(stroke(Line(to_screen(x0, baseline), to_screen(x1, baseline)), INK, 2, 0.28))
    if x0 <= 0 <= x1:
        group.add(stroke(Line(to_screen(0, y0), to_screen(0, y1)), INK, 2, 0.28))
    return group


def hero_function_plot(spec, cool, warm, ts, safe):
    from manim import Dot, Line, Polygon, VGroup, DL, DR, LEFT, RIGHT, UL, UP, UR

    expression = "" if safe else clean_expression(spec.get("expression"))
    if not expression:
        expression = "x**3/6-x"
    f = make_function(expression)
    x_range = spec.get("xRange") if isinstance(spec.get("xRange"), list) else [-4, 4]
    x0 = number(x_range[0] if len(x_range) == 2 else None, -4, -20, 20)
    x1 = number(x_range[1] if len(x_range) == 2 else None, 4, -20, 20)
    if x1 - x0 < 0.5:
        x0, x1 = -4.0, 4.0
    xs = np.linspace(x0, x1, 721)
    ys = np.asarray([f(x) for x in xs], dtype=float)
    finite = np.isfinite(ys)
    if finite.sum() < 20:
        raise LayoutError("function has too few finite samples")
    low, high = np.percentile(ys[finite], [2, 98])
    if high - low < 1e-6:
        low, high = low - 1, high + 1
    pad = (high - low) * 0.1
    y0, y1 = low - pad, high + pad
    width, height = 6.0, 4.6

    def to_screen(x, y):
        return np.array([(x - x0) / (x1 - x0) * width - width / 2, (y - y0) / (y1 - y0) * height - height / 2, 0.0])

    runs, current = [], []
    for x, y in zip(xs, ys):
        if not np.isfinite(y) or y < y0 or y > y1:
            if len(current) > 2:
                runs.append(current)
            current = []
            continue
        if current and abs(y - current[-1][1]) > (y1 - y0) * 0.35:
            runs.append(current)
            current = []
        current.append((x, y))
    if len(current) > 2:
        runs.append(current)
    curve = VGroup(*[stroke(smooth_path([to_screen(x, y) for x, y in run]), cool, 7) for run in runs])
    graphics = VGroup(axis_lines((x0, x1), (y0, y1), to_screen))

    kind = spec.get("highlight") if spec.get("highlight") in ("tangent", "area", "point", "none") else "tangent"
    if safe:
        kind = "tangent"
    if kind == "area":
        a = number(spec.get("from"), x0 + (x1 - x0) * 0.35, x0, x1)
        b = number(spec.get("to"), x0 + (x1 - x0) * 0.7, a, x1)
        base = 0.0 if y0 <= 0 <= y1 else y0
        region_x = np.linspace(a, b, 120)
        region_y = np.clip([f(x) for x in region_x], y0, y1)
        if np.all(np.isfinite(region_y)):
            outline = [to_screen(a, base)] + [to_screen(x, y) for x, y in zip(region_x, region_y)] + [to_screen(b, base)]
            graphics.add(Polygon(*outline, stroke_width=0, fill_color=cool, fill_opacity=0.2))
            for edge in (a, b):
                graphics.add(stroke(Line(to_screen(edge, base), to_screen(edge, float(np.clip(f(edge), y0, y1)))), warm, 3, 0.9))
    graphics.add(curve)
    focus = None
    if kind == "area" and len(graphics) > 2:
        focus = graphics[1].get_center()
    if kind in ("tangent", "point"):
        candidates = [number(spec.get("at"), None, x0, x1)] if number(spec.get("at"), None, x0, x1) is not None else []
        candidates += list(np.linspace(x0 + (x1 - x0) * 0.62, x0 + (x1 - x0) * 0.25, 9))
        for at in candidates:
            y = f(at)
            if np.isfinite(y) and y0 + (y1 - y0) * 0.12 < y < y1 - (y1 - y0) * 0.12:
                break
        else:
            at, y = None, None
        if at is not None:
            point = to_screen(at, y)
            if kind == "tangent":
                h = (x1 - x0) * 1e-4
                slope = (f(at + h) - f(at - h)) / (2 * h)
                direction = np.array([width / (x1 - x0), slope * height / (y1 - y0), 0.0])
                direction /= np.linalg.norm(direction)
                graphics.add(stroke(Line(point - direction * 1.35, point + direction * 1.35), warm, 5))
            base = 0.0 if y0 <= 0 <= y1 else y0
            graphics.add(stroke(Line(to_screen(at, base), point), warm, 2.5, 0.5))
            graphics.add(Dot(point, radius=0.09, color=warm))
            focus = point
    hero = Hero(graphics, focus=focus)
    notation = "" if safe else clean_latex(spec.get("notation"))
    if notation:
        end = runs[-1][-1]
        hero.labels.append(Label(ts.math(notation, LABEL_SIZE, "ink"), to_screen(*end), [UL, LEFT, DR, UP], optional=False))
    return hero


def hero_complex_plane(spec, cool, warm, ts, safe):
    from manim import Arc, Arrow, Circle, Dot, Line, VGroup, DOWN, DR, LEFT, RIGHT, UL, UP, UR, TAU

    turn = 0.25 if safe else number(spec.get("turn"), 0.25, 0.05, 0.95)
    radius = 2.4
    graphics = VGroup(
        stroke(Line([-3.1, 0, 0], [3.1, 0, 0]), INK, 2, 0.28),
        stroke(Line([0, -3.1, 0], [0, 3.1, 0]), INK, 2, 0.28),
        stroke(Circle(radius=radius), cool, 3, 0.55),
        stroke(Arc(radius=radius, start_angle=0, angle=turn * TAU), warm, 7),
    )
    end = radius * np.array([math.cos(turn * TAU), math.sin(turn * TAU), 0.0])
    tip = dict(buff=0, max_tip_length_to_length_ratio=0.1, max_stroke_width_to_length_ratio=10)
    graphics.add(Arrow([0, 0, 0], [radius, 0, 0], stroke_width=5, color=INK, **tip).set_opacity(0.7))
    graphics.add(Arrow([0, 0, 0], end, stroke_width=6, color=warm, **tip))
    graphics.add(Dot([0, 0, 0], radius=0.06, color=INK))
    names = {0.25: "i", 0.5: "-1", 0.75: "-i"}
    end_name = next((name for key, name in names.items() if abs(turn - key) < 1e-6), r"e^{i\theta}")
    mid = turn * TAU / 2
    hero = Hero(graphics, focus=radius * np.array([math.cos(mid), math.sin(mid), 0.0]))
    hero.labels.append(Label(ts.math("1", LABEL_SIZE), np.array([radius, 0, 0]), [DR, DOWN, UR]))
    hero.labels.append(Label(ts.math(end_name, LABEL_SIZE, "accent"), end, [UL, UR, LEFT, UP]))
    notation = "" if safe else clean_latex(spec.get("notation"))
    if notation:
        hero.labels.append(Label(ts.math(notation, CAPTION_SIZE), np.array([-radius * 0.72, -radius * 0.72, 0]), [DOWN + LEFT, DOWN], optional=True))
    return hero


def hero_wave(spec, cool, warm, ts, safe):
    from manim import Circle, Dot, DashedLine, Line, VGroup

    shape = "sawtooth" if (not safe and spec.get("shape") == "sawtooth") else "square"
    harmonics = int(number(spec.get("harmonics"), 4, 2, 6)) if not safe else 4
    if shape == "square":
        terms = [(2 * k + 1, 1.45 * 4 / (math.pi * (2 * k + 1))) for k in range(harmonics)]
    else:
        terms = [(n, 1.45 * 2 / (math.pi * n) * (-1) ** (n + 1)) for n in range(1, harmonics + 1)]
    t0 = 0.75
    origin = np.array([-2.0, 0.0, 0.0])
    graphics = VGroup()
    center = origin.copy()
    for index, (n, r) in enumerate(terms):
        graphics.add(stroke(Circle(radius=abs(r)).move_to(center), cool, max(1.6, 3.2 - 0.5 * index), 0.75 - 0.08 * index))
        nxt = center + r * np.array([math.cos(n * t0), math.sin(n * t0), 0.0])
        graphics.add(stroke(Line(center, nxt), INK, 2.5, 0.85))
        center = nxt
    start_x = origin[0] + 2.35

    def wave_y(s):
        return sum(r * math.sin(n * (t0 - s)) for n, r in terms)

    samples = [(start_x + 0.72 * s, wave_y(s)) for s in np.linspace(0, 2 * math.pi, 400)]
    graphics.add(DashedLine(center, [start_x, center[1], 0], dash_length=0.08).set_stroke(warm, 2, 0.7))
    graphics.add(stroke(smooth_path(samples), warm, 6))
    graphics.add(Dot(center, radius=0.07, color=warm))
    return Hero(graphics, focus=center)


def hero_probability(spec, cool, warm, ts, safe):
    from manim import Line, Polygon, VGroup, DOWN

    a = -1.0 if safe else number(spec.get("from"), -1.0, -3.5, 3.5)
    b = 1.0 if safe else number(spec.get("to"), 1.0, a + 0.1, 3.5)
    width, height = 6.4, 3.6

    def to_screen(x, y):
        return np.array([x / 3.5 * width / 2, y * height - height / 2, 0.0])

    xs = np.linspace(-3.5, 3.5, 300)
    curve = stroke(smooth_path([to_screen(x, math.exp(-x * x / 2)) for x in xs]), cool, 6)
    region = np.linspace(a, b, 120)
    area = Polygon(to_screen(a, 0), *[to_screen(x, math.exp(-x * x / 2)) for x in region], to_screen(b, 0), stroke_width=0, fill_color=cool, fill_opacity=0.22)
    graphics = VGroup(stroke(Line(to_screen(-3.5, 0), to_screen(3.5, 0)), INK, 2, 0.28), area)
    for edge in (a, b):
        graphics.add(stroke(Line(to_screen(edge, 0), to_screen(edge, math.exp(-edge * edge / 2))), warm, 3, 0.9))
    graphics.add(curve)
    middle = (a + b) / 2
    hero = Hero(graphics, focus=to_screen(middle, math.exp(-middle * middle / 2) * 0.45))
    notation = "" if safe else clean_latex(spec.get("notation"))
    if notation:
        hero.labels.append(Label(ts.math(notation, 44), to_screen(0, 0), [DOWN], buff=u(28)))
    return hero


def hero_geometry(spec, cool, warm, ts, safe):
    from manim import Arc, Circle, Line, Polygon, RegularPolygon, VGroup, DOWN, LEFT, RIGHT, UP, PI

    shape = spec.get("shape") if spec.get("shape") == "venn" or (not safe and spec.get("shape") in ("pythagoras", "inscribed_polygon", "triangle_angles")) else "pythagoras"
    hero = Hero(VGroup())
    if shape == "venn":
        from manim import Intersection

        left = Circle(radius=2.1).shift(LEFT * 1.05).set_stroke(cool, 3).set_fill(cool, 0.16)
        second = PALETTES["violet-amber" if cool != PALETTES["violet-amber"][0] else "teal-amber"][0]
        right = Circle(radius=2.1).shift(RIGHT * 1.05).set_stroke(second, 3, 0.8).set_fill(second, 0.16)
        overlap = Intersection(left, right).set_stroke(warm, 3).set_fill(warm, 0.55)
        hero.graphics = VGroup(left, right, overlap)
        hero.focus = overlap.get_center()
    elif shape == "pythagoras":
        a, b = 3.0, 2.0
        A, B, C = np.array([0, 0, 0.0]), np.array([a, 0, 0.0]), np.array([0, b, 0.0])
        triangle = Polygon(A, B, C).set_stroke(INK, 3, 0.9).set_fill(BG, 1)
        sq_a = Polygon(A, B, B + [0, -a, 0], A + [0, -a, 0]).set_stroke(cool, 3).set_fill(cool, 0.16)
        sq_b = Polygon(A, C, C + [-b, 0, 0], A + [-b, 0, 0]).set_stroke(cool, 3).set_fill(cool, 0.16)
        edge = C - B
        normal = np.array([edge[1], -edge[0], 0.0])
        normal = -normal if np.dot(normal, A - B) > 0 else normal
        sq_c = Polygon(B, C, C - normal, B - normal)
        if np.dot((C - normal) - B, A - B) > 0:
            sq_c = Polygon(B, C, C + normal, B + normal)
        sq_c.set_stroke(warm, 3).set_fill(warm, 0.16)
        corner = VGroup(Line([0.28, 0, 0], [0.28, 0.28, 0]), Line([0.28, 0.28, 0], [0, 0.28, 0])).set_stroke(INK, 2, 0.7)
        hero.graphics = VGroup(sq_a, sq_b, sq_c, triangle, corner)
        hero.focus = sq_c.get_center()
        hero.labels += [
            Label(ts.math("a^2", LABEL_SIZE, "cool"), sq_a.get_center(), [], inside=sq_a),
            Label(ts.math("b^2", LABEL_SIZE, "cool"), sq_b.get_center(), [], inside=sq_b),
            Label(ts.math("c^2", LABEL_SIZE, "accent"), sq_c.get_center(), [], inside=sq_c),
        ]
    elif shape == "inscribed_polygon":
        sides = int(number(spec.get("sides"), 12, 5, 32))
        circle = stroke(Circle(radius=2.6), cool, 6)
        polygon = RegularPolygon(n=sides).scale(2.6).set_stroke(warm, 3.5).set_fill(warm, 0.1)
        radius = stroke(Line([0, 0, 0], polygon.get_vertices()[0]), INK, 2.5, 0.7)
        hero.graphics = VGroup(polygon, circle, radius)
        vertices = polygon.get_vertices()
        hero.focus = (vertices[0] + vertices[1]) / 2
    else:
        A, B, C = np.array([-2.8, -1.6, 0.0]), np.array([2.8, -1.6, 0.0]), np.array([0.7, 2.0, 0.0])
        triangle = Polygon(A, B, C).set_stroke(INK, 4, 0.9)
        arcs = VGroup()
        for vertex, other_a, other_b, color in ((A, B, C, cool), (B, C, A, warm), (C, A, B, INK)):
            start = math.atan2(*(other_a - vertex)[1::-1])
            end = math.atan2(*(other_b - vertex)[1::-1])
            sweep = (end - start + 2 * PI) % (2 * PI)
            if sweep > PI:
                start, sweep = end, 2 * PI - sweep
            arcs.add(Arc(radius=0.62, start_angle=start, angle=sweep, arc_center=vertex).set_stroke(color, 6))
        hero.graphics = VGroup(triangle, arcs)
        hero.focus = B + 0.3 * (C - B) / np.linalg.norm(C - B) + 0.3 * (A - B) / np.linalg.norm(A - B)
    notation = "" if safe else clean_latex(spec.get("notation"))
    if notation:
        hero.labels.append(Label(ts.math(notation, CAPTION_SIZE), hero.graphics.get_bottom(), [DOWN], buff=u(28), optional=True))
    return hero


def hero_transformation(spec, cool, warm, ts, safe):
    from manim import Arrow, Line, VGroup, DOWN, DR, RIGHT, UL, UP, UR

    matrix = spec.get("matrix")
    m = np.array([[1.0, 1.0], [0.0, 1.0]])
    if not safe and isinstance(matrix, list) and len(matrix) == 2 and all(isinstance(r, list) and len(r) == 2 for r in matrix):
        values = [number(v, None, -3, 3) for r in matrix for v in r]
        if all(v is not None for v in values):
            candidate = np.array(values).reshape(2, 2)
            if abs(np.linalg.det(candidate)) > 0.15:
                m = candidate
    span = 2

    def warp(p):
        q = m @ np.array(p[:2])
        return np.array([q[0], q[1], 0.0])

    ghost, warped = VGroup(), VGroup()
    for k in range(-span, span + 1):
        ghost.add(Line([k, -span, 0], [k, span, 0]), Line([-span, k, 0], [span, k, 0]))
        warped.add(Line(warp([k, -span]), warp([k, span])), Line(warp([-span, k]), warp([span, k])))
    ghost.set_stroke(INK, 1.5, 0.14)
    warped.set_stroke(cool, 2.5, 0.75)
    tip = dict(buff=0, max_tip_length_to_length_ratio=0.18, max_stroke_width_to_length_ratio=12)
    i_hat = Arrow([0, 0, 0], warp([1, 0]), stroke_width=7, color=warm, **tip)
    j_hat = Arrow([0, 0, 0], warp([0, 1]), stroke_width=7, color=INK, **tip)
    hero = Hero(VGroup(ghost, warped, i_hat, j_hat), focus=warp([0.6, 0]))
    hero.labels.append(Label(ts.math(r"\hat{\imath}", LABEL_SIZE, "accent"), warp([1, 0]), [DR, RIGHT, DOWN, UR]))
    hero.labels.append(Label(ts.math(r"\hat{\jmath}", LABEL_SIZE), warp([0, 1]), [UL, UP, UR]))
    return hero


def hero_vector_field(spec, cool, warm, ts, safe):
    from manim import Arrow, VGroup

    kind = spec.get("field") if (not safe and spec.get("field") in ("rotation", "source", "saddle", "spiral")) else "rotation"

    def field(p):
        x, y = p
        return {
            "rotation": np.array([-y, x]),
            "source": np.array([x, y]),
            "saddle": np.array([x, -y]),
            "spiral": np.array([-y + 0.35 * x, x + 0.35 * y]),
        }[kind]

    position = {"rotation": np.array([1.7, 0.0]), "source": np.array([0.2, 0.12]), "saddle": np.array([0.08, 2.2]), "spiral": np.array([0.32, 0.0])}[kind]
    trail = []
    for _ in range(900 if kind == "rotation" else 1400):
        trail.append(position.copy())
        k1 = field(position)
        k2 = field(position + 0.006 * k1)
        position = position + 0.006 * (k1 + k2) / 2
        if abs(position[0]) > 3.2 or abs(position[1]) > 2.4:
            break
        if kind == "rotation" and len(trail) > 60 and np.linalg.norm(position - trail[0]) < 0.02:
            break
    trail_points = np.array(trail)

    arrows = VGroup()
    magnitudes = []
    grid = [(x, y) for x in np.linspace(-3, 3, 9) for y in np.linspace(-2.2, 2.2, 7)]
    grid = [p for p in grid if np.min(np.linalg.norm(trail_points - np.array(p), axis=1)) > 0.36]
    for point in grid:
        magnitudes.append(np.linalg.norm(field(point)))
    peak = max(magnitudes) or 1
    for point, magnitude in zip(grid, magnitudes):
        if magnitude < 1e-6:
            continue
        direction = field(point) / magnitude
        length = 0.22 + 0.34 * magnitude / peak
        start = np.array([point[0], point[1], 0.0]) - np.append(direction, 0) * length / 2
        end = start + np.append(direction, 0) * length
        color = hex_mix(hex_mix(cool, BG, 0.45), cool, magnitude / peak)
        arrows.add(Arrow(start, end, buff=0, stroke_width=3, color=color, max_tip_length_to_length_ratio=0.32, max_stroke_width_to_length_ratio=8))
    graphics = VGroup(arrows)
    if len(trail) > 10:
        graphics.add(stroke(smooth_path(trail[::3]), warm, 6))
        return Hero(graphics, focus=np.append(trail[len(trail) // 3], 0.0))
    return Hero(graphics)


def hero_orbit(spec, cool, warm, ts, safe):
    from manim import Dot, Polygon, VGroup

    e = 0.6 if safe else number(spec.get("eccentricity"), 0.6, 0.1, 0.85)
    a = 3.0
    b = a * math.sqrt(1 - e * e)
    c = a * e

    def at(theta):
        return np.array([a * math.cos(theta), b * math.sin(theta), 0.0])

    orbit = stroke(corner_path([at(t) for t in np.linspace(0, 2 * math.pi, 240)]), cool, 3.5, 0.8)
    focus = np.array([c, 0.0, 0.0])
    graphics = VGroup()
    for t0, t1 in ((-0.55, 0.55), (math.pi - 0.18, math.pi + 0.18)):
        graphics.add(Polygon(focus, *[at(t) for t in np.linspace(t0, t1, 40)], stroke_width=0, fill_color=cool, fill_opacity=0.18))
    graphics.add(orbit)
    graphics.add(Dot(focus, radius=0.2, color=warm))
    graphics.add(Dot(at(0.55), radius=0.11, color=INK))
    return Hero(graphics, focus=focus)


def hero_network(spec, cool, warm, ts, safe):
    from manim import Circle, Line, VGroup

    layers = spec.get("layers")
    if safe or not (isinstance(layers, list) and 2 <= len(layers) <= 5 and all(isinstance(n, int) and 1 <= n <= 7 for n in layers)):
        layers = [3, 5, 5, 2]
    xs = np.linspace(-2.8, 2.8, len(layers))
    positions = [[np.array([x, y, 0.0]) for y in np.linspace(-(n - 1) * 0.55, (n - 1) * 0.55, n)] for x, n in zip(xs, layers)]
    path = [min(len(layer) - 1, (len(layer) - 1) // 2 + (index % 2)) for index, layer in enumerate(positions)]
    edges, highlight = VGroup(), VGroup()
    for index in range(len(positions) - 1):
        for i, p in enumerate(positions[index]):
            for j, q in enumerate(positions[index + 1]):
                weight = 0.5 + 0.5 * math.sin(3.1 * i + 1.7 * j + index)
                line = Line(p, q)
                if path[index] == i and path[index + 1] == j:
                    highlight.add(stroke(line, warm, 5))
                else:
                    edges.add(stroke(line, cool, 1.6, 0.12 + 0.3 * weight))
    nodes = VGroup()
    for index, layer in enumerate(positions):
        for i, p in enumerate(layer):
            on_path = path[index] == i
            nodes.add(Circle(radius=0.2).move_to(p).set_stroke(warm if on_path else INK, 3, 1 if on_path else 0.7).set_fill(warm if on_path else BG, 1))
    middle = len(positions) // 2
    return Hero(VGroup(edges, highlight, nodes), focus=positions[middle][path[middle]])


def hero_atom(spec, cool, warm, ts, safe):
    from manim import Circle, Dot, Ellipse, VGroup

    shells = VGroup(*[stroke(Ellipse(width=6.0, height=2.0).rotate(angle), INK, 2.5, 0.35) for angle in (0, math.pi / 3, 2 * math.pi / 3)])
    offsets = [(-0.17, 0.13), (0.17, 0.13), (0.0, -0.16), (-0.27, -0.1), (0.27, -0.1), (0.0, 0.27), (0.0, 0.02)]
    nucleus = VGroup(*[Circle(radius=0.21).move_to([x, y, 0]).set_stroke(BG, 2).set_fill(cool if k % 2 else hex_mix(cool, BG, 0.35), 1) for k, (x, y) in enumerate(offsets)])
    electrons = VGroup()
    for k, shell in enumerate(shells):
        point = shell.point_from_proportion((0.12 + 0.31 * k) % 1)
        electrons.add(Dot(point, radius=0.12, color=warm if k == 0 else cool))
    return Hero(VGroup(shells, nucleus, electrons), focus=electrons[0].get_center())


def hero_energy_levels(spec, cool, warm, ts, safe):
    """A drop between two states emits light; no miniature prose legend."""
    from manim import Arrow, Dot, Line, VGroup, LEFT

    top, bottom = 1.7, -1.7
    levels = VGroup(*[
        stroke(Line([-2.4, y, 0], [1.5, y, 0]), cool, 6)
        for y in (top, bottom)
    ])
    transition = Arrow([0, top - 0.18, 0], [0, bottom + 0.18, 0],
                       buff=0, color=warm, stroke_width=7,
                       max_tip_length_to_length_ratio=0.14)
    photon = stroke(smooth_path([
        (0.45 + t, 0.23 * math.sin(3 * math.pi * t))
        for t in np.linspace(0, 2.3, 160)
    ]), warm, 5)
    hero = Hero(VGroup(levels, transition, photon, Dot([0, top, 0], radius=0.12, color=warm)), focus=np.array([1.6, 0.0, 0.0]))
    hero.labels = [
        Label(ts.math(name, 48, "cool"), np.array([-2.4, y, 0]), [LEFT], buff=u(20))
        for name, y in ((r"E_{\mathrm{high}}", top), (r"E_{\mathrm{low}}", bottom))
    ]
    return hero


def hero_spiral(spec, cool, warm, ts, safe):
    """Fibonacci squares under the golden spiral, or primes in polar form."""
    from manim import Arc, Dot, Polygon, VGroup

    kind = "primes" if (not safe and spec.get("shape") == "primes") else "golden"
    if kind == "primes":
        # Each prime p at radius p, angle p radians: residues mod 44 and 710
        # line up into the arms 3Blue1Brown made famous.
        limit = 12000
        sieve = np.ones(limit + 1, dtype=bool)
        sieve[:2] = False
        for k in range(2, int(limit ** 0.5) + 1):
            if sieve[k]:
                sieve[k * k::k] = False
        primes = np.nonzero(sieve)[0]
        dots = VGroup()
        arm = VGroup()
        for prime in primes:
            point = np.array([prime * math.cos(prime), prime * math.sin(prime), 0.0]) / limit * 3.0
            if prime % 44 == 13:
                arm.add(Dot(point, radius=0.05, color=warm))
            else:
                dots.add(Dot(point, radius=0.036, color=cool).set_opacity(0.8))
        focus = arm[len(arm) * 2 // 3].get_center()
        return Hero(VGroup(dots, arm), focus=focus)

    squares, arcs, labels = VGroup(), VGroup(), []
    x0, y0, x1, y1 = 0.0, 0.0, 1.0, 1.0
    placed = [((0.0, 0.0, 1.0, 1.0), "down")]
    for index in range(7):
        side = ("right", "up", "left", "down")[index % 4]
        if side == "right":
            size = y1 - y0
            box = (x1, y0, x1 + size, y1)
        elif side == "up":
            size = x1 - x0
            box = (x0, y1, x1, y1 + size)
        elif side == "left":
            size = y1 - y0
            box = (x0 - size, y0, x0, y1)
        else:
            size = x1 - x0
            box = (x0, y0 - size, x1, y0)
        placed.append((box, side))
        x0, y0, x1, y1 = min(x0, box[0]), min(y0, box[1]), max(x1, box[2]), max(y1, box[3])
    # Arc centre corner and start angle per growth direction (counterclockwise).
    corner = {"down": ((2, 3), math.pi), "right": ((0, 3), -math.pi / 2), "up": ((0, 1), 0.0), "left": ((2, 1), math.pi / 2)}
    for order, (box, side) in enumerate(placed):
        size = box[2] - box[0]
        rect = Polygon([box[0], box[1], 0], [box[2], box[1], 0], [box[2], box[3], 0], [box[0], box[3], 0])
        rect.set_stroke(cool, 3, 0.75).set_fill(cool, 0.05 + 0.025 * (order % 3))
        squares.add(rect)
        (cx, cy), start = corner[side]
        arcs.add(Arc(radius=size, start_angle=start, angle=math.pi / 2, arc_center=[box[cx], box[cy], 0]))
        if size >= 5 and not safe:
            labels.append(Label(ts.math(str(int(size)), 44 if size < 13 else 56, "cool"), rect.get_center(), [], inside=rect))
    spiral = VGroup(*arcs).set_stroke(warm, 7)
    return Hero(VGroup(squares, spiral), labels, focus=np.array([0.5, 0.6, 0.0]))


def integrate(step, state, dt, count):
    """Fixed-step RK4; returns every state, including the first."""
    states = [np.array(state, dtype=float)]
    for _ in range(count):
        y = states[-1]
        k1 = step(y)
        k2 = step(y + dt / 2 * k1)
        k3 = step(y + dt / 2 * k2)
        k4 = step(y + dt * k3)
        states.append(y + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4))
    return np.array(states)


def hero_chaos(spec, cool, warm, ts, safe):
    """Two starts a hair apart: identical for a while, then nothing alike."""
    from manim import Circle, Dot, Line, VGroup

    kind = "pendulum" if (not safe and spec.get("shape") == "pendulum") else "lorenz"
    if kind == "lorenz":
        def lorenz(v):
            x, y, z = v
            return np.array([10 * (y - x), x * (28 - z) - y, x * y - 8 / 3 * z])

        a = integrate(lorenz, [1.0, 1.0, 1.0], 0.005, 7000)
        b = integrate(lorenz, [1.0 + 1e-5, 1.0, 1.0], 0.005, 7000)
        apart = int(np.argmax(np.linalg.norm(a - b, axis=1) > 0.5))
        to_screen = lambda v: np.array([v[0] / 9.0, (v[2] - 25) / 9.0, 0.0])
        cool_path = stroke(corner_path([to_screen(v) for v in a[400::2]]), cool, 2.2, 0.75)
        warm_path = stroke(corner_path([to_screen(v) for v in b[apart:apart + 900:2]]), warm, 5)
        return Hero(VGroup(cool_path, warm_path), focus=to_screen(b[apart]))

    def pendulum(v):
        t1, t2, w1, w2 = v
        d = t1 - t2
        den = 3 - math.cos(2 * d)
        g = 9.81
        a1 = (-3 * g * math.sin(t1) - g * math.sin(t1 - 2 * t2) - 2 * math.sin(d) * (w2 * w2 + w1 * w1 * math.cos(d))) / den
        a2 = 2 * math.sin(d) * (2 * w1 * w1 + 2 * g * math.cos(t1) + w2 * w2 * math.cos(d)) / den
        return np.array([w1, w2, a1, a2])

    # Same release, a hair apart: after a few seconds the two pendulums are
    # nowhere near each other. Show the shared start as a ghost and each
    # pendulum now, with the short trail of its last swing.
    steps = 1500
    a = integrate(pendulum, [2.2, 2.6, 0.0, 0.0], 0.004, steps)
    b = integrate(pendulum, [2.2, 2.6 + 2e-3, 0.0, 0.0], 0.004, steps)

    def arms(v):
        joint = np.array([math.sin(v[0]), -math.cos(v[0]), 0.0]) * 1.5
        return joint, joint + np.array([math.sin(v[1]), -math.cos(v[1]), 0.0]) * 1.5

    def pendulum_mob(v, color, opacity=1.0, width=6):
        joint, end = arms(v)
        rods = VGroup(Line([0, 0, 0], joint), Line(joint, end)).set_stroke(color, width, opacity)
        bobs = VGroup(*[Circle(radius=0.15).move_to(p).set_stroke(color, 3, opacity).set_fill(BG if opacity < 1 else color, 1) for p in (joint, end)])
        return VGroup(rods, bobs)

    tail = 260
    trail_a = stroke(smooth_path([arms(v)[1] for v in a[-tail::2]]), cool, 4, 0.7)
    trail_b = stroke(smooth_path([arms(v)[1] for v in b[-tail::2]]), warm, 4, 0.7)
    ghost = pendulum_mob(a[0], INK, 0.3, 4)
    pivot = Dot([0, 0, 0], radius=0.08, color=INK)
    reach = VGroup(stroke(Circle(radius=3.0), INK, 1.5, 0.12))
    now_a, now_b = pendulum_mob(a[-1], cool), pendulum_mob(b[-1], warm)
    return Hero(VGroup(reach, ghost, trail_a, trail_b, now_a, now_b, pivot), focus=arms(b[-1])[1])


def hero_fractal(spec, cool, warm, ts, safe):
    """Self-similarity with one warm copy to show the pattern repeats."""
    from manim import Line, Polygon, VGroup

    kind = spec.get("shape") if (not safe and spec.get("shape") in ("koch", "tree")) else "sierpinski"
    if kind == "sierpinski":
        triangles = []

        def split(a, b, c, depth):
            if depth == 0:
                triangles.append((a, b, c))
                return
            ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
            split(a, ab, ca, depth - 1)
            split(ab, b, bc, depth - 1)
            split(ca, bc, c, depth - 1)

        top = np.array([0.0, 2.6, 0.0])
        left = np.array([-3.0, -2.6, 0.0])
        right = np.array([3.0, -2.6, 0.0])
        split(left, right, top, 5)
        # The warm copy: the whole pattern again, one level down.
        corner = (left, (left + right) / 2, (left + top) / 2)
        group, highlight = VGroup(), VGroup()
        for tri in triangles:
            centroid = sum(tri) / 3
            inside = all(np.cross(corner[(k + 1) % 3] - corner[k], centroid - corner[k])[2] >= -1e-9 for k in range(3))
            mob = Polygon(*tri).set_stroke(width=0).set_fill(warm if inside else cool, 0.95 if inside else 0.8)
            (highlight if inside else group).add(mob)
        return Hero(VGroup(group, highlight), focus=sum(corner) / 3)

    if kind == "koch":
        def koch(points, depth):
            for _ in range(depth):
                refined = []
                for p, q in zip(points, points[1:]):
                    d = (q - p) / 3
                    peak = p + d * 1.5 + np.array([-d[1], d[0], 0.0]) * math.sqrt(3) / 2
                    refined += [p, p + d, peak, p + 2 * d]
                points = refined + [points[-1]]
            return points

        corners = [np.array([2.6 * math.cos(a), 2.6 * math.sin(a), 0.0]) for a in (math.pi / 2, math.pi / 2 - 2 * math.pi / 3, math.pi / 2 + 2 * math.pi / 3)]
        outline = []
        for k in range(3):
            outline += koch([corners[k], corners[(k + 1) % 3]], 4)[:-1]
        snowflake = Polygon(*outline).set_stroke(cool, 3).set_fill(cool, 0.12)
        # One first-generation spike, traced in warm.
        side = koch([corners[0], corners[1]], 4)
        spike = stroke(corner_path(side[len(side) // 4:len(side) // 2 + 1]), warm, 7)
        return Hero(VGroup(snowflake, spike), focus=spike.point_from_proportion(0.5))

    branches, path = VGroup(), VGroup()

    def grow(start, angle, length, depth, on_path):
        end = start + length * np.array([math.cos(angle), math.sin(angle), 0.0])
        line = Line(start, end)
        if on_path:
            path.add(stroke(line, warm, 1.5 + depth * 0.8))
        else:
            branches.add(stroke(line, cool, 1 + depth * 0.7, 0.45 + 0.05 * depth))
        if depth:
            grow(end, angle + 0.42, length * 0.72, depth - 1, on_path)
            grow(end, angle - 0.42, length * 0.72, depth - 1, False)
        return end

    grow(np.array([0.0, -3.0, 0.0]), math.pi / 2, 1.8, 9, True)
    return Hero(VGroup(branches, path), focus=path[len(path) // 2].get_end())


def hero_bars(spec, cool, warm, ts, safe):
    """A few bars from the source data, one of them the surprise."""
    from manim import Line, Rectangle, VGroup, DOWN

    values = spec.get("values")
    if safe or not (isinstance(values, list) and 2 <= len(values) <= 12 and all(number(v, None, 0, 1e9) is not None for v in values) and max(values) > 0):
        values = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6]
    values = [float(v) for v in values]
    peak = max(values)
    pick_index = spec.get("focus")
    focus_index = int(pick_index) if isinstance(pick_index, int) and not isinstance(pick_index, bool) and 0 <= pick_index < len(values) else int(np.argmax(values))
    width, height = 6.4, 4.4
    slot = width / len(values)
    bars = VGroup()
    for index, value in enumerate(values):
        h = max(value / peak * height, 0.04)
        bar = Rectangle(width=slot * 0.72, height=h).move_to([-width / 2 + slot * (index + 0.5), -height / 2 + h / 2, 0])
        if index == focus_index:
            bar.set_stroke(warm, 3).set_fill(warm, 0.9)
        else:
            bar.set_stroke(cool, 3, 0.9).set_fill(cool, 0.28)
        bars.add(bar)
    baseline = stroke(Line([-width / 2 - 0.1, -height / 2, 0], [width / 2 + 0.1, -height / 2, 0]), INK, 2, 0.35)
    hero = Hero(VGroup(baseline, bars), focus=bars[focus_index].get_top() + np.array([0, -0.15, 0]))
    # One short name under each bar ("stay", "switch"); required, so the fit
    # shrinks the bars to make room rather than dropping them.
    names = spec.get("labels")
    if not safe and isinstance(names, list) and len(names) == len(values) and all(isinstance(n, str) and BAR_LABEL.match(n) for n in names):
        for index, (bar, name) in enumerate(zip(bars, names)):
            color = "accent" if index == focus_index else "ink"
            hero.labels.append(Label(ts.block([tex_escape(name.strip())], LABEL_SIZE + 6, "SemiBold", color=color), bar.get_bottom(), [DOWN], buff=u(18)))
        return hero
    notation = "" if safe else clean_latex(spec.get("notation"))
    if notation:
        hero.labels.append(Label(ts.math(notation, 40), np.array([0, -height / 2, 0]), [DOWN], buff=u(24)))
    return hero


BAR_LABEL = re.compile(r"^[A-Za-z0-9 .%'\-]{1,10}$")


NUMBER_VALUE = re.compile(r"^[0-9.,%+\-/:=?!×≈∞− ]{1,9}$")


def clean_number(value) -> str:
    if not isinstance(value, str):
        return ""
    value = value.strip()
    return value if NUMBER_VALUE.match(value) and re.search(r"[0-9∞?]", value) else ""


def number_tex(value: str) -> str:
    """Text figures, with the symbols CMU Serif lacks set from the math font."""
    symbols = {"\u00d7": r"$\times$", "\u2248": r"$\approx$", "\u221e": r"$\infty$", "\u2212": r"$-$"}
    return "".join(symbols.get(char) or tex_escape(char) for char in value)


def hero_number(spec, cool, warm, ts, safe):
    """One giant number; optionally the intuitive wrong one, struck through."""
    from manim import VGroup, LEFT, UP

    value = clean_number(spec.get("value"))
    if not value:
        raise LayoutError("number value is missing or not allowed")
    was = "" if safe else clean_number(spec.get("was"))
    mob = None
    for size in (320, 280, 240, 200, 170, 140):
        mob = ts.block([r"\hl{" + number_tex(value) + "}"], size, "SemiBold", tracking=-2.0)
        if mob.width <= ts.region_w * 0.92:
            break
    graphics = VGroup(mob)
    if was:
        wrong = ts.block([r"\strike{" + number_tex(was) + "}"], 120, "SemiBold", tracking=-1.5)
        wrong.next_to(mob, UP, buff=u(10), aligned_edge=LEFT)
        graphics.add(wrong)
    return Hero(graphics, focus=None)


def rotation_matrix(phi, theta):
    cz, sz = math.cos(theta), math.sin(theta)
    cx, sx = math.cos(phi), math.sin(phi)
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    return rx @ rz


LIGHT = np.array([-0.35, 0.55, 0.76])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
CAMERA_DISTANCE = 11.0


def shaded_mesh(vertices, faces, colors, phi=-1.1, theta=-0.75, cull=False, edge_opacity=0.28):
    """Perspective projection with painter's ordering and Blinn-Phong shading.

    Each face gets a matte Lambert term only (no specular shine or rim
    light), so solids read as solid without looking glossy. Returns the mesh and the projection
    used, so overlays (a cube's diagonal) land on the same picture.
    """
    from manim import Polygon, VGroup

    rotation = rotation_matrix(phi, theta)

    def project(points):
        view = np.asarray(points, dtype=float) @ rotation.T
        scale = CAMERA_DISTANCE / np.maximum(CAMERA_DISTANCE - view[:, 2], 1e-3)
        return np.column_stack([view[:, 0] * scale, view[:, 1] * scale, view[:, 2]])

    view = vertices @ rotation.T
    screen = project(vertices)
    polygons = []
    for face, color in zip(faces, colors):
        pts = view[face]
        normal = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        norm = np.linalg.norm(normal)
        if norm < 1e-12:
            continue
        normal /= norm
        # Facing is judged on the projected polygon, so perspective decides
        # which faces are visible (judging it orthographically leaves teeth
        # along the silhouette).
        flat = screen[face]
        area = sum(flat[k, 0] * flat[(k + 1) % len(face), 1] - flat[(k + 1) % len(face), 0] * flat[k, 1] for k in range(len(face)))
        if area < 0 and cull:
            continue
        if normal[2] < 0:
            normal = -normal
        diffuse = 0.26 + 0.74 * max(0.0, float(np.dot(normal, LIGHT)))
        tone = hex_mix(BG, color, min(diffuse, 1.0))
        polygons.append((pts[:, 2].mean(), screen[face], tone))
    polygons.sort(key=lambda item: item[0])
    group = VGroup()
    for _, pts, color in polygons:
        flat = np.column_stack([pts[:, 0], pts[:, 1], np.zeros(len(pts))])
        group.add(Polygon(*flat, stroke_color=BG, stroke_width=0.6, stroke_opacity=edge_opacity, fill_color=color, fill_opacity=1))
    return group, project


def hero_surface_3d(spec, cool, warm, ts, safe):
    expression = "" if safe else clean_expression(spec.get("expression"), ("x", "y"))
    f = make_function(expression or "sin(x)*cos(y)", ("x", "y"))
    n = 30
    grid = np.linspace(-3, 3, n + 1)
    X, Y = np.meshgrid(grid, grid)
    Z = np.asarray(f(X, Y), dtype=float) * np.ones_like(X)
    if not np.all(np.isfinite(Z)):
        Z = np.nan_to_num(Z, nan=0.0, posinf=0.0, neginf=0.0)
    low, high = np.percentile(Z, [1, 99])
    Z = np.clip(Z, low, high)
    Z = (Z - (low + high) / 2) / max((high - low) / 2, 1e-6) * 1.15

    def interior(index):
        i, j = np.unravel_index(index, Z.shape)
        return 2 <= i <= n - 2 and 2 <= j <= n - 2

    # Warm marks the extremum the surface is about: the bottom of a bowl,
    # the top of a hill. Prefer whichever lies inside the domain.
    focus_min = interior(np.argmin(Z)) and not interior(np.argmax(Z))
    vertices = np.column_stack([X.ravel(), Y.ravel(), Z.ravel()])
    faces, colors = [], []
    for i in range(n):
        for j in range(n):
            a = i * (n + 1) + j
            face = [a, a + 1, a + n + 2, a + n + 1]
            faces.append(face)
            level = (vertices[face, 2].mean() + 1.15) / 2.3
            if focus_min:
                level = 1 - level
            colors.append(hex_mix(hex_mix(cool, BG, 0.25), cool, level / 0.82) if level < 0.82 else hex_mix(cool, warm, (level - 0.82) / 0.18))
    mesh, _ = shaded_mesh(vertices, np.array(faces), colors)
    return Hero(mesh)


def hero_solid_3d(spec, cool, warm, ts, safe):
    from manim import VGroup

    shape = spec.get("shape") if (not safe and spec.get("shape") in ("sphere", "torus", "cube")) else "sphere"
    phi, theta = -1.05, -0.6
    faces, colors = [], []
    if shape == "cube":
        corners = np.array([[x, y, z] for x in (-1.5, 1.5) for y in (-1.5, 1.5) for z in (-1.5, 1.5)], dtype=float)
        quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
        mesh, project = shaded_mesh(corners, np.array(quads), [cool] * 6, phi, theta, cull=True, edge_opacity=0)
        view = project(corners)
        view[:, 2] = 0
        diagonal = corner_path([view[0], view[7]])
        return Hero(VGroup(mesh, stroke(diagonal, warm, 5)))
    if shape == "torus":
        nu, nv, R, r = 64, 28, 2.2, 0.85
        us, vs = np.linspace(0, 2 * math.pi, nu + 1), np.linspace(0, 2 * math.pi, nv + 1)
        vertices = np.array([[(R + r * math.cos(v)) * math.cos(t), (R + r * math.cos(v)) * math.sin(t), r * math.sin(v)] for t in us for v in vs])
        for i in range(nu):
            for j in range(nv):
                a = i * (nv + 1) + j
                faces.append([a, a + 1, a + nv + 2, a + nv + 1])
                colors.append(warm if i in (nu // 3, nu // 3 + 1) else cool)
        mesh, _ = shaded_mesh(vertices, np.array(faces), colors, phi, theta, cull=True, edge_opacity=0.18)
        return Hero(mesh)
    nu, nv = 48, 24
    us, vs = np.linspace(0, 2 * math.pi, nu + 1), np.linspace(0, math.pi, nv + 1)
    vertices = np.array([[2.3 * math.sin(v) * math.cos(t), 2.3 * math.sin(v) * math.sin(t), 2.3 * math.cos(v)] for t in us for v in vs])
    for i in range(nu):
        for j in range(nv):
            a = i * (nv + 1) + j
            faces.append([a, a + 1, a + nv + 2, a + nv + 1])
            colors.append(warm if j in (nv // 2 - 1, nv // 2) else cool)
    mesh, _ = shaded_mesh(vertices, np.array(faces), colors, phi, theta, cull=True, edge_opacity=0.18)
    return Hero(mesh)


def hero_equation(spec, cool, warm, ts, safe):
    # Never stand in a famous but unrelated formula: without usable notation,
    # fail so the safe pass draws a neutral visual instead.
    latex = clean_latex(spec.get("notation"))
    if not latex:
        raise LayoutError("equation notation is missing or not allowed")
    for size in EQUATION_SIZES:
        mob = ts.math(latex, size, "ink", weight="SemiBold", highlight_color="cool")
        if mob.width <= ts.region_w and mob.height <= u(HEIGHT - 2 * MARGIN_Y):
            return Hero(mob, [])
    raise LayoutError("equation too wide for the hero column")


HEROES = {
    "function_plot": hero_function_plot,
    "complex_plane": hero_complex_plane,
    "wave": hero_wave,
    "probability": hero_probability,
    "geometry": hero_geometry,
    "transformation": hero_transformation,
    "vector_field": hero_vector_field,
    "orbit": hero_orbit,
    "network": hero_network,
    "atom": hero_atom,
    "energy_levels": hero_energy_levels,
    "surface_3d": hero_surface_3d,
    "solid_3d": hero_solid_3d,
    "equation": hero_equation,
    "spiral": hero_spiral,
    "chaos": hero_chaos,
    "fractal": hero_fractal,
    "bars": hero_bars,
    "number": hero_number,
}


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

def compose(spec: dict, font_dir: str, safe: bool):
    from manim import VGroup

    palette = PALETTES.get(spec.get("palette"), PALETTES["teal-amber"])
    cool, warm = palette
    ts = Typesetter(font_dir, cool, warm)
    report = {"mode": "safe" if safe else "full", "warnings": []}

    # spec["eyebrow"] is metadata only: small block-capital tags read as
    # template chrome, so the headline and the picture carry the thumbnail.
    headline = (spec.get("headline") or "").strip()
    has_copy = bool(headline)

    copy_block = None
    if has_copy:
        words = split_words(headline)
        accent_span = accent_range(headline, spec.get("accent") or "")
        strike_span = strike_range(headline, spec.get("strike") or "", accent_span) if isinstance(spec.get("strike"), str) else None
        options = line_options(words, accent_span)
        column = u(TEXT_COL_W)
        candidates = sorted(
            (score + 5 * tier, size, lines)
            for tier, size in enumerate(HEADLINE_TIERS)
            for score, widest, lines in options
            if widest * u(size) <= column * 1.06
        )
        for _, size, lines in candidates[:6]:
            rendered = [" ".join(word_tex(w, accent_span, safe, strike_span) for w in words[a:b]) for a, b in lines]
            # Display-size Computer Modern reads loose; tighten letter spacing.
            block = ts.block(rendered, size, "SemiBold", tracking=-1.5)
            if block.width <= column:
                copy_block = block
                report.update(size=size, lines=[" ".join(w.text for w in words[a:b]) for a, b in lines])
                if strike_span:
                    report["strike"] = headline[strike_span[0]:strike_span[1]]
                break
        if copy_block is None:
            raise LayoutError("headline does not fit the copy column at any type size")
        text = VGroup(copy_block)
        text.move_to([x_at(MARGIN_X) + text.width / 2, u(6), 0])
        if text.height > u(HEIGHT - 2 * MARGIN_Y):
            raise LayoutError("copy block is taller than the canvas")
        hero_region = np.array([x_at(HERO_LEFT), -FRAME_H / 2 + u(MARGIN_Y), x_at(WIDTH - MARGIN_X), FRAME_H / 2 - u(MARGIN_Y)])
    else:
        text = None
        hero_region = np.array([x_at(MARGIN_X + 120), -FRAME_H / 2 + u(MARGIN_Y), x_at(WIDTH - MARGIN_X - 120), FRAME_H / 2 - u(MARGIN_Y)])
    ts.region_w = hero_region[2] - hero_region[0]

    visual = spec.get("visual") if isinstance(spec.get("visual"), dict) else {}
    if visual.get("type") == "frame":
        path = visual.get("path")
        if not safe and isinstance(path, str) and os.path.isfile(path):
            if text is not None:
                verify(text, None, [], None)
            report["visual"] = "frame"
            report["frame"] = {"path": path, "left": HERO_LEFT - 72 if text is not None else 0}
            return ([text] if text is not None else []), report
        # Safe mode, or the frame is missing: draw the concept visual instead.
        visual = visual.get("fallback") if isinstance(visual.get("fallback"), dict) else {}
    kind = visual.get("type") if visual.get("type") in HEROES else "equation"
    if safe and kind == "equation" and not clean_latex(visual.get("notation")):
        kind = "geometry"
    if safe and kind == "number" and not clean_number(visual.get("value")):
        kind = "geometry"
    try:
        hero = HEROES[kind](visual, cool, warm, ts, safe)
    except LayoutError:
        # A formula too wide for the hero column (e.g. Bayes' rule beside a
        # headline): the safe pass draws a neutral visual instead of failing.
        if not (safe and kind in ("equation", "number")):
            raise
        kind = "geometry"
        hero = HEROES[kind](visual, cool, warm, ts, safe)
    report["visual"] = kind

    # A callout only joins a headline; the visual-only slot stays text-free.
    callout = None
    if text is not None and hero.focus is not None:
        callout = callout_copy(spec.get("callout"), ts, safe)

    # Fit the graphics, then place labels at their fixed type size. If a label
    # cannot be placed cleanly or spills out of the region, shrink and retry.
    # With a callout, each scale must also leave it clean room near the focus;
    # if none does, the hero is fitted again without it.
    region_w = hero_region[2] - hero_region[0]
    region_h = hero_region[3] - hero_region[1]
    center = np.array([(hero_region[0] + hero_region[2]) / 2, (hero_region[1] + hero_region[3]) / 2, 0.0])
    graphics = hero.graphics
    origin = graphics.get_center().copy()
    offsets = [label.anchor - origin for label in hero.labels]
    focus_offset = None if hero.focus is None else np.asarray(hero.focus, dtype=float) - origin
    base = min(region_w / max(graphics.width, 1e-6), region_h / max(graphics.height, 1e-6))
    scale = {"current": 1.0}

    def fit(with_callout):
        for shrink in (0.94, 0.86, 0.78, 0.70, 0.62):
            graphics.scale(base * shrink / scale["current"])
            scale["current"] = base * shrink
            graphics.move_to(center)
            for label, offset in zip(hero.labels, offsets):
                label.anchor = center + offset * scale["current"]
            try:
                attempt = place_labels(graphics, hero.labels, hero_region, strict=True)
            except LayoutError as error:
                report["warnings"].append(f"{error} at scale {shrink}")
                continue
            group = VGroup(graphics, *attempt)
            if group.width > region_w + 1e-6 or group.height > region_h + 1e-6:
                report["warnings"].append(f"labels spill outside the hero region at scale {shrink}")
                continue
            group.shift(center - group.get_center())
            if not with_callout:
                return attempt, None
            focus = graphics.get_center() + focus_offset * scale["current"]
            # The text block sits left of the hero; keep a gutter from it.
            room = np.array([bbox(text, u(GUTTER / 2))[2], -FRAME_H / 2 + u(SAFE_PAD), FRAME_W / 2 - u(SAFE_PAD), FRAME_H / 2 - u(SAFE_PAD)])
            pointer = place_callout(callout, focus, graphics, attempt, room, warm)
            if pointer is not None:
                return attempt, pointer
        return None, None

    placed, pointer = fit(callout is not None)
    if callout is not None and placed is None:
        report["notes"] = ["callout dropped: no clean room near the focal detail"]
        placed, pointer = fit(False)
    elif callout is not None:
        report["callout"] = spec.get("callout")
    if placed is None:
        raise LayoutError("hero and its labels cannot fit the hero region")
    if pointer is not None:
        placed = placed + [callout]
        graphics = VGroup(graphics, pointer)

    hero_group = VGroup(graphics, *placed)
    verify(text, hero_group, placed, graphics)
    box = bbox(hero_group)
    report["hero_box_px"] = [round((box[0] + FRAME_W / 2) * PX), round((FRAME_H / 2 - box[3]) * PX), round((box[2] + FRAME_W / 2) * PX), round((FRAME_H / 2 - box[1]) * PX)]
    mobjects = [hero_group] + ([text] if text is not None else [])
    return mobjects, report


def verify(text, hero_group, labels, graphics):
    """Hard layout rules. Any violation fails the render.

    ``hero_group`` is None for a video-frame hero, which is composited as an
    image and bleeds off the right edge by design: only the copy is checked.
    """
    if text is not None and hero_group is not None:
        if boxes_overlap(bbox(text, u(GUTTER / 2)), bbox(hero_group)):
            raise LayoutError("copy block and hero overlap")
    safe_box = np.array([-FRAME_W / 2 + u(SAFE_PAD), -FRAME_H / 2 + u(SAFE_PAD), FRAME_W / 2 - u(SAFE_PAD), FRAME_H / 2 - u(SAFE_PAD)])
    for mob in ([text] if text is not None else []) + ([hero_group] if hero_group is not None else []):
        box = bbox(mob)
        if box[0] < safe_box[0] or box[1] < safe_box[1] or box[2] > safe_box[2] or box[3] > safe_box[3]:
            raise LayoutError("content outside the safe area")
    badge = np.array([x_at(BADGE_ZONE[0]), y_at(BADGE_ZONE[3]), x_at(BADGE_ZONE[2]), y_at(BADGE_ZONE[1])])
    points = [bezier_samples(mob) for mob in (hero_group, text) if mob is not None]
    points = np.vstack(points) if points else np.zeros((0, 3))
    inside = (points[:, 0] > badge[0]) & (points[:, 0] < badge[2]) & (points[:, 1] > badge[1]) & (points[:, 1] < badge[3])
    if inside.any():
        raise LayoutError("content under the YouTube duration badge")
    for i, a in enumerate(labels):
        for b in labels[i + 1:]:
            if boxes_overlap(bbox(a), bbox(b)):
                raise LayoutError("labels overlap")


# ---------------------------------------------------------------------------
# Canvas: the video's flat background; video frames are feathered into it.
# ---------------------------------------------------------------------------


def rgb255(color: str) -> np.ndarray:
    value = color.lstrip("#")
    return np.array([int(value[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def canvas() -> np.ndarray:
    """Float RGB canvas (0-255): flat BG, as in 3Blue1Brown thumbnails."""
    return np.broadcast_to(rgb255(BG), (HEIGHT, WIDTH, 3)).astype(np.float32)


def feathered_frame(path: str, left_px: int):
    """A video frame scaled into the hero column, its edges dissolved into
    the canvas. Returns (rgb float array, alpha float array, x, y)."""
    from PIL import Image, ImageEnhance

    image = Image.open(path).convert("RGB")
    image = ImageEnhance.Color(image).enhance(1.12)
    area_w, area_h = WIDTH - left_px, HEIGHT
    scale = min(area_w / image.width, area_h / image.height)
    size = (min(area_w, max(1, round(image.width * scale))), min(area_h, max(1, round(image.height * scale))))
    image = image.resize(size, Image.LANCZOS)
    w, h = size
    x, y = left_px + (area_w - w) // 2, (HEIGHT - h) // 2
    feather = max(24.0, min(w, h) * 0.12)
    xs, ys = np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32)
    fx = np.clip(np.minimum(xs + 0.5, w - xs - 0.5) / feather, 0, 1)
    fy = np.clip(np.minimum(ys + 0.5, h - ys - 0.5) / feather, 0, 1)
    alpha = np.outer(fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx))
    return np.asarray(image, dtype=np.float32), alpha, x, y


def render(spec: dict, out_path: str, font_dir: str, work_dir: str, safe: bool) -> dict:
    from manim import config

    # XeLaTeX resolves font paths from its own working directory, and Manim
    # does not create missing parents for its Tex cache: use absolute paths.
    font_dir, work_dir, out_path = (os.path.abspath(p) for p in (font_dir, work_dir, out_path))
    os.makedirs(os.path.join(work_dir, "Tex"), exist_ok=True)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    config.pixel_width, config.pixel_height = WIDTH, HEIGHT
    config.frame_height, config.frame_width = FRAME_H, FRAME_W
    config.background_color = BG
    config.media_dir = work_dir
    config.verbosity = "ERROR"
    config.progress_bar = "none"
    from manim.camera.camera import Camera

    started = time.time()
    mobjects, report = compose(spec, font_dir, safe)
    frame = report.get("frame")
    if frame:
        rgb, alpha, x, y = feathered_frame(frame["path"], frame["left"])
        background = canvas()
        region = background[y:y + rgb.shape[0], x:x + rgb.shape[1]]
        # Lighten blend: the video's own dark canvas never paints over the
        # thumbnail's, so only the content shows, with no box edge.
        lifted = np.maximum(region, rgb)
        region[:] = region * (1 - alpha[:, :, None]) + lifted * alpha[:, :, None]
        report["frame_box_px"] = [x, y, x + rgb.shape[1], y + rgb.shape[0]]
    else:
        background = canvas()
    camera = Camera(background_color=BG)
    camera.background[:, :, :3] = np.clip(background, 0, 255).astype(np.uint8)
    camera.reset()
    camera.capture_mobjects(mobjects)
    camera.get_image().convert("RGB").save(out_path, optimize=True)
    report["seconds"] = round(time.time() - started, 2)
    return report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parallel_jobs() -> int:
    """Concurrent renders the machine can afford (~400 MB and one core each)."""
    available_mb = 1024
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("MemAvailable:"):
                    available_mb = int(line.split()[1]) // 1024
    except OSError:
        pass
    return max(1, min(3, os.cpu_count() or 1, available_mb // 400))


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("render")
    one.add_argument("--spec", required=True)
    one.add_argument("--index", type=int, required=True)
    one.add_argument("--out", required=True)
    one.add_argument("--font-dir", required=True)
    one.add_argument("--work-dir", required=True)
    one.add_argument("--safe", action="store_true")
    many = sub.add_parser("batch")
    many.add_argument("--spec", required=True)
    many.add_argument("--out-dir", required=True)
    many.add_argument("--font-dir", required=True)
    many.add_argument("--timeout", type=float, default=150)
    many.add_argument("--jobs", type=int, default=0)
    args = parser.parse_args()

    args.spec = os.path.abspath(args.spec)
    args.font_dir = os.path.abspath(args.font_dir)
    if args.command == "batch":
        args.out_dir = os.path.abspath(args.out_dir)
    with open(args.spec, encoding="utf-8") as handle:
        specs = json.load(handle)

    if args.command == "render":
        report = render(specs[args.index], args.out, args.font_dir, args.work_dir, args.safe)
        print(json.dumps(report))
        return 0

    os.makedirs(args.out_dir, exist_ok=True)
    deadline = time.time() + args.timeout
    jobs = args.jobs or parallel_jobs()
    results, errors = {}, {}
    queue = [(index, False) for index in range(len(specs))]
    running = {}

    def launch(index, safe):
        out = os.path.join(args.out_dir, f"thumbnail-{index}.png")
        work = os.path.join(args.out_dir, f"work-{index}-{'safe' if safe else 'full'}")
        command = [sys.executable, os.path.abspath(__file__), "render", "--spec", args.spec, "--index", str(index), "--out", out, "--font-dir", args.font_dir, "--work-dir", work]
        if safe:
            command.append("--safe")
        # Log to files, not pipes: a long traceback must never block the child.
        os.makedirs(work, exist_ok=True)
        stdout = open(os.path.join(work, "stdout.log"), "w+", encoding="utf-8")
        stderr = open(os.path.join(work, "stderr.log"), "w+", encoding="utf-8")
        return subprocess.Popen(command, stdout=stdout, stderr=stderr, text=True), stdout, stderr

    # Each candidate renders in its own process; a failed full render is
    # retried once in safe mode. Concurrency is sized to the machine because
    # XeLaTeX with unicode-math is memory hungry (render sandboxes have ~1 GB).
    while queue or running:
        while queue and len(running) < jobs and time.time() < deadline:
            index, safe = queue.pop(0)
            running[index] = (*launch(index, safe), safe)
        if not running:
            break
        time.sleep(0.2)
        for index, (process, stdout_file, stderr_file, safe) in list(running.items()):
            if process.poll() is None and time.time() < deadline:
                continue
            if process.poll() is None:
                process.kill()
            process.wait()
            stdout_file.seek(0)
            stderr_file.seek(0)
            stdout, stderr = stdout_file.read(), stderr_file.read()
            stdout_file.close()
            stderr_file.close()
            del running[index]
            if process.returncode == 0 and stdout.strip():
                results[index] = {"ok": True, "path": os.path.join(args.out_dir, f"thumbnail-{index}.png"), "report": json.loads(stdout.strip().splitlines()[-1])}
                if errors.get(index):
                    results[index]["recovered_from"] = errors[index]
                continue
            errors.setdefault(index, []).append(("safe: " if safe else "full: ") + (stderr.strip() or "timed out")[-1500:])
            if not safe:
                queue.append((index, True))
            else:
                results[index] = {"ok": False, "errors": errors[index]}
    for index in range(len(specs)):
        results.setdefault(index, {"ok": False, "errors": errors.get(index, ["not started before the deadline"])})

    with open(os.path.join(args.out_dir, "results.json"), "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2)
    print(json.dumps(results))
    return 0 if any(result["ok"] for result in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
