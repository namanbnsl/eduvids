import {
  sanitizeThumbnailPlotExpression,
  type ThumbnailVisualType,
  type VideoTitleSet,
} from "./youtube-metadata";
import { MANIM_HOUSE_STYLE_PREAMBLE } from "./visual-style";

export const THUMBNAIL_CLASS_NAMES = [
  "EduvidsThumbnailA",
  "EduvidsThumbnailB",
  "EduvidsThumbnailC",
] as const;

// Accent pairs drawn from the house palette: a hero color plus a contrasting
// highlight. RED is kept back for the single anomaly in every composition.
const ACCENT_PAIRS = [
  ["BLUE", "YELLOW"],
  ["YELLOW", "BLUE"],
  ["TEAL", "ORANGE"],
  ["BLUE", "PINK"],
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
  if (/zoom|magnif|close up|closer|locally straight/.test(normalized)) {
    return "zoom";
  }
  if (/bell|normal distribution|gaussian|tail/.test(normalized)) return "bell";
  if (/population|grid of|people|patients|test|sample|bayes/.test(normalized)) {
    return "population";
  }
  if (/sphere|globe|ball|topolog/.test(normalized)) return "sphere";
  if (/circle|intersect|euclid|venn/.test(normalized)) return "circles";
  if (/triangle|angle|polygon|pythag/.test(normalized)) return "triangle";
  if (/spike|spectrum|frequency|laplace/.test(normalized)) return "spectrum";
  if (/square|area|region|split|partition/.test(normalized)) return "square";
  if (/shear|skew|coordinate|matrix|transform|tensor/.test(normalized)) {
    return "shear";
  }
  return "default";
}

