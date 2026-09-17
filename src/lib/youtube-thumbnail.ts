import {
  sanitizeThumbnailPlotExpression,
  type ThumbnailVisualType,
  type VideoTitleSet,
} from "./youtube-metadata";

export const THUMBNAIL_CLASS_NAMES = [
  "EduvidsThumbnailA",
  "EduvidsThumbnailB",
  "EduvidsThumbnailC",
] as const;

const PALETTES = [
  ["#20C4D9", "#F5D547", "#E65A8D"],
  ["#58C4DD", "#FC6255", "#83C167"],
  ["#F0AC5F", "#6DD3CE", "#C97BDB"],
  ["#7EC8E3", "#FF6B9D", "#FFE66D"],
] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inferVisualType(text: string): ThumbnailVisualType {
  const normalized = text.toLowerCase();
  if (/surface|manifold|terrain|wave surface|multivariable/.test(normalized)) {
    return "surface_3d";
  }
  if (
    /solid|sphere|volume|polyhedron|torus|three dimensional|3d/.test(normalized)
  ) {
    return "solid_3d";
  }
  if (/euler|complex|imaginary|unit circle|phase/.test(normalized)) {
    return "complex_plane";
  }
  if (
    /probab|chance|random|bayes|distribution|dice|statistic/.test(normalized)
  ) {
    return "probability";
  }
  if (/atom|molecule|chem|bond|electron/.test(normalized)) return "atom";
  if (/gravity|space|planet|orbit|relativ|black hole|star/.test(normalized)) {
    return "orbit";
  }
  if (/wave|fourier|sound|frequency|quantum|light/.test(normalized)) {
    return "wave";
  }
  if (
    /derivative|differentiat|calculus|slope|limit|function|laplace/.test(
      normalized,
    )
  ) {
    return "function_plot";
  }
  if (/tensor|matrix|transform|coordinate|mapping|dimension/.test(normalized)) {
    return "transformation";
  }
  if (/vector|field|force|velocity|flow/.test(normalized)) {
    return "vector_field";
  }
  if (/ai|neural|network|brain|algorithm|computer|graph/.test(normalized)) {
    return "network";
  }
  return "geometry";
}

function numpyPlotExpression(value: unknown): string {
  return sanitizeThumbnailPlotExpression(value)
    .replace(/\b(sin|cos|tan|exp|log|sqrt|abs)\b/g, "np.$1")
    .replace(/\bpi\b/g, "np.pi");
}

function plotRange(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return [-5, 5];
  const [minimum, maximum] = value;
  return typeof minimum === "number" &&
    typeof maximum === "number" &&
    Number.isFinite(minimum) &&
    Number.isFinite(maximum) &&
    minimum >= -20 &&
    maximum <= 20 &&
    maximum - minimum >= 0.5
    ? [minimum, maximum]
    : [-5, 5];
}

function detailFor(text: string): string {
  const normalized = text.toLowerCase();
  if (/sphere|surface|globe|ball|topolog/.test(normalized)) return "sphere";
  if (/circle|intersect|euclid|venn/.test(normalized)) return "circles";
  if (/triangle|angle|polygon/.test(normalized)) return "triangle";
  if (/spike|spectrum|frequency|laplace/.test(normalized)) return "spectrum";
  if (/shear|skew|coordinate|matrix|transform|tensor/.test(normalized)) {
    return "shear";
  }
  return "default";
}

