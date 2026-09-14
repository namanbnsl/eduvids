import type { VideoTitleSet } from "./youtube-metadata";

export const THUMBNAIL_CLASS_NAMES = [
  "EduvidsThumbnailA",
  "EduvidsThumbnailB",
  "EduvidsThumbnailC",
] as const;

function wrapTitle(title: string, maxLineLength = 24): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxLineLength && lines.length < 2) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function thumbnailHook(title: string): string {
  const meaningful = title
    .replace(/[—–:?!]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}→-]/gu, ""))
    .filter(Boolean)
    .filter(
      (word) =>
        !new Set([
          "a",
          "an",
          "and",
          "actually",
          "between",
          "breaking",
          "even",
          "finally",
          "from",
          "how",
          "in",
          "is",
          "makes",
          "of",
          "the",
          "to",
          "visualized",
          "visually",
          "what",
          "why",
          "without",
          "world",
        ]).has(word.toLowerCase()),
    );
  const dimensions = meaningful.filter((word) => /^\d+d$/i.test(word));
  const hook =
    dimensions.length >= 2 && meaningful[0]
      ? `${meaningful[0]} ${dimensions[0]} → ${dimensions[1]}`
      : meaningful.slice(0, 4).join(" ");
  return (hook || title).toUpperCase();
}

function motifFor(text: string): string {
  const normalized = text.toLowerCase();
  if (/tensor|matrix|vector|dimension|3d|geometry|triangle/.test(normalized)) {
    return "geometry";
  }
  if (
    /derivative|differentiat|calculus|slope|limit|function/.test(normalized)
  ) {
    return "calculus";
  }
  if (/wave|fourier|sound|frequency|quantum|light/.test(normalized)) {
    return "wave";
  }
  if (/gravity|space|planet|orbit|relativ|black hole|star/.test(normalized)) {
    return "orbit";
  }
  if (/ai|neural|network|brain|algorithm|computer/.test(normalized)) {
    return "network";
  }
  return "abstract";
}

function pythonLines(lines: string[]): string {
  return JSON.stringify(lines);
}