// Static Python shared by every fallback thumbnail. String.raw keeps the
// Python source verbatim; it must not contain backticks or "${".
const THUMBNAIL_LIBRARY_PY = String.raw`
def anomaly(point, color=RED, radius=0.17):
    halo = Circle(radius=radius * 2.4, stroke_width=0, fill_color=color, fill_opacity=0.16).move_to(point)
    ring = Circle(radius=radius * 1.55, stroke_width=3, color=color, stroke_opacity=0.55).move_to(point)
    return VGroup(halo, ring, Dot(point, radius=radius, color=color))


def muted_axes(x_range, y_range, x_length, y_length):
    return Axes(
        x_range=x_range, y_range=y_range, x_length=x_length, y_length=y_length, tips=False,
        axis_config={"color": MUTED, "stroke_width": 3, "stroke_opacity": 0.75, "include_ticks": False},
    )


def sample_plot(plot_function, x_min, x_max):
    xs = np.linspace(x_min, x_max, 401)
    with np.errstate(all="ignore"):
        ys = np.asarray([plot_function(float(x)) for x in xs], dtype=float)
    finite = np.isfinite(ys)
    return xs, ys, finite


def function_motif(a1, a2, variant, plot_function=None, plot_x_range=(-5, 5)):
    if plot_function is not None:
        x_min, x_max = plot_x_range
        xs, ys, finite = sample_plot(plot_function, x_min, x_max)
        if finite.sum() >= 20:
            y_min, y_max = np.percentile(ys[finite], [2, 98])
            if abs(y_max - y_min) < 1e-6:
                y_min, y_max = y_min - 1.0, y_max + 1.0
            margin = (y_max - y_min) * 0.14
            y_min, y_max = float(y_min - margin), float(y_max + margin)
            axes = muted_axes([x_min, x_max, (x_max - x_min) / 6], [y_min, y_max, (y_max - y_min) / 5], 10.5, 6.2)
            curve = axes.plot(plot_function, x_range=[x_min, x_max], color=a1, stroke_width=12, use_smoothing=False, discontinuities=None)
            candidates = [x for x, y, ok in zip(xs, ys, finite) if ok and y_min < y < y_max]
            focus_x = candidates[int(len(candidates) * (0.62 if variant % 2 == 0 else 0.38))] if candidates else (x_min + x_max) / 2
            focus_y = float(plot_function(focus_x))
            h = (x_max - x_min) * 1e-4
            slope = (plot_function(focus_x + h) - plot_function(focus_x - h)) / (2 * h)
            span = (x_max - x_min) * 0.28
            if np.isfinite(slope):
                tangent = axes.plot(lambda x: focus_y + slope * (x - focus_x), x_range=[focus_x - span, focus_x + span], color=a2, stroke_width=8)
            else:
                tangent = VGroup()
            point = axes.c2p(focus_x, focus_y)
            return VGroup(axes, curve, tangent, anomaly(point)), point
    axes = muted_axes([-0.5, 4.2, 1], [-0.3, 5.2, 1], 9.0, 6.6)
    g = lambda x: 0.32 * x ** 2
    curve = axes.plot(g, x_range=[-0.4, 4.0], color=a1, stroke_width=12)
    x0 = 2.0
    ghosts = VGroup(*[
        axes.plot(lambda x, m=(g(x1) - g(x0)) / (x1 - x0): g(x0) + m * (x - x0), x_range=[0.3, 4.1], color=a2, stroke_width=4, stroke_opacity=0.18 + 0.12 * i)
        for i, x1 in enumerate([3.9, 3.3, 2.8, 2.4])
    ])
    tangent = axes.plot(lambda x: g(x0) + 2 * 0.32 * x0 * (x - x0), x_range=[0.0, 4.15], color=a2, stroke_width=9)
    point = axes.c2p(x0, g(x0))
    return VGroup(axes, ghosts, curve, tangent, anomaly(point)), point


def wave_motif(a1, a2, variant):
    axes = muted_axes([-6, 6, 1], [-2.6, 2.6, 1], 12.0, 6.0)
    parts = [(1.0, 1.0, 0.2 + variant * 0.1), (0.55, 2.0, 0.9), (0.35, 3.0, 1.7)]
    total = lambda x: sum(a * np.sin(f * x + p) for a, f, p in parts)
    components = VGroup(*[
        axes.plot(lambda x, a=a, f=f, p=p: a * np.sin(f * x + p), x_range=[-5.8, 5.8], color=color, stroke_width=4, stroke_opacity=0.55)
        for (a, f, p), color in zip(parts, [a2, TEAL, PURPLE])
    ])
    composite = axes.plot(total, x_range=[-5.8, 5.8], color=a1, stroke_width=11)
    xs = np.linspace(-5.6, 5.6, 600)
    peak = xs[int(np.argmax([total(x) for x in xs]))]
    point = axes.c2p(peak, total(peak))
    return VGroup(axes.x_axis, components, composite, anomaly(point)), point


def complex_motif(a1, a2, variant):
    plane = NumberPlane(
        x_range=[-4, 4, 1], y_range=[-4, 4, 1], x_length=7.2, y_length=7.2,
        background_line_style={"stroke_color": FAINT, "stroke_width": 2, "stroke_opacity": 0.9},
        axis_config={"stroke_color": MUTED, "stroke_width": 3},
    )
    radius = 2.7
    circle = Circle(radius=radius, color=a2, stroke_width=8)
    theta = 0.85 + variant * 0.12
    tip = np.array([radius * np.cos(theta), radius * np.sin(theta), 0.0])
    trail = VGroup(*[
        Dot([radius * np.cos(a), radius * np.sin(a), 0.0], radius=0.07, color=a1).set_opacity(0.15 + 0.12 * i)
        for i, a in enumerate(np.linspace(theta - 1.4, theta - 0.25, 6))
    ])
    vector = Arrow(ORIGIN, tip, buff=0, color=a1, stroke_width=11, max_tip_length_to_length_ratio=0.12)
    arc = Arc(radius=0.8, start_angle=0, angle=theta, color=a2, stroke_width=6)
    return VGroup(plane, circle, trail, arc, vector, anomaly(tip)), tip


def probability_motif(detail, a1, a2, variant):
    if detail == "population":
        dots = VGroup()
        sick = {(1, 2), (4, 7), (7, 3), (8, 8), (2, 5), (6, 1), (3, 9), (9, 5), (0, 8)}
        positive = (5, 4)
        for row in range(10):
            for col in range(10):
                point = np.array([(col - 4.5) * 0.62, (4.5 - row) * 0.62, 0.0])
                if (row, col) == positive:
                    dots.add(anomaly(point, RED, 0.17))
                elif (row, col) in sick:
                    dots.add(Dot(point, radius=0.16, color=a1))
                else:
                    dots.add(Dot(point, radius=0.13, color=MUTED).set_opacity(0.55))
        point = np.array([(4 - 4.5) * 0.62, (4.5 - 5) * 0.62, 0.0])
        return dots, point
    axes = muted_axes([-4, 4, 1], [0, 1.15, 0.25], 11.0, 6.0)
    bell = lambda x: np.exp(-0.5 * x ** 2)
    curve = axes.plot(bell, x_range=[-3.9, 3.9], color=a1, stroke_width=11)
    area = axes.get_area(curve, x_range=[1.6, 3.9], color=a2, opacity=0.45)
    point = axes.c2p(1.6, bell(1.6))
    marker = DashedLine(axes.c2p(1.6, 0), point, color=a2, stroke_width=5)
    return VGroup(axes.x_axis, area, curve, marker, anomaly(point)), point


def geometry_motif(detail, a1, a2, variant):
    if detail in ["population", "bell"]:
        return probability_motif(detail, a1, a2, variant)
    if detail == "zoom":
        g = lambda x: 0.35 * x ** 2 - 1.6
        curve = FunctionGraph(g, x_range=[-3.2, 2.6], color=a1, stroke_width=10).shift(LEFT * 2.6)
        focus = np.array([0.9 - 2.6, g(0.9), 0.0])
        lens = Circle(radius=0.55, color=INK, stroke_width=4).move_to(focus)
        inset_center = np.array([3.3, 0.6, 0.0])
        inset = Circle(radius=2.4, color=INK, stroke_width=5).move_to(inset_center)
        slope = 0.7 * 0.9
        direction = np.array([1.0, slope, 0.0]) / np.sqrt(1 + slope ** 2)
        segment = Line(inset_center - direction * 2.2, inset_center + direction * 2.2, color=a1, stroke_width=12)
        links = VGroup(
            Line(lens.point_at_angle(PI / 2), inset.point_at_angle(PI * 0.62), color=MUTED, stroke_width=3),
            Line(lens.point_at_angle(-PI / 2), inset.point_at_angle(-PI * 0.62), color=MUTED, stroke_width=3),
        )
        return VGroup(curve, links, lens, inset, segment, anomaly(inset_center)), inset_center
    if detail == "square":
        side = 5.6
        split = 0.3 + (variant % 3) * 0.05
        left = Rectangle(width=side * split, height=side, stroke_width=0, fill_color=a1, fill_opacity=0.32)
        right = Rectangle(width=side * (1 - split), height=side, stroke_width=0, fill_color=MUTED, fill_opacity=0.18)
        VGroup(left, right).arrange(RIGHT, buff=0)
        hit_left = Rectangle(width=left.width, height=side * 0.9, stroke_width=0, fill_color=a1, fill_opacity=0.55).align_to(left, DOWN + LEFT)
        hit_right = Rectangle(width=right.width, height=side * 0.09, stroke_width=0, fill_color=RED, fill_opacity=0.8).align_to(right, DOWN + RIGHT)
        frame = Square(side_length=side, color=INK, stroke_width=5)
        divider = Line(left.get_corner(UR), left.get_corner(DR), color=INK, stroke_width=4)
        point = hit_right.get_center()
        return VGroup(left, right, hit_left, hit_right, frame, divider, anomaly(point, RED, 0.12)), point
    if detail == "sphere":
        shell = Circle(radius=2.9, color=a1, stroke_width=8, fill_color=a1, fill_opacity=0.08)
        latitudes = VGroup(*[
            Ellipse(width=5.7, height=max(0.12, 5.2 * np.cos(angle)), color=a1, stroke_width=2.5, stroke_opacity=0.5)
            for angle in np.linspace(-1.2, 1.2, 7)
        ])
        meridians = VGroup(*[
            Ellipse(width=max(0.16, 5.6 * np.cos(angle)), height=5.8, color=a1, stroke_width=2.5, stroke_opacity=0.45)
            for angle in np.linspace(-1.2, 1.2, 7)
        ])
        point = np.array([1.2, 1.1, 0.0])
        return VGroup(shell, latitudes, meridians, anomaly(point, a2)), point
    if detail == "circles":
        left = Circle(radius=2.4, color=a1, stroke_width=10, fill_color=a1, fill_opacity=0.10).shift(LEFT * 1.35)
        right = Circle(radius=2.4, color=a2, stroke_width=10, fill_color=a2, fill_opacity=0.10).shift(RIGHT * 1.35)
        offset = np.sqrt(2.4 ** 2 - 1.35 ** 2)
        point = np.array([0.0, offset, 0.0])
        return VGroup(left, right, anomaly(point), Dot([0.0, -offset, 0.0], radius=0.12, color=INK)), point
    if detail == "triangle":
        a, b, c = np.array([-3.2, -2.2, 0.0]), np.array([3.2, -2.2, 0.0]), np.array([0.7, 2.6, 0.0])
        triangle = Polygon(a, b, c, color=a1, stroke_width=10, fill_color=a1, fill_opacity=0.12)
        foot = np.array([0.7, -2.2, 0.0])
        altitude = DashedLine(c, foot, color=a2, stroke_width=6)
        corner = VGroup(Line(foot + LEFT * 0.35, foot + LEFT * 0.35 + UP * 0.35), Line(foot + LEFT * 0.35 + UP * 0.35, foot + UP * 0.35)).set_stroke(MUTED, 3)
        return VGroup(triangle, altitude, corner, anomaly(c)), c
    if detail == "spectrum":
        axes = muted_axes([0, 10, 1], [0, 1.2, 0.2], 11.0, 5.8)
        bars = VGroup(*[
            Line(axes.c2p(x, 0), axes.c2p(x, h), color=a1 if h < 1 else RED, stroke_width=14)
            for x, h in [(1.5, 0.45), (3.0, 1.0), (4.5, 0.62), (7.0, 0.3)]
        ])
        point = axes.c2p(3.0, 1.0)
        return VGroup(axes.x_axis, bars, anomaly(point)), point
    grid = NumberPlane(
        x_range=[-4, 4, 1], y_range=[-3, 3, 1], x_length=8, y_length=6,
        background_line_style={"stroke_color": FAINT, "stroke_width": 2, "stroke_opacity": 0.9},
        axis_config={"stroke_color": MUTED, "stroke_width": 2},
    )
    square = Square(side_length=2.0, color=a1, stroke_width=9, fill_color=a1, fill_opacity=0.18).move_to([1.0, 1.0, 0.0])
    diagonal = Line(square.get_corner(DL), square.get_corner(UR), color=a2, stroke_width=8)
    point = square.get_corner(UR)
    return VGroup(grid, square, diagonal, anomaly(point)), point


def transformation_motif(a1, a2, variant):
    def plane():
        return NumberPlane(
            x_range=[-3, 3, 1], y_range=[-3, 3, 1], x_length=4.6, y_length=4.6,
            background_line_style={"stroke_color": a1, "stroke_width": 2, "stroke_opacity": 0.45},
            axis_config={"stroke_color": MUTED, "stroke_width": 2},
        )
    before = plane().shift(LEFT * 3.4)
    after = plane().apply_matrix([[1.0, 0.6 + variant * 0.04], [0.15, 1.0]]).shift(RIGHT * 3.4)
    after.background_lines.set_stroke(a2, 2, 0.5)
    v_before = Arrow(LEFT * 3.4, LEFT * 3.4 + np.array([1.4, 1.1, 0.0]), buff=0, color=a1, stroke_width=10, max_tip_length_to_length_ratio=0.18)
    tip = RIGHT * 3.4 + np.array([1.4 + 0.66 * 1.1, 0.21 + 1.1, 0.0])
    v_after = Arrow(RIGHT * 3.4, tip, buff=0, color=a2, stroke_width=10, max_tip_length_to_length_ratio=0.15)
    bridge = Arrow(LEFT * 0.6, RIGHT * 0.6, buff=0, color=INK, stroke_width=8, max_tip_length_to_length_ratio=0.25)
    return VGroup(before, after, v_before, v_after, bridge, anomaly(tip, RED, 0.13)), tip


def vector_field_motif(a1, a2, variant):
    arrows = VGroup()
    for x in np.linspace(-5.4, 5.4, 10):
        for y in np.linspace(-2.8, 2.8, 6):
            direction = np.array([-y, x * 0.55, 0.0])
            norm = max(0.001, np.linalg.norm(direction))
            start = np.array([x, y, 0.0])
            arrows.add(Arrow(start, start + direction / norm * 0.55, buff=0, color=MUTED, stroke_width=3.5, stroke_opacity=0.7, max_tip_length_to_length_ratio=0.28))
    path = ParametricFunction(lambda t: np.array([2.6 * np.cos(t) * 1.3, 2.6 * np.sin(t) * 0.95, 0.0]), t_range=[0.2, 0.2 + 1.6 * PI], color=a1, stroke_width=11)
    end = path.get_end()
    return VGroup(arrows, path, anomaly(end, a2)), end


def orbit_motif(a1, a2, variant):
    star = VGroup(Circle(radius=0.9, stroke_width=0, fill_color=YELLOW, fill_opacity=0.12), Dot(ORIGIN, radius=0.42, color=YELLOW))
    path = Ellipse(width=10.6, height=4.4, color=a1, stroke_width=7).rotate(0.12)
    inner = Ellipse(width=6.2, height=2.8, color=MUTED, stroke_width=3, stroke_opacity=0.6).rotate(-0.25)
    planet = path.point_from_proportion(0.12 + variant * 0.03)
    return VGroup(inner, path, star, anomaly(planet, a2, 0.2)), planet


def network_motif(a1, a2, variant):
    layers = [3, 5, 5, 2]
    nodes = []
    for i, count in enumerate(layers):
        xs = -4.5 + i * 3.0
        nodes.append([np.array([xs, (j - (count - 1) / 2) * 1.35, 0.0]) for j in range(count)])
    edges = VGroup(*[
        Line(a, b, color=MUTED, stroke_width=2, stroke_opacity=0.45)
        for left, right in zip(nodes, nodes[1:]) for a in left for b in right
    ])
    route = [nodes[0][1], nodes[1][3], nodes[2][1], nodes[3][0]]
    lit = VGroup(*[Line(a, b, color=a1, stroke_width=8) for a, b in zip(route, route[1:])])
    dots = VGroup(*[Dot(p, radius=0.2, color=a1 if any(np.allclose(p, r) for r in route) else MUTED) for layer in nodes for p in layer])
    return VGroup(edges, lit, dots, anomaly(route[-1], a2, 0.22)), route[-1]


def atom_motif(a1, a2, variant):
    shells = VGroup(*[Ellipse(width=9.0, height=2.8, color=[a1, a2, TEAL][i], stroke_width=5, stroke_opacity=0.8).rotate(i * PI / 3 + variant * 0.04) for i in range(3)])
    nucleus = VGroup(Circle(radius=0.75, stroke_width=0, fill_color=a2, fill_opacity=0.15), Dot(ORIGIN, radius=0.42, color=a2))
    electron = shells[0].point_from_proportion(0.08)
    return VGroup(shells, nucleus, anomaly(electron)), electron


def surface_motif(a1, a2, variant):
    axes = ThreeDAxes(x_range=[-3, 3, 1], y_range=[-3, 3, 1], z_range=[-1.5, 1.5, 0.5], x_length=6.4, y_length=6.4, z_length=3.2, axis_config={"color": MUTED, "stroke_width": 2})
    f = lambda u, v: 0.85 * np.sin(u + variant * 0.1) * np.cos(v)
    surface = Surface(lambda u, v: axes.c2p(u, v, f(u, v)), u_range=[-3, 3], v_range=[-3, 3], resolution=(32, 32), fill_color=a1, fill_opacity=0.75, stroke_color=a1, stroke_width=0.5, stroke_opacity=0.4, checkerboard_colors=[a1, a1])
    peak = axes.c2p(PI / 2 - variant * 0.1, 0, 0.85)
    return Group(axes, surface, Dot3D(peak, radius=0.14, color=RED)), None


def solid_motif(a1, a2, variant):
    sphere = Sphere(radius=2.3, resolution=(28, 56), checkerboard_colors=[a1, a1], fill_opacity=0.7, stroke_color=a1, stroke_width=0.4, stroke_opacity=0.35)
    equator = Circle(radius=2.32, color=a2, stroke_width=6).rotate(PI / 2, axis=RIGHT)
    axis = Line3D(start=np.array([0.0, 0.0, -3.0]), end=np.array([0.0, 0.0, 3.0]), color=MUTED, thickness=0.02)
    return Group(sphere, equator, axis), None


def hero_motif(kind, detail, a1, a2, variant, plot_function=None, plot_x_range=(-5, 5)):
    if kind == "function_plot":
        if plot_function is None and detail not in ["default", "zoom"]:
            return geometry_motif(detail, a1, a2, variant)
        return function_motif(a1, a2, variant, plot_function, plot_x_range)
    if kind == "wave":
        if detail == "spectrum":
            return geometry_motif("spectrum", a1, a2, variant)
        return wave_motif(a1, a2, variant)
    if kind == "complex_plane":
        return complex_motif(a1, a2, variant)
    if kind == "probability":
        return probability_motif(detail, a1, a2, variant)
    if kind == "transformation":
        return transformation_motif(a1, a2, variant)
    if kind == "vector_field":
        return vector_field_motif(a1, a2, variant)
    if kind == "orbit":
        return orbit_motif(a1, a2, variant)
    if kind == "network":
        return network_motif(a1, a2, variant)
    if kind == "atom":
        return atom_motif(a1, a2, variant)
    if kind == "surface_3d":
        return surface_motif(a1, a2, variant)
    if kind == "solid_3d":
        return solid_motif(a1, a2, variant)
    return geometry_motif(detail, a1, a2, variant)


def headline(label, notation, accent):
    if label:
        words = label.split()
        if len(label) > 11 and len(words) > 1:
            cut = max(1, min(len(words) - 1, (len(words) + 1) // 2))
            lines = [" ".join(words[:cut]), " ".join(words[cut:])]
        else:
            lines = [label]
        rows = VGroup(*[Text(line, weight=BOLD, font_size=150, color=INK) for line in lines]).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        last = rows[-1]
        if label.endswith("?") and len(last) > 1:
            last[-1].set_color(accent)
            emphasis = VGroup()
        else:
            glyphs = len(lines[-1].split()[-1])
            word = last[-glyphs:] if glyphs < len(last) else last
            emphasis = Line(word.get_corner(DL) + DOWN * 0.18, word.get_corner(DR) + DOWN * 0.18, color=accent, stroke_width=12)
        block = VGroup(rows, emphasis)
    elif notation:
        block = VGroup(MathTex(notation, font_size=150, color=INK))
    else:
        return None
    if block.width > 5.3:
        block.scale_to_fit_width(5.3)
    if block.height > 3.6:
        block.scale_to_fit_height(3.6)
    return block


def compose(scene, kind, detail, label, notation, a1, a2, variant, plot_function=None, plot_x_range=(-5, 5)):
    is_3d = kind in ["surface_3d", "solid_3d"]
    text = headline(label, notation, RED if RED not in [a1, a2] else YELLOW)
    if is_3d:
        scene.set_camera_orientation(phi=66 * DEGREES, theta=-48 * DEGREES, zoom=0.95 if text is None else 0.8, frame_center=(LEFT * 2.6 if text is not None else ORIGIN))
    hero, focus = hero_motif(kind, detail, a1, a2, variant, plot_function, plot_x_range)
    if text is None:
        if not is_3d:
            origin, factor = hero.get_center(), min(1.0, 12.6 / max(hero.width, 0.01), 6.9 / max(hero.height, 0.01))
            hero.scale(factor).move_to(UP * 0.1)
            if focus is not None:
                focus = hero.get_center() + (np.array(focus) - origin) * factor
        scene.add(hero)
        if focus is not None and not is_3d:
            side = LEFT if focus[0] > 0 else RIGHT
            start = focus + side * 2.4 + UP * 1.7
            start[0] = min(6.2, max(-6.2, start[0]))
            start[1] = min(3.4, start[1])
            pointer = CurvedArrow(start, focus + side * 0.42 + UP * 0.3, angle=-0.6 if side[0] < 0 else 0.6, color=INK, stroke_width=7, tip_length=0.32)
            scene.add(pointer)
        return
    if not is_3d:
        hero.scale(min(1.0, 7.3 / max(hero.width, 0.01), 6.9 / max(hero.height, 0.01)))
        hero.move_to(RIGHT * 3.05 + UP * 0.15)
    text.move_to(LEFT * 3.8 + UP * 0.35)
    scene.add(hero)
    scene.add_fixed_in_frame_mobjects(text)
`;

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
    // The art-directed concept is the most specific signal; fall back to the
    // title and topic only when it names nothing recognizable.
    const conceptDetail = detailFor(concept?.visualConcept ?? "");
    const [accent, secondary] =
      ACCENT_PAIRS[(videoSeed + index) % ACCENT_PAIRS.length]!;
    return {
      accent,
      secondary,
      detail:
        conceptDetail === "default"
          ? detailFor(`${title} ${topic}`)
          : conceptDetail,
      label: concept?.text.trim() ?? "",
      notation: concept?.mathNotation?.trim() ?? "",
      plotExpression: numpyPlotExpression(concept?.plotExpression),
      plotXRange: plotRange(concept?.plotXRange),
      title,
      variant: stableHash(`${videoSeed}\0${subject}\0${index}`) % 6,
      visualType: concept?.visualType ?? inferVisualType(subject),
    };
  });

  const plotFunctions = designs
    .map(({ plotExpression }, index) =>
      plotExpression
        ? `def source_plot_${index}(x):\n    return ${plotExpression}`
        : "",
    )
    .filter(Boolean)
    .join("\n\n");

  const classes = designs
    .map(
      (design, index) => `class ${THUMBNAIL_CLASS_NAMES[index]}(ThreeDScene):
    def construct(self):
        paired_title = ${JSON.stringify(design.title)}
        compose(self, ${JSON.stringify(design.visualType)}, ${JSON.stringify(design.detail)}, ${JSON.stringify(design.label)}, ${JSON.stringify(design.notation)}, ${design.accent}, ${design.secondary}, ${design.variant}, ${design.plotExpression ? `source_plot_${index}` : "None"}, ${JSON.stringify(design.plotXRange)})
`,
    )
    .join("\n\n");

  return `from manim import *
import numpy as np

${MANIM_HOUSE_STYLE_PREAMBLE}
${plotFunctions}
${THUMBNAIL_LIBRARY_PY}

${classes}`;
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
      if (!concept?.text && index === 1 && /\bText\s*\(/.test(body)) {
        issues.push(
          `${className} is the visual-only variant and must not add Text`,
        );
      }
    }
  }

  return [...new Set(issues)];
}