export function buildThumbnailManimScript({
  titles,
  topic,
  designSeed = topic,
}: {
  titles: VideoTitleSet;
  topic: string;
  designSeed?: string;
}): string {
  const videoSeed = stableHash(`${designSeed}\0${topic}`);
  const designs = titles.candidates.map((title, index) => {
    const concept = titles.thumbnailConcepts?.[index];
    const subject = `${concept?.visualConcept ?? ""} ${title} ${topic}`;
    const palette = PALETTES[(videoSeed + index) % PALETTES.length]!;
    return {
      accent: palette[0],
      secondary: palette[1],
      tertiary: palette[2],
      detail: detailFor(subject),
      label: concept?.text.trim() ?? "",
      notation: concept?.mathNotation?.trim() ?? "",
      plotExpression: numpyPlotExpression(concept?.plotExpression),
      plotXRange: plotRange(concept?.plotXRange),
      title,
      variant: stableHash(`${videoSeed}\0${subject}\0${index}`) % 6,
      visualType: concept?.visualType ?? inferVisualType(subject),
    };
  });

  return `from manim import *
import numpy as np

config.background_color = "#050505"

${designs
  .map(({ plotExpression }, index) =>
    plotExpression
      ? `def source_plot_${index}(x):\n    return ${plotExpression}`
      : "",
  )
  .filter(Boolean)
  .join("\n\n")}


def glow_dot(point, color, radius=0.12):
    glow = VGroup(*[
        Circle(radius=radius * scale, stroke_width=0, fill_color=color, fill_opacity=opacity).move_to(point)
        for scale, opacity in [(4.4, 0.035), (3.0, 0.07), (1.9, 0.13)]
    ])
    return VGroup(glow, Dot(point, radius=radius, color=color))


def coordinate_plane(color, opacity=0.20):
    return NumberPlane(
        x_range=[-7, 7, 1], y_range=[-4, 4, 1],
        background_line_style={"stroke_color": color, "stroke_width": 1.0, "stroke_opacity": opacity},
        axis_config={"stroke_color": color, "stroke_width": 1.5, "stroke_opacity": min(0.50, opacity * 2)},
    )


def geometry_motif(detail, accent, secondary, tertiary, variant):
    if detail == "sphere":
        shell = Circle(radius=2.45, color=accent, stroke_width=4, fill_color=accent, fill_opacity=0.08)
        latitudes = VGroup(*[
            Ellipse(width=4.70, height=max(0.12, 4.15 * np.cos(angle)), color=accent, stroke_width=1.5, stroke_opacity=0.55)
            for angle in np.linspace(-1.25, 1.25, 10)
        ])
        longitudes = VGroup(*[
            Ellipse(width=max(0.16, 4.60 * np.cos(angle)), height=4.75, color=accent, stroke_width=1.35, stroke_opacity=0.50).rotate(variant * 0.025)
            for angle in np.linspace(-1.28, 1.28, 11)
        ])
        markers = VGroup(glow_dot([-1.45, 0.82, 0], secondary, 0.13), glow_dot([1.34, -0.66, 0], tertiary, 0.13))
        return VGroup(shell, latitudes, longitudes, markers)
    if detail == "circles":
        left = Circle(radius=2.10, color=accent, stroke_width=7).shift(LEFT * 1.25)
        right = Circle(radius=2.10, color=secondary, stroke_width=7).shift(RIGHT * 1.25)
        top = np.array([0.0, 1.68, 0.0])
        bottom = np.array([0.0, -1.68, 0.0])
        triangle = Polygon(top, bottom, left.get_left(), color=tertiary, stroke_width=5, fill_color=tertiary, fill_opacity=0.08)
        return VGroup(left, right, triangle, glow_dot(top, WHITE, 0.10), glow_dot(bottom, WHITE, 0.10))
    if detail == "triangle":
        triangle = Polygon([-2.8, -1.9, 0], [2.8, -1.9, 0], [0.55, 2.25, 0], color=accent, stroke_width=7)
        altitude = DashedLine([0.55, 2.25, 0], [0.55, -1.9, 0], color=secondary, stroke_width=4)
        arc = Arc(radius=0.70, start_angle=PI, angle=-1.08, arc_center=[0.55, -1.9, 0], color=tertiary, stroke_width=5)
        return VGroup(triangle, altitude, arc, glow_dot([0.55, -1.9, 0], secondary, 0.10))
    front = Square(side_length=3.35, color=accent, stroke_width=7).shift(LEFT * 0.38 + DOWN * 0.28)
    back = front.copy().shift(RIGHT * 1.22 + UP * 0.88).set_color(secondary).set_stroke(width=4.5, opacity=0.9)
    joins = VGroup(*[Line(front.get_vertices()[i], back.get_vertices()[i], color=tertiary, stroke_width=3) for i in range(4)])
    return VGroup(back, joins, front).rotate((variant - 2.5) * 0.035)


def visual_motif(kind, detail, accent, secondary, tertiary, variant, plot_function=None, plot_x_range=(-5, 5)):
    if kind == "function_plot":
        if plot_function is not None:
            x_min, x_max = plot_x_range
            sample_x = np.linspace(x_min, x_max, 401)
            with np.errstate(all="ignore"):
                sample_y = np.asarray([plot_function(float(x)) for x in sample_x], dtype=float)
            finite_y = sample_y[np.isfinite(sample_y)]
            if len(finite_y) >= 2:
                y_min, y_max = np.percentile(finite_y, [2, 98])
                if abs(y_max - y_min) < 1e-6:
                    y_min, y_max = y_min - 1.0, y_max + 1.0
                margin = (y_max - y_min) * 0.16
                y_min, y_max = float(y_min - margin), float(y_max + margin)
                axes = Axes(x_range=[x_min, x_max, (x_max - x_min) / 6], y_range=[y_min, y_max, (y_max - y_min) / 5], x_length=12.2, y_length=5.8, tips=False, axis_config={"stroke_color": "#A7ADB5", "stroke_width": 1.5, "stroke_opacity": 0.65})
                curve = axes.plot(plot_function, x_range=[x_min, x_max], color=accent, stroke_width=7, use_smoothing=False)
                return VGroup(axes, curve)
        axes = Axes(x_range=[-5.8, 5.8, 1], y_range=[-2.8, 3.2, 1], x_length=12.2, y_length=5.8, tips=False, axis_config={"stroke_color": "#A7ADB5", "stroke_width": 1.5, "stroke_opacity": 0.65})
        if detail == "spectrum":
            curve = axes.plot(lambda x: 0.18 + 0.18 * np.sin(2.2 * x) + sum(2.1 / (1 + 34 * (x - center) ** 2) for center in [-2.7, 0.7, 2.25, 3.65]), x_range=[-5.6, 5.6], color=accent, stroke_width=6)
            ghost = axes.plot(lambda x: 0.12 + sum(1.45 / (1 + 42 * (x - center) ** 2) for center in [-2.2, 1.1, 2.65]), x_range=[-5.6, 5.6], color=tertiary, stroke_width=3, stroke_opacity=0.70)
            return VGroup(axes, ghost, curve)
        curve = axes.plot(lambda x: 0.75 * np.sin(1.18 * x + variant * 0.22) + 0.055 * x ** 2 - 0.30, x_range=[-5.6, 5.6], color=accent, stroke_width=7)
        tangent_x = -0.8 + variant * 0.28
        tangent_y = 0.75 * np.sin(1.18 * tangent_x + variant * 0.22) + 0.055 * tangent_x ** 2 - 0.30
        slope = 0.885 * np.cos(1.18 * tangent_x + variant * 0.22) + 0.11 * tangent_x
        tangent = axes.plot(lambda x: tangent_y + slope * (x - tangent_x), x_range=[tangent_x - 1.65, tangent_x + 1.65], color=secondary, stroke_width=5)
        point = glow_dot(axes.c2p(tangent_x, tangent_y), secondary, 0.13)
        return VGroup(axes, curve, tangent, point)
    if kind == "surface_3d":
        axes = ThreeDAxes(x_range=[-3.2, 3.2, 1], y_range=[-3.2, 3.2, 1], z_range=[-1.8, 1.8, 0.5], x_length=6.4, y_length=6.4, z_length=3.6, axis_config={"stroke_color": "#A7ADB5", "stroke_width": 1.2, "stroke_opacity": 0.55})
        surface = Surface(lambda u, v: axes.c2p(u, v, 0.72 * np.sin(u + variant * 0.10) * np.cos(v)), u_range=[-3, 3], v_range=[-3, 3], resolution=(28, 28), fill_color=accent, fill_opacity=0.68, stroke_color=secondary, stroke_width=0.65, stroke_opacity=0.55, checkerboard_colors=[accent, accent])
        return Group(axes, surface)
    if kind == "solid_3d":
        sphere = Sphere(radius=2.15, resolution=(24, 48), checkerboard_colors=[accent, accent], fill_opacity=0.62, stroke_color=secondary, stroke_width=0.55, stroke_opacity=0.50)
        equator = Circle(radius=2.17, color=tertiary, stroke_width=4).rotate(PI / 2, axis=RIGHT)
        axis = Arrow3D(start=np.array([0.0, 0.0, -2.8]), end=np.array([0.0, 0.0, 2.8]), color=secondary, thickness=0.025)
        return Group(sphere, equator, axis)
    if kind == "complex_plane":
        plane = coordinate_plane(accent, 0.24)
        circle = Circle(radius=2.55, color=secondary, stroke_width=6)
        theta = 0.72 + variant * 0.10
        endpoint = [2.55 * np.cos(theta), 2.55 * np.sin(theta), 0]
        radius = Arrow(ORIGIN, endpoint, buff=0, color=accent, stroke_width=7, max_tip_length_to_length_ratio=0.11)
        arc = Arc(radius=0.75, start_angle=0, angle=theta, color=tertiary, stroke_width=5)
        trail = VGroup(*[Arrow(ORIGIN, [2.55 * np.cos(a), 2.55 * np.sin(a), 0], buff=0, color=WHITE, stroke_width=2.2, stroke_opacity=0.18 + i * 0.08, max_tip_length_to_length_ratio=0.10) for i, a in enumerate(np.linspace(0.16, theta, 6))])
        return VGroup(plane, circle, trail, radius, arc, glow_dot(endpoint, secondary, 0.13))
    if kind == "geometry":
        return geometry_motif(detail, accent, secondary, tertiary, variant)
    if kind == "transformation":
        left_grid = coordinate_plane(accent, 0.30).scale(0.43).shift(LEFT * 3.75)
        right_grid = coordinate_plane(secondary, 0.30).scale(0.43).apply_matrix([[1.0, 0.52 + variant * 0.035], [0.12, 1.0]]).shift(RIGHT * 3.55)
        vector_left = Arrow(LEFT * 3.75, LEFT * 2.20 + UP * 1.08, buff=0, color=tertiary, stroke_width=7, max_tip_length_to_length_ratio=0.13)
        vector_right = Arrow(RIGHT * 3.55, RIGHT * 5.25 + UP * 1.30, buff=0, color=tertiary, stroke_width=7, max_tip_length_to_length_ratio=0.13)
        bridge = Arrow(LEFT * 0.72, RIGHT * 0.72, buff=0, color=WHITE, stroke_width=7, max_tip_length_to_length_ratio=0.18)
        return VGroup(left_grid, right_grid, vector_left, vector_right, bridge)
    if kind == "vector_field":
        arrows = VGroup()
        for x in np.linspace(-5.5, 5.5, 9):
            for y in np.linspace(-2.7, 2.7, 5):
                direction = np.array([-y, x * 0.55, 0.0])
                norm = max(0.001, np.linalg.norm(direction))
                direction = direction / norm * 0.58
                color = accent if x <= 0 else secondary
                start = np.array([x, y, 0.0])
                arrows.add(Arrow(start, start + direction, buff=0, color=color, stroke_width=3.2, stroke_opacity=0.82, max_tip_length_to_length_ratio=0.24))
        path = Arc(radius=2.65, start_angle=0.18, angle=1.55 * PI, color=tertiary, stroke_width=6)
        return VGroup(arrows, path)
    if kind == "wave":
        axes = Axes(x_range=[-6, 6, 1], y_range=[-2.5, 2.5, 1], x_length=12.4, y_length=5.6, tips=False, axis_config={"stroke_color": "#A7ADB5", "stroke_width": 1.2, "stroke_opacity": 0.45})
        waves = VGroup(*[
            axes.plot(lambda x, phase=phase, frequency=frequency, amplitude=amplitude: amplitude * np.sin(frequency * x + phase), x_range=[-5.8, 5.8], color=color, stroke_width=width, stroke_opacity=opacity)
            for phase, frequency, amplitude, color, width, opacity in [(variant * 0.2, 1.1, 1.25, accent, 7, 1.0), (1.0, 2.2, 0.72, secondary, 4, 0.72), (2.1, 3.4, 0.42, tertiary, 3, 0.62)]
        ])
        return VGroup(axes, waves)
    if kind == "orbit":
        star = glow_dot(ORIGIN, secondary, 0.36)
        orbits = VGroup(*[Ellipse(width=width, height=height, color=color, stroke_width=3.5, stroke_opacity=0.72).rotate(angle) for width, height, color, angle in [(10.8, 3.1, accent, 0.08), (8.0, 4.8, tertiary, -0.20), (5.2, 2.4, secondary, 0.34)]])
        bodies = VGroup(glow_dot([5.0, 0.52, 0], accent, 0.15), glow_dot([-3.45, 1.58, 0], tertiary, 0.12), glow_dot([1.75, 1.38, 0], secondary, 0.10))
        return VGroup(orbits, star, bodies)
    if kind == "probability":
        axes = Axes(x_range=[-5.8, 5.8, 1], y_range=[0, 1.25, 0.25], x_length=12.2, y_length=5.2, tips=False, axis_config={"stroke_color": "#A7ADB5", "stroke_width": 1.4, "stroke_opacity": 0.52})
        curve = axes.plot(lambda x: np.exp(-0.5 * (x - 0.35) ** 2), x_range=[-5.6, 5.6], color=accent, stroke_width=7)
        area = axes.get_area(curve, x_range=[-0.9, 1.75], color=secondary, opacity=0.36)
        marker = DashedLine(axes.c2p(0.35, 0), axes.c2p(0.35, 1), color=tertiary, stroke_width=4)
        return VGroup(axes, area, curve, marker)
    if kind == "network":
        points = [[-5.1, 1.8, 0], [-5.2, -1.6, 0], [-2.3, 2.4, 0], [-2.0, 0.0, 0], [-2.5, -2.3, 0], [0.7, 1.8, 0], [0.8, -1.5, 0], [3.6, 2.1, 0], [3.8, -0.2, 0], [5.4, -1.8, 0]]
        links = [(0, 2), (0, 3), (1, 3), (1, 4), (2, 5), (3, 5), (3, 6), (4, 6), (5, 7), (5, 8), (6, 8), (6, 9)]
        edges = VGroup(*[Line(points[a], points[b], color="#A7ADB5", stroke_width=2.2, stroke_opacity=0.42) for a, b in links])
        nodes = VGroup(*[glow_dot(point, [accent, secondary, tertiary][i % 3], 0.14 + 0.025 * (i % 2)) for i, point in enumerate(points)])
        return VGroup(edges, nodes)
    if kind == "atom":
        nucleus = VGroup(glow_dot([-0.23, 0.05, 0], accent, 0.30), glow_dot([0.30, -0.12, 0], secondary, 0.28))
        shells = VGroup(*[Ellipse(width=8.4, height=2.55, color=[accent, secondary, tertiary][i], stroke_width=3.4, stroke_opacity=0.72).rotate(i * PI / 3 + variant * 0.035) for i in range(3)])
        electrons = VGroup(glow_dot([3.75, 0.52, 0], tertiary, 0.11), glow_dot([-2.10, 2.05, 0], accent, 0.11), glow_dot([-1.82, -1.95, 0], secondary, 0.11))
        return VGroup(shells, nucleus, electrons)
    return geometry_motif(detail, accent, secondary, tertiary, variant)


def add_caption(scene, label, notation, accent, secondary, mode):
    caption = None
    formula = None
    if label:
        caption = Text(label, font="EB Garamond", font_size=48, color=accent)
        if caption.width > 5.8:
            caption.scale_to_fit_width(5.8)
    if notation:
        formula = MathTex(notation, font_size=80, color=WHITE)
        if formula.width > 5.4:
            formula.scale_to_fit_width(5.4)
    if mode in [0, 3]:
        if caption is not None:
            caption.to_corner(UL, buff=0.46)
        if formula is not None:
            formula.to_corner(UR, buff=0.48)
    else:
        if formula is not None:
            formula.to_corner(UL, buff=0.48)
        if caption is not None:
            caption.to_corner(UR, buff=0.46)
    if caption is not None:
        scene.add_fixed_in_frame_mobjects(caption)
    if formula is not None:
        scene.add_fixed_in_frame_mobjects(formula)


def compose(scene, kind, detail, label, notation, accent, secondary, tertiary, variant, plot_function=None, plot_x_range=(-5, 5)):
    if kind in ["surface_3d", "solid_3d"]:
        scene.set_camera_orientation(phi=68 * DEGREES, theta=-45 * DEGREES, zoom=0.92)
    hero = visual_motif(kind, detail, accent, secondary, tertiary, variant, plot_function, plot_x_range)
    if hero.width > 13.1:
        hero.scale_to_fit_width(13.1)
    if hero.height > 6.75:
        hero.scale_to_fit_height(6.75)
    mode = variant % 4
    if (label or notation) and kind not in ["function_plot", "wave", "probability", "transformation"]:
        if mode in [0, 3]:
            hero.shift(DOWN * 0.20 + RIGHT * 0.25)
        else:
            hero.shift(DOWN * 0.20 + LEFT * 0.25)
    scene.add(hero)
    add_caption(scene, label, notation, accent, secondary, mode)


class ${THUMBNAIL_CLASS_NAMES[0]}(ThreeDScene):
    def construct(self):
        paired_title = ${JSON.stringify(designs[0]!.title)}
        compose(self, ${JSON.stringify(designs[0]!.visualType)}, ${JSON.stringify(designs[0]!.detail)}, ${JSON.stringify(designs[0]!.label)}, ${JSON.stringify(designs[0]!.notation)}, ${JSON.stringify(designs[0]!.accent)}, ${JSON.stringify(designs[0]!.secondary)}, ${JSON.stringify(designs[0]!.tertiary)}, ${designs[0]!.variant}, ${designs[0]!.plotExpression ? "source_plot_0" : "None"}, ${JSON.stringify(designs[0]!.plotXRange)})


class ${THUMBNAIL_CLASS_NAMES[1]}(ThreeDScene):
    def construct(self):
        paired_title = ${JSON.stringify(designs[1]!.title)}
        compose(self, ${JSON.stringify(designs[1]!.visualType)}, ${JSON.stringify(designs[1]!.detail)}, ${JSON.stringify(designs[1]!.label)}, ${JSON.stringify(designs[1]!.notation)}, ${JSON.stringify(designs[1]!.accent)}, ${JSON.stringify(designs[1]!.secondary)}, ${JSON.stringify(designs[1]!.tertiary)}, ${designs[1]!.variant}, ${designs[1]!.plotExpression ? "source_plot_1" : "None"}, ${JSON.stringify(designs[1]!.plotXRange)})


class ${THUMBNAIL_CLASS_NAMES[2]}(ThreeDScene):
    def construct(self):
        paired_title = ${JSON.stringify(designs[2]!.title)}
        compose(self, ${JSON.stringify(designs[2]!.visualType)}, ${JSON.stringify(designs[2]!.detail)}, ${JSON.stringify(designs[2]!.label)}, ${JSON.stringify(designs[2]!.notation)}, ${JSON.stringify(designs[2]!.accent)}, ${JSON.stringify(designs[2]!.secondary)}, ${JSON.stringify(designs[2]!.tertiary)}, ${designs[2]!.variant}, ${designs[2]!.plotExpression ? "source_plot_2" : "None"}, ${JSON.stringify(designs[2]!.plotXRange)})
`;
}

