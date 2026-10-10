#!/usr/bin/env python3
"""eduvids thumbnail renderer.

Data in, PNG out: every thumbnail is described by a JSON spec (copy, palette,
hero visual and its parameters). The model never writes code; it only fills
slots that this module validates, lays out and checks.

    renderer.py batch  --spec specs.json --out-dir DIR --font-dir FONTS
    renderer.py render --spec specs.json --index N --out FILE.png --font-dir FONTS [--safe]

Design system
- Canvas 1280x720, solid background, fixed margins and a two-column grid:
  copy on the left, one hero visual on the right.
- Typography is typeset by XeLaTeX: Inter Tight for text, Inter Tight (italic)
  for math letters and digits, Fira Math for operators, so math and prose
  share one family and one baseline.
- One cool hue carries the visual; one warm hue marks the single focal detail
  and the accent words of the headline.
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

BG = "#0E0F11"
INK = "#EDEAE4"
MUTED = "#8A8F98"

PALETTES = {
    "teal-amber": ("#46C2B8", "#F2B84B"),
    "azure-coral": ("#6AAEE8", "#F07167"),
    "violet-amber": ("#A595F0", "#F2B84B"),
    "teal-rose": ("#46C2B8", "#EE85B5"),
    "azure-amber": ("#6AAEE8", "#F2B84B"),
}

# Type scale (em size in px). Headlines step down a tier only when the copy
# cannot fit the column at the larger size.
HEADLINE_TIERS = (66, 58, 50)
HEADLINE_LEADING = 1.08
EYEBROW_SIZE = 20
LABEL_SIZE = 34
CAPTION_SIZE = 30
EQUATION_SIZES = (92, 82, 72, 64)
CAP_HEIGHT = 0.727  # Inter Tight cap height / em

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
    "div", "pm", "mp", "le", "leq", "ge", "geq", "ne", "neq", "approx",
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
        upright = f"InterTight-{weight}.ttf"
        italic = f"InterTight-{weight}Italic.ttf"
        preamble = "\n".join([
            r"\usepackage{amsmath}",
            r"\usepackage{fontspec}",
            r"\usepackage{unicode-math}",
            r"\usepackage{xcolor}",
            r"\defaultfontfeatures{Kerning=On}",
            rf"\setmainfont{{{upright}}}[Path={path}, ItalicFont={italic}, BoldFont={upright}, BoldItalicFont={italic}]",
            rf"\setmathfont{{FiraMath-Regular.otf}}[Path={path}]",
            rf"\setmathfont{{{italic}}}[Path={path}, range={{it/{{latin,Latin,greek,Greek}}}}]",
            rf"\setmathfont{{{upright}}}[Path={path}, range={{up/{{num,latin,Latin,greek,Greek}},bfup/{{num,latin,Latin}}}}]",
            rf'\setmathfont{{{upright}}}[Path={path}, range={{"002B,"003D,"2212,"00D7,"003C,"003E,"00B1}}]',
            rf"\definecolor{{ink}}{{HTML}}{{{INK[1:]}}}",
            rf"\definecolor{{muted}}{{HTML}}{{{MUTED[1:]}}}",
            rf"\definecolor{{cool}}{{HTML}}{{{self.cool[1:]}}}",
            rf"\definecolor{{accent}}{{HTML}}{{{self.warm[1:]}}}",
            r"\newcommand{\hl}[1]{\textcolor{accent}{#1}}",
            r"\setlength{\tabcolsep}{0pt}",
            # Inter's operators carry their own side bearings; tighten TeX's math spacing to match.
            r"\medmuskip=2.5mu plus 1mu minus 1mu",
            r"\thickmuskip=3.5mu plus 2mu",
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

    def math(self, latex: str, size_px: float, color="ink", weight="Medium"):
        body = rf"\fontsize{{10}}{{12}}\selectfont\color{{{color}}}$\displaystyle {math_spacing(latex)}$"
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


def word_tex(word: Word, accent_span, safe: bool) -> str:
    """Escape prose, keep validated $math$, colour the accent characters."""
    parts = re.split(r"(\$[^$]*\$)", word.text)
    out, offset = [], word.start
    for part in parts:
        if not part:
            continue
        span = (offset, offset + len(part))
        offset += len(part)
        is_accent = accent_span is not None and span[0] < accent_span[1] and span[1] > accent_span[0]
        if part.startswith("$") and part.endswith("$") and len(part) > 1:
            latex = clean_latex(part[1:-1])
            if not latex or safe:
                rendered = tex_escape(smart_punctuation(re.sub(r"\\[A-Za-z]+|[{}_^$]", "", part)))
            else:
                rendered = f"${math_spacing(latex)}$"
            out.append(rf"\hl{{{rendered}}}" if is_accent else rendered)
            continue
        text = smart_punctuation(part.replace("~", " "))
        if accent_span is None:
            out.append(tex_escape(text))
            continue
        current, flag = "", None
        for position, char in enumerate(text):
            absolute = span[0] + position
            inside = accent_span[0] <= absolute < accent_span[1]
            if flag is not None and inside != flag:
                out.append(rf"\hl{{{tex_escape(current)}}}" if flag else tex_escape(current))
                current = ""
            current += char
            flag = inside
        if current:
            out.append(rf"\hl{{{tex_escape(current)}}}" if flag else tex_escape(current))
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


# ---------------------------------------------------------------------------
# Hero visuals
# ---------------------------------------------------------------------------

@dataclass
class Hero:
    graphics: object
    labels: list = field(default_factory=list)


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
    hero = Hero(graphics)
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
    hero = Hero(graphics)
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
    return Hero(graphics)


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
    hero = Hero(graphics)
    notation = "" if safe else clean_latex(spec.get("notation"))
    if notation:
        hero.labels.append(Label(ts.math(notation, CAPTION_SIZE), to_screen(0, 0), [DOWN], buff=u(28)))
    return hero


def hero_geometry(spec, cool, warm, ts, safe):
    from manim import Arc, Circle, Line, Polygon, RegularPolygon, VGroup, DOWN, LEFT, RIGHT, UP, PI

    shape = spec.get("shape") if (not safe and spec.get("shape") in ("pythagoras", "inscribed_polygon", "triangle_angles")) else "pythagoras"
    hero = Hero(VGroup())
    if shape == "pythagoras":
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
    hero = Hero(VGroup(ghost, warped, i_hat, j_hat))
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
    return Hero(graphics)


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
    return Hero(VGroup(edges, highlight, nodes))


def hero_atom(spec, cool, warm, ts, safe):
    from manim import Circle, Dot, Ellipse, VGroup

    shells = VGroup(*[stroke(Ellipse(width=6.0, height=2.0).rotate(angle), INK, 2.5, 0.35) for angle in (0, math.pi / 3, 2 * math.pi / 3)])
    offsets = [(-0.17, 0.13), (0.17, 0.13), (0.0, -0.16), (-0.27, -0.1), (0.27, -0.1), (0.0, 0.27), (0.0, 0.02)]
    nucleus = VGroup(*[Circle(radius=0.21).move_to([x, y, 0]).set_stroke(BG, 2).set_fill(cool if k % 2 else hex_mix(cool, BG, 0.35), 1) for k, (x, y) in enumerate(offsets)])
    electrons = VGroup()
    for k, shell in enumerate(shells):
        point = shell.point_from_proportion((0.12 + 0.31 * k) % 1)
        electrons.add(Dot(point, radius=0.12, color=warm if k == 0 else cool))
    return Hero(VGroup(shells, nucleus, electrons))


def rotation_matrix(phi, theta):
    cz, sz = math.cos(theta), math.sin(theta)
    cx, sx = math.cos(phi), math.sin(phi)
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    return rx @ rz


LIGHT = np.array([-0.35, 0.55, 0.76])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def shaded_mesh(vertices, faces, colors, phi=-1.1, theta=-0.75, cull=False, edge_opacity=0.28):
    """Orthographic projection with painter's ordering and Lambert shading."""
    from manim import Polygon, VGroup

    rotation = rotation_matrix(phi, theta)
    view = vertices @ rotation.T
    polygons = []
    for face, color in zip(faces, colors):
        pts = view[face]
        normal = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        norm = np.linalg.norm(normal)
        if norm < 1e-12:
            continue
        normal /= norm
        if normal[2] < 0:
            if cull:
                continue
            normal = -normal
        light = 0.32 + 0.68 * max(0.0, float(np.dot(normal, LIGHT)))
        polygons.append((pts[:, 2].mean(), pts, hex_mix(BG, color, light)))
    polygons.sort(key=lambda item: item[0])
    group = VGroup()
    for _, pts, color in polygons:
        flat = np.column_stack([pts[:, 0], pts[:, 1], np.zeros(len(pts))])
        group.add(Polygon(*flat, stroke_color=BG, stroke_width=0.6, stroke_opacity=edge_opacity, fill_color=color, fill_opacity=1))
    return group, rotation


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
        mesh, rotation = shaded_mesh(corners, np.array(quads), [cool] * 6, phi, theta, cull=True, edge_opacity=0)
        view = corners @ rotation.T
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
    latex = clean_latex(spec.get("notation")) or r"e^{i\pi} + 1 = 0"
    for size in EQUATION_SIZES:
        mob = ts.math(latex, size, "ink", weight="SemiBold")
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
    "surface_3d": hero_surface_3d,
    "solid_3d": hero_solid_3d,
    "equation": hero_equation,
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

    headline = (spec.get("headline") or "").strip()
    eyebrow = (spec.get("eyebrow") or "").strip()
    has_copy = bool(headline)

    copy_block = None
    if has_copy:
        words = split_words(headline)
        accent_span = accent_range(headline, spec.get("accent") or "")
        options = line_options(words, accent_span)
        column = u(TEXT_COL_W)
        candidates = sorted(
            (score + 5 * tier, size, lines)
            for tier, size in enumerate(HEADLINE_TIERS)
            for score, widest, lines in options
            if widest * u(size) <= column * 1.06
        )
        for _, size, lines in candidates[:6]:
            rendered = [" ".join(word_tex(w, accent_span, safe) for w in words[a:b]) for a, b in lines]
            block = ts.block(rendered, size, "SemiBold", tracking=-1.2)
            if block.width <= column:
                copy_block = block
                report.update(size=size, lines=[" ".join(w.text for w in words[a:b]) for a, b in lines])
                break
        if copy_block is None:
            raise LayoutError("headline does not fit the copy column at any type size")
        parts = []
        if eyebrow:
            kicker = ts.block([tex_escape(eyebrow.upper())], EYEBROW_SIZE, "Medium", color="muted", leading=1.2, tracking=14)
            parts.append(kicker)
        parts.append(copy_block)
        text = VGroup(*parts)
        if len(parts) == 2:
            parts[1].next_to(parts[0], np.array([0, -1, 0]), buff=u(26), aligned_edge=np.array([-1, 0, 0]))
        text.move_to([x_at(MARGIN_X) + text.width / 2, u(6), 0])
        if text.height > u(HEIGHT - 2 * MARGIN_Y):
            raise LayoutError("copy block is taller than the canvas")
        hero_region = np.array([x_at(HERO_LEFT), -FRAME_H / 2 + u(MARGIN_Y), x_at(WIDTH - MARGIN_X), FRAME_H / 2 - u(MARGIN_Y)])
    else:
        text = None
        hero_region = np.array([x_at(MARGIN_X + 120), -FRAME_H / 2 + u(MARGIN_Y), x_at(WIDTH - MARGIN_X - 120), FRAME_H / 2 - u(MARGIN_Y)])
    ts.region_w = hero_region[2] - hero_region[0]

    visual = spec.get("visual") if isinstance(spec.get("visual"), dict) else {}
    kind = visual.get("type") if visual.get("type") in HEROES else "equation"
    if safe and kind == "equation" and not clean_latex(visual.get("notation")):
        kind = "geometry"
    hero = HEROES[kind](visual, cool, warm, ts, safe)
    report["visual"] = kind

    # Fit the graphics, then place labels at their fixed type size. If a label
    # cannot be placed cleanly or spills out of the region, shrink and retry.
    region_w = hero_region[2] - hero_region[0]
    region_h = hero_region[3] - hero_region[1]
    center = np.array([(hero_region[0] + hero_region[2]) / 2, (hero_region[1] + hero_region[3]) / 2, 0.0])
    graphics = hero.graphics
    origin = graphics.get_center().copy()
    offsets = [label.anchor - origin for label in hero.labels]
    base = min(region_w / max(graphics.width, 1e-6), region_h / max(graphics.height, 1e-6))
    current, placed = 1.0, None
    for shrink in (0.94, 0.86, 0.78, 0.70, 0.62):
        graphics.scale(base * shrink / current)
        current = base * shrink
        graphics.move_to(center)
        for label, offset in zip(hero.labels, offsets):
            label.anchor = center + offset * current
        try:
            attempt = place_labels(graphics, hero.labels, hero_region, strict=True)
        except LayoutError as error:
            report["warnings"].append(f"{error} at scale {shrink}")
            continue
        group = VGroup(graphics, *attempt)
        if group.width <= region_w + 1e-6 and group.height <= region_h + 1e-6:
            shift = center - group.get_center()
            group.shift(shift)
            placed = attempt
            break
        report["warnings"].append(f"labels spill outside the hero region at scale {shrink}")
    if placed is None:
        raise LayoutError("hero and its labels cannot fit the hero region")

    hero_group = VGroup(graphics, *placed)
    verify(text, hero_group, placed, graphics)
    box = bbox(hero_group)
    report["hero_box_px"] = [round((box[0] + FRAME_W / 2) * PX), round((FRAME_H / 2 - box[3]) * PX), round((box[2] + FRAME_W / 2) * PX), round((FRAME_H / 2 - box[1]) * PX)]
    mobjects = [hero_group] + ([text] if text is not None else [])
    return mobjects, report