export function buildThumbnailManimScript({
  titles,
  topic,
}: {
  titles: VideoTitleSet;
  topic: string;
}): string {
  const motif = motifFor(`${topic} ${titles.candidates.join(" ")}`);
  const wrapped = titles.candidates.map((title) =>
    wrapTitle(thumbnailHook(title), 18),
  );

  return `from manim import *
import numpy as np

config.background_color = "#05070D"


def title_group(lines, color=WHITE, font_size=54):
    group = VGroup(*[
        Text(line, font="EB Garamond", font_size=font_size, color=color)
        for line in lines
    ]).arrange(DOWN, aligned_edge=LEFT, buff=0.10)
    return group


def brand_mark():
    label = Text("EDUVIDS", font="EB Garamond", disable_ligatures=True, font_size=22, weight=BOLD, color="#E8EEF8")
    pill = RoundedRectangle(width=2.15, height=0.52, corner_radius=0.22, stroke_color="#334155", stroke_width=1.5, fill_color="#101827", fill_opacity=0.95)
    label.move_to(pill)
    return VGroup(pill, label)


def background_grid(accent):
    lines = VGroup()
    for x in np.linspace(-7, 7, 15):
        lines.add(Line([x, -4, 0], [x, 4, 0], stroke_width=0.7, color=accent, stroke_opacity=0.10))
    for y in np.linspace(-4, 4, 9):
        lines.add(Line([-7, y, 0], [7, y, 0], stroke_width=0.7, color=accent, stroke_opacity=0.10))
    return lines


def glow_dot(point, accent, radius=0.16):
    glow = VGroup(*[
        Circle(radius=radius * scale, stroke_width=0, fill_color=accent, fill_opacity=opacity).move_to(point)
        for scale, opacity in [(3.6, 0.05), (2.4, 0.09), (1.5, 0.16)]
    ])
    return VGroup(glow, Dot(point, radius=radius, color=accent))


def visual_motif(kind, accent, secondary):
    if kind == "calculus":
        curve = ParametricFunction(lambda t: [t, 0.22 * (t + 1.4) ** 2 - 1.4, 0], t_range=[-2.8, 2.8], color=accent, stroke_width=8)
        tangent = Line([-2.4, -1.75, 0], [2.5, 1.9, 0], color=secondary, stroke_width=5)
        point = glow_dot([0.25, -0.80, 0], secondary, 0.14)
        return VGroup(curve, tangent, point)
    if kind == "wave":
        waves = VGroup(*[
            ParametricFunction(
                lambda t, phase=phase, amp=amp: [t, amp * np.sin(1.8 * t + phase), 0],
                t_range=[-3.0, 3.0], color=color, stroke_width=width,
            )
            for phase, amp, color, width in [(0, 0.95, accent, 8), (1.25, 0.58, secondary, 4), (2.5, 0.34, "#E8EEF8", 2)]
        ])
        return waves
    if kind == "orbit":
        orbits = VGroup(
            Ellipse(width=5.7, height=2.2, color=accent, stroke_width=4),
            Ellipse(width=4.6, height=3.5, color=secondary, stroke_width=2).rotate(0.45),
            glow_dot(ORIGIN, accent, 0.34),
            glow_dot([2.35, 0.62, 0], secondary, 0.13),
        )
        return orbits
    if kind == "network":
        points = [[-2.4, 1.4, 0], [-2.7, -1.0, 0], [-0.7, 0.3, 0], [1.2, 1.5, 0], [1.0, -1.3, 0], [2.8, 0.1, 0]]
        edges = VGroup(*[
            Line(points[a], points[b], color="#64748B", stroke_width=2.5, stroke_opacity=0.65)
            for a, b in [(0, 2), (1, 2), (2, 3), (2, 4), (3, 5), (4, 5)]
        ])
        nodes = VGroup(*[glow_dot(point, accent if i % 2 == 0 else secondary, 0.14) for i, point in enumerate(points)])
        return VGroup(edges, nodes)
    if kind == "geometry":
        front = Polygon([-1.6, -1.3, 0], [1.0, -1.3, 0], [1.0, 1.3, 0], [-1.6, 1.3, 0], color=accent, stroke_width=6)
        back = front.copy().shift([0.9, 0.65, 0]).set_color(secondary).set_stroke(width=4, opacity=0.8)
        joins = VGroup(*[
            Line(front.get_vertices()[i], back.get_vertices()[i], color="#E8EEF8", stroke_width=3, stroke_opacity=0.75)
            for i in range(4)
        ])
        return VGroup(back, joins, front)
    rings = VGroup(*[
        Arc(radius=0.62 + i * 0.42, start_angle=0.32 * i, angle=1.35 * PI, color=accent if i % 2 == 0 else secondary, stroke_width=max(2, 8 - i), stroke_opacity=0.95 - i * 0.10)
        for i in range(6)
    ])
    return VGroup(rings, glow_dot(ORIGIN, accent, 0.18))


class ${THUMBNAIL_CLASS_NAMES[0]}(Scene):
    def construct(self):
        accent, secondary = "#5EE7F7", "#8B5CF6"
        self.add(background_grid(accent))
        motif = visual_motif(${JSON.stringify(motif)}, accent, secondary).scale(1.05).move_to(RIGHT * 3.65)
        panel = RoundedRectangle(width=7.8, height=6.2, corner_radius=0.28, stroke_width=0, fill_color="#080C15", fill_opacity=0.90).move_to(LEFT * 3.25)
        title = title_group(${pythonLines(wrapped[0] ?? [])}, font_size=66)
        if title.width > 6.5:
            title.scale_to_fit_width(6.5)
        title.move_to(panel).align_to(panel, LEFT).shift(RIGHT * 0.65)
        brand = brand_mark().to_corner(UL, buff=0.45)
        rule = Line([-6.45, -3.45, 0], [6.45, -3.45, 0], color=accent, stroke_width=5)
        self.add(panel, motif, title, brand, rule)


class ${THUMBNAIL_CLASS_NAMES[1]}(Scene):
    def construct(self):
        accent, secondary = "#FFB84D", "#FF4D8D"
        self.add(background_grid(secondary))
        motif = visual_motif(${JSON.stringify(motif)}, accent, secondary).scale(1.75).set_opacity(0.34).move_to(RIGHT * 3.7 + DOWN * 0.3)
        vignette = RoundedRectangle(width=12.4, height=5.7, corner_radius=0.35, stroke_color="#3A2633", stroke_width=2, fill_color="#080A10", fill_opacity=0.88)
        title = title_group(${pythonLines(wrapped[1] ?? [])}, font_size=70)
        if title.width > 10.7:
            title.scale_to_fit_width(10.7)
        title.move_to(vignette).align_to(vignette, LEFT).shift(RIGHT * 0.75)
        brand = brand_mark().to_corner(UL, buff=0.45)
        accent_bar = Rectangle(width=0.12, height=3.9, stroke_width=0, fill_color=accent, fill_opacity=1).next_to(title, LEFT, buff=0.45)
        self.add(motif, vignette, title, accent_bar, brand)


class ${THUMBNAIL_CLASS_NAMES[2]}(Scene):
    def construct(self):
        accent, secondary = "#8AF59A", "#5EE7F7"
        self.add(background_grid(accent))
        motif = visual_motif(${JSON.stringify(motif)}, accent, secondary).scale(0.92).move_to(LEFT * 3.8)
        halo = Circle(radius=2.75, stroke_width=2, stroke_color=accent, stroke_opacity=0.25, fill_color="#0A1712", fill_opacity=0.72).move_to(motif)
        title = title_group(${pythonLines(wrapped[2] ?? [])}, font_size=62)
        if title.width > 6.2:
            title.scale_to_fit_width(6.2)
        title.move_to(RIGHT * 3.35).align_to(RIGHT * 6.25, RIGHT)
        brand = brand_mark().to_corner(UR, buff=0.45)
        divider = Line([0.0, -2.9, 0], [0.0, 2.9, 0], color="#334155", stroke_width=2)
        self.add(halo, motif, divider, title, brand)
`;
}