export function sanitizeGeneratedThumbnailScript(script: string): string {
  return script
    .replace(/```(?:python)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

export function thumbnailManimScriptIssues(
  script: string,
  titles?: VideoTitleSet,
): string[] {
  const issues: string[] = [];
  if (!/config\.background_color\s*=\s*["']#050505["']/.test(script)) {
    issues.push("thumbnail script must use the near-black house background");
  }
  if (/['"]EDUVIDS['"]|brand_mark|logo/i.test(script)) {
    issues.push("thumbnail script contains branding");
  }
  if (
    /\b(?:open|exec|eval|compile|__import__|input)\s*\(|\b(?:os|sys|subprocess|socket|requests|pathlib|shutil)\b/.test(
      script,
    )
  ) {
    issues.push("thumbnail script contains disallowed operations");
  }

  for (const line of script.split("\n")) {
    const trimmed = line.trim();
    if (!/^(?:from\s+\S+\s+import|import\s+)/.test(trimmed)) continue;
    if (
      !/^from\s+(?:manim|numpy)(?:\.\S+)?\s+import\s+/.test(trimmed) &&
      !/^import\s+numpy\s+as\s+np$/.test(trimmed)
    ) {
      issues.push(`thumbnail script contains disallowed import: ${trimmed}`);
    }
  }

  const foundClasses = [
    ...script.matchAll(
      /^class\s+(\w+)\s*\(\s*(?:Scene|ThreeDScene)\s*\)\s*:/gm,
    ),
  ].map((match) => match[1]);
  if (
    foundClasses.length !== THUMBNAIL_CLASS_NAMES.length ||
    foundClasses.some(
      (className, index) => className !== THUMBNAIL_CLASS_NAMES[index],
    )
  ) {
    issues.push(
      `thumbnail script must define only ${THUMBNAIL_CLASS_NAMES.join(", ")} in order`,
    );
  }

  if (titles) {
    for (const [index, className] of THUMBNAIL_CLASS_NAMES.entries()) {
      const classStart = script.indexOf(`class ${className}(`);
      const nextClass = THUMBNAIL_CLASS_NAMES[index + 1];
      const classEnd = nextClass
        ? script.indexOf(`class ${nextClass}(`, classStart + 1)
        : script.length;
      const body =
        classStart >= 0
          ? script.slice(classStart, classEnd >= 0 ? classEnd : script.length)
          : "";
      if (
        !body.includes("paired_title") ||
        (!body.includes(JSON.stringify(titles.candidates[index])) &&
          !body.includes(titles.candidates[index]))
      ) {
        issues.push(`${className} is not paired to its exact title`);
      }
      const concept = titles.thumbnailConcepts?.[index];
      const plotExpression = sanitizeThumbnailPlotExpression(
        concept?.plotExpression,
      );
      if (concept?.visualType === "function_plot" && plotExpression) {
        const normalizedBody = body.replace(/\s+/g, "").replaceAll("np.", "");
        if (!normalizedBody.includes(plotExpression)) {
          issues.push(`${className} does not use its exact plot expression`);
        }
      }
      if (!/\bself\.add(?:_fixed_in_frame_mobjects)?\s*\(/.test(body)) {
        issues.push(`${className} does not add a final composition`);
      }
    }
  }

  return [...new Set(issues)];
}