def verify(text, hero_group, labels, graphics):
    """Hard layout rules. Any violation fails the render."""
    if text is not None:
        if boxes_overlap(bbox(text, u(GUTTER / 2)), bbox(hero_group)):
            raise LayoutError("copy block and hero overlap")
    safe_box = np.array([-FRAME_W / 2 + u(SAFE_PAD), -FRAME_H / 2 + u(SAFE_PAD), FRAME_W / 2 - u(SAFE_PAD), FRAME_H / 2 - u(SAFE_PAD)])
    for mob in ([text] if text is not None else []) + [hero_group]:
        box = bbox(mob)
        if box[0] < safe_box[0] or box[1] < safe_box[1] or box[2] > safe_box[2] or box[3] > safe_box[3]:
            raise LayoutError("content outside the safe area")
    badge = np.array([x_at(BADGE_ZONE[0]), y_at(BADGE_ZONE[3]), x_at(BADGE_ZONE[2]), y_at(BADGE_ZONE[1])])
    points = bezier_samples(hero_group)
    if text is not None:
        points = np.vstack([points, bezier_samples(text)])
    inside = (points[:, 0] > badge[0]) & (points[:, 0] < badge[2]) & (points[:, 1] > badge[1]) & (points[:, 1] < badge[3])
    if inside.any():
        raise LayoutError("content under the YouTube duration badge")
    for i, a in enumerate(labels):
        for b in labels[i + 1:]:
            if boxes_overlap(bbox(a), bbox(b)):
                raise LayoutError("labels overlap")


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
    camera = Camera(background_color=BG)
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
