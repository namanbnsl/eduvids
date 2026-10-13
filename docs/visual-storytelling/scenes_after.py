"""After: the same narration, written to the new prompt's visual devices."""
from manim import *
from manim_voiceover import VoiceoverScene
from eduvids_style import *
from narration import ATOM, BAYES, SUN, CURRENT, EQUATION, SEARCH, PYTHAGORAS, DEEPTIME, PENDULUM


class AtomAfter(VoiceoverScene):
    def construct(self):
        title = header("How small is an atom?")
        grain = Square(side_length=2.4, color=PRIMARY, fill_opacity=0.9, stroke_width=0)
        place_in_content(grain, above=title, fill=0.42)
        bar = scale_bar(r"1\,\text{mm}", length=grain.width)
        with self.voiceover(text=ATOM[0]) as tracker:
            self.play(FadeIn(title), pop_in(grain), FadeIn(bar), run_time=max(0.6, tracker.duration * 0.5))
        lattice = crowd(2400, width=grain.width, height=grain.height, fill=0.62).move_to(grain)
        chlorine = lattice.subset([r * lattice.cols + c for r in range(lattice.rows) for c in range(lattice.cols)
                                   if (r + c) % 2 and r * lattice.cols + c < len(lattice)], color=GREEN)
        with self.voiceover(text=ATOM[1]) as tracker:
            self.play(FadeIn(lattice), FadeIn(chlorine), FadeOut(grain), run_time=max(0.5, tracker.duration * 0.2))
            one = lattice.item(lattice.nearest(lattice.get_center()), color=PRIMARY)
            self.add(one)
            self.play(zoom_to(self, one, fill=0.1), bar.relabel(r"1\,\text{nm}"), run_time=max(1, tracker.duration * 0.6))
        with self.voiceover(text=ATOM[2]) as tracker:
            self.play(spotlight(self, one), one.animate.set_color(ACCENT), run_time=max(0.4, tracker.duration * 0.3))
            self.play(zoom_to(self, one), bar.relabel(r"0.1\,\text{nm}"), run_time=max(1, tracker.duration * 0.5))
        sodium = atom(11, 12)
        place_in_content(sodium, above=title, fill=0.82)
        with self.voiceover(text=ATOM[3]) as tracker:
            self.play(FadeOut(lattice), FadeOut(chlorine), reveal_detail(one, sodium), run_time=max(0.8, tracker.duration * 0.35))
            self.play(sodium.orbit(0.4), run_time=max(1, tracker.duration * 0.5))
        # The nucleus, opened up and sorted: protons on one side, neutrons on the other.
        center = sodium.nucleus.get_center()
        protons = sodium.protons.copy().arrange_in_grid(3, 4, buff=0.1).scale(2.2).move_to(center + LEFT * 3.2)
        neutrons = sodium.neutrons.copy().arrange_in_grid(3, 4, buff=0.1).scale(2.2).move_to(center + RIGHT * 3.2)
        p_label = MathTex(r"11\,p^{+}", font_size=48, color=SECONDARY).next_to(protons, DOWN, buff=0.4)
        n_label = MathTex(r"12\,n^{0}", font_size=48, color=GREY_B).next_to(neutrons, DOWN, buff=0.4)
        with self.voiceover(text=ATOM[4]) as tracker:
            self.play(spotlight(self, sodium.nucleus), run_time=max(0.4, tracker.duration * 0.15))
            self.play(Transform(sodium.protons, protons), Transform(sodium.neutrons, neutrons),
                      run_time=max(0.8, tracker.duration * 0.4))
            self.play(pop_in(p_label, n_label), run_time=0.7)


class BayesAfter(VoiceoverScene):
    def construct(self):
        title = header("Ninety-nine percent accurate")
        people = crowd(1000, item="person", color=GREY_D, fill=0.86)
        # 10 sick (1%), all caught; 10 healthy people flagged by mistake.
        sick_ids = [55, 147, 238, 333, 419, 512, 604, 688, 781, 873]
        false_ids = [12, 121, 260, 371, 455, 566, 639, 727, 840, 958]
        readout = MathTex(r"\frac{10 \text{ sick}}{10 \text{ sick} + 10 \text{ healthy}}", r"\approx 50\%", font_size=44)
        readout[1].set_color(ACCENT)
        readout.to_edge(DOWN, buff=0.5)
        verdict = VGroup(MathTex(r"99\%", font_size=110), MathTex(r"+", font_size=150, color=ACCENT)).arrange(RIGHT, buff=1.4)
        place_in_content(verdict, above=title, fill=0.4)
        with self.voiceover(text=BAYES[0]) as tracker:
            self.play(FadeIn(title), Write(verdict[0]), run_time=max(0.6, tracker.duration * 0.35))
            self.play(pop_in(verdict[1]), run_time=0.7)
        place_in_content(people, above=title, below=readout, fill=0.95)
        sick = people.subset(sick_ids, color=ACCENT, grow=1.6)
        flagged = people.subset(false_ids, color=PRIMARY, grow=1.6)
        with self.voiceover(text=BAYES[1]) as tracker:
            self.play(FadeOut(verdict), FadeIn(people), run_time=max(0.6, tracker.duration * 0.35))
            self.play(FadeIn(sick, scale=1.6), run_time=max(0.6, tracker.duration * 0.35))
        with self.voiceover(text=BAYES[2]) as tracker:
            self.play(spotlight(self, sick), run_time=max(0.5, tracker.duration * 0.4))
        with self.voiceover(text=BAYES[3]) as tracker:
            self.play(release(self), run_time=0.5)
            self.play(FadeIn(flagged, scale=1.6), run_time=max(0.6, tracker.duration * 0.4))
        with self.voiceover(text=BAYES[4]) as tracker:
            self.play(spotlight(self, sick, flagged), run_time=max(0.5, tracker.duration * 0.25))
            self.play(Write(readout[0]), run_time=1.2)
            self.play(pop_in(readout[1]), run_time=0.8)


class SunAfter(VoiceoverScene):
    def construct(self):
        title = header("A speck beside the Sun")
        earth = Circle(radius=1, color=PRIMARY, fill_opacity=1, stroke_width=0)
        sun = Circle(radius=1, color=YELLOW, fill_opacity=1, stroke_width=0)
        pair = to_scale(earth, sun, sizes=[1, 109], height=4.6, gap=0.9, min_height=0.042)
        place_in_content(pair, above=title, fill=0.9)
        ratio = MathTex(r"109\times", font_size=72, color=ACCENT).next_to(sun, LEFT, buff=0.8).shift(UP * 1.2)
        with self.voiceover(text=SUN[0]) as tracker:
            self.play(FadeIn(title), GrowFromCenter(sun), run_time=max(0.8, tracker.duration * 0.4))
            self.play(pop_in(ratio), run_time=0.8)
        pointer = Arrow(earth.get_center() + UP * 1.3 + LEFT * 0.6, earth.get_top() + UP * 0.08, buff=0.05, color=ACCENT, stroke_width=4)
        label = Text("Earth", font_size=32, color=ACCENT).next_to(pointer.get_start(), UP, buff=0.15)
        with self.voiceover(text=SUN[1]) as tracker:
            self.play(FadeIn(earth), GrowArrow(pointer), FadeIn(label), run_time=max(0.6, tracker.duration * 0.4))
            self.play(pulse(earth, scale=3), run_time=0.8)
        globe = VGroup(
            Circle(radius=1.6, color=PRIMARY, fill_opacity=1, stroke_width=0),
            *[Ellipse(width=3.2 * np.cos(a), height=0.5 * np.cos(a), color=BLUE_E, stroke_width=2).shift(UP * 1.6 * np.sin(a))
              for a in (-0.9, -0.45, 0, 0.45, 0.9)],
            *[Ellipse(width=w, height=3.2, color=BLUE_E, stroke_width=2) for w in (0.9, 2.2)],
        )
        place_in_content(globe, above=title, fill=0.6)
        with self.voiceover(text=SUN[2]) as tracker:
            self.play(FadeOut(pointer), FadeOut(label), FadeOut(ratio), run_time=0.4)
            self.play(zoom_to(self, earth, fill=0.6), run_time=max(1.2, tracker.duration * 0.55))
            self.play(reveal_detail(earth, globe), run_time=0.8)


class CurrentAfter(VoiceoverScene):
    def construct(self):
        title = header("Fast light, slow electrons")
        wire = RoundedRectangle(width=7.5, height=3.6, corner_radius=0.5, color=GREY_B, stroke_width=6)
        battery = VGroup(Line(UP * 0.45, DOWN * 0.45, stroke_width=6, color=INK),
                         Line(UP * 0.25, DOWN * 0.25, stroke_width=10, color=INK).shift(RIGHT * 0.25))
        battery.move_to(wire.get_left())
        gap = Rectangle(width=0.2, height=1.1, fill_color=BG, fill_opacity=1, stroke_width=0).move_to(wire.get_left())
        bulb = VGroup(Circle(radius=0.45, color=GREY_B, stroke_width=5).move_to(wire.get_right()))
        glow_disc = Circle(radius=0.45, color=YELLOW, fill_opacity=0.9, stroke_width=0).move_to(bulb)
        circuit = VGroup(wire, gap, battery, bulb)
        place_in_content(circuit, above=title, fill=0.8)
        glow_disc.move_to(bulb)
        electrons = flow(wire, count=34, speed=0.35, radius=0.06, color=PRIMARY)
        with self.voiceover(text=CURRENT[0]) as tracker:
            self.play(FadeIn(title), Create(wire), FadeIn(gap), FadeIn(battery), Create(bulb), run_time=max(0.8, tracker.duration * 0.5))
            self.add(electrons)
            self.play(FadeIn(glow_disc, scale=0.5), run_time=0.4)
        with self.voiceover(text=CURRENT[1]) as tracker:
            self.play(electrons.animate.set_color(PRIMARY), run_time=0.2)
            speed = VGroup(Text("drift", font_size=32, color=MUTED),
                           MathTex(r"\approx 0.1\,\text{mm/s}", font_size=40, color=ACCENT)).arrange(RIGHT, buff=0.2)
            speed.next_to(wire, DOWN, buff=0.4)
            self.play(FadeIn(speed), run_time=0.6)
        start = wire.point_from_proportion(0.62)
        follow = Dot(start, radius=0.11, color=ACCENT)
        with self.voiceover(text=CURRENT[2]) as tracker:
            self.play(pop_in(follow), spotlight(self, follow, glow_disc), run_time=0.8)
            self.play(zoom_to(self, follow, factor=3.5, keep=[speed]), run_time=max(1, tracker.duration * 0.45))
            self.play(follow.animate.shift(RIGHT * 0.12), run_time=max(0.6, tracker.duration * 0.3), rate_func=linear)
        with self.voiceover(text=CURRENT[3]) as tracker:
            self.play(zoom_to(self, follow, factor=1 / 3.5, to=start, keep=[speed]), release(self), run_time=max(1, tracker.duration * 0.4))
            self.play(pulse(electrons), pulse(glow_disc), run_time=1)


class EquationAfter(VoiceoverScene):
    def construct(self):
        title = header("Solving is balancing")
        eq = MathTex("x", "+", "1", "=", "3", font_size=72).to_edge(DOWN, buff=0.6)
        scale = balance(width=9)
        layout_scene(scale, title=title, notes=eq)
        x, one = block("x", 0.85), block("1", 0.85, color=SECONDARY)
        threes = [block("1", 0.85, color=SECONDARY) for _ in range(3)]
        with self.voiceover(text=EQUATION[0]) as tracker:
            self.play(FadeIn(title), Write(eq), run_time=max(0.8, tracker.duration * 0.5))
        with self.voiceover(text=EQUATION[1]) as tracker:
            self.play(FadeIn(scale), run_time=0.6)
            self.play(scale.load("left", x, one), run_time=max(0.6, tracker.duration * 0.25))
            self.play(scale.load("right", *threes), run_time=max(0.6, tracker.duration * 0.25))
            self.play(link(eq[0], x), run_time=0.9)
        with self.voiceover(text=EQUATION[2]) as tracker:
            self.play(scale.tilt(0.12), run_time=0.6)
            self.play(scale.level(), run_time=max(0.6, tracker.duration * 0.3))
            self.play(link(eq[3], scale.beam, color=PRIMARY), run_time=0.9)
        step = MathTex("x", "+", "1", "-", "1", "=", "3", "-", "1", font_size=72).move_to(eq)
        step[3:5].set_color(ACCENT)
        step[7:9].set_color(ACCENT)
        with self.voiceover(text=EQUATION[3]) as tracker:
            self.play(TransformMatchingTex(eq, step), run_time=0.8)
            self.play(scale.unload("left", one), scale.unload("right", threes[0]), run_time=max(0.6, tracker.duration * 0.35))
            self.play(scale.tilt(0.04), run_time=0.3)
            self.play(scale.level(), run_time=0.4)
        answer = MathTex("x", "=", "2", font_size=80).move_to(eq)
        answer[2].set_color(ACCENT)
        with self.voiceover(text=EQUATION[4]) as tracker:
            self.play(TransformMatchingTex(step, answer), run_time=0.9)
            self.play(link(answer[2], *threes[1:]), link(answer[0], x), run_time=1.2)


class SearchAfter(VoiceoverScene):
    def construct(self):
        title = header("Halve it every time")
        values = [3, 8, 12, 17, 23, 31, 42]
        row = cells(values, size=1.05)
        goal = VGroup(Text("looking for", font_size=32, color=MUTED), MathTex("31", font_size=48, color=ACCENT)).arrange(RIGHT, buff=0.25)
        checks = VGroup(Text("checks", font_size=32, color=MUTED), Integer(0, font_size=48, color=INK)).arrange(RIGHT, buff=0.25)
        notes = VGroup(goal, checks).arrange(RIGHT, buff=1.6).to_edge(DOWN, buff=0.6)
        place_in_content(row, above=title, below=notes, fill=0.8)
        with self.voiceover(text=SEARCH[0]) as tracker:
            self.play(FadeIn(title), LaggedStart(*[FadeIn(VGroup(b, i, n), shift=UP * 0.2) for b, i, n in zip(row.boxes, row.items, row.indices)], lag_ratio=0.08),
                      run_time=max(0.8, tracker.duration * 0.5))
            self.play(FadeIn(notes), run_time=0.6)
        low = row.pointer(0, "low", color=MUTED, side=DOWN)
        high = row.pointer(6, "high", color=MUTED, side=DOWN)
        mid = row.pointer(3, "mid")
        with self.voiceover(text=SEARCH[1]) as tracker:
            self.play(FadeIn(low), FadeIn(high), run_time=0.6)
            self.play(FadeIn(mid, shift=DOWN * 0.3), checks[1].animate.set_value(1), run_time=max(0.6, tracker.duration * 0.3))
            self.play(pulse(row.items[3]), run_time=0.7)
        compare = MathTex("31", ">", "17", font_size=48).next_to(mid, RIGHT, buff=0.35)
        compare[0].set_color(ACCENT)
        with self.voiceover(text=SEARCH[2]) as tracker:
            self.play(FadeIn(compare), run_time=0.5)
            self.play(row.discard(range(0, 4)), row.move(low, 4), run_time=max(0.8, tracker.duration * 0.4))
            self.play(FadeOut(compare), run_time=0.3)
        with self.voiceover(text=SEARCH[3]) as tracker:
            self.play(row.move(mid, 5), checks[1].animate.set_value(2), run_time=max(0.6, tracker.duration * 0.3))
            self.play(row.mark(5), pulse(row.items[5]), run_time=0.8)
        # Halving ladder: a million names, cut in half twenty times.
        ladder = VGroup(*[Rectangle(width=max(10 * 0.5 ** k, 0.02), height=0.13, stroke_width=0,
                                    fill_color=PRIMARY if k < 19 else ACCENT, fill_opacity=0.9) for k in range(20)])
        ladder.arrange(DOWN, buff=0.06, aligned_edge=LEFT)
        place_in_content(ladder, above=title, below=notes, fill=0.85)
        names = VGroup(MathTex(r"1{,}000{,}000", font_size=36, color=MUTED).next_to(ladder[0], UP, buff=0.15).align_to(ladder, LEFT),
                       MathTex("1", font_size=36, color=ACCENT).next_to(ladder[-1], RIGHT, buff=0.2))
        with self.voiceover(text=SEARCH[4]) as tracker:
            self.play(FadeOut(VGroup(row, low, high, mid)), run_time=0.5)
            self.play(LaggedStart(*[GrowFromEdge(r, LEFT) for r in ladder], lag_ratio=0.25),
                      checks[1].animate.set_value(20), FadeIn(names[0]), run_time=max(1.2, tracker.duration * 0.6))
            self.play(FadeIn(names[1]), pulse(checks[1]), run_time=0.6)


def _tiles(origin, e1, e2, n, color):
    return VGroup(*[Polygon(origin + i * e1 + j * e2, origin + (i + 1) * e1 + j * e2,
                            origin + (i + 1) * e1 + (j + 1) * e2, origin + i * e1 + (j + 1) * e2,
                            stroke_color=BG, stroke_width=2, fill_color=color, fill_opacity=0.8)
                    for j in range(n) for i in range(n)])


class PythagorasAfter(VoiceoverScene):
    def construct(self):
        title = header("Three squares, one triangle")
        u = 0.5
        C, A, B = ORIGIN, RIGHT * 4 * u, UP * 3 * u
        tri = Polygon(C, A, B, color=INK, stroke_width=4, fill_color=INK, fill_opacity=0.08)
        corner = Square(side_length=0.22, color=MUTED, stroke_width=2).move_to(C + (UR * 0.11))
        n = np.array([3, 4, 0]) / 5
        sq_a = Polygon(C, B, B + LEFT * 3 * u, C + LEFT * 3 * u, color=PRIMARY, stroke_width=4)
        sq_b = Polygon(C, A, A + DOWN * 4 * u, C + DOWN * 4 * u, color=SECONDARY, stroke_width=4)
        sq_c = Polygon(A, B, B + n * 5 * u, A + n * 5 * u, color=ACCENT, stroke_width=4)
        tiles_a = _tiles(C, UP * u, LEFT * u, 3, PRIMARY)
        tiles_b = _tiles(C, RIGHT * u, DOWN * u, 4, SECONDARY)
        tiles_c = _tiles(A, (B - A) / 5, n * u, 5, ACCENT)
        # Side lengths on the outer edge of each square, clear of the small triangle.
        sides = VGroup(MathTex("3", font_size=44).next_to(sq_a, LEFT, buff=0.2),
                       MathTex("4", font_size=44).next_to(sq_b, DOWN, buff=0.2),
                       MathTex("5", font_size=44).move_to((B + A) / 2 + n * (5 * u + 0.35)))
        counts = VGroup(MathTex("9", font_size=56).move_to(sq_a), MathTex("16", font_size=56).move_to(sq_b),
                        MathTex("25", font_size=56).move_to(sq_c))
        formula = MathTex("a^2", "+", "b^2", "=", "c^2", font_size=64)
        formula[0].set_color(PRIMARY); formula[2].set_color(SECONDARY); formula[4].set_color(ACCENT)
        figure = VGroup(sq_a, sq_b, sq_c, tiles_a, tiles_b, tiles_c, tri, corner, sides, counts)
        layout_scene(figure, title=title, side=formula)
        C2, A2, B2 = tri.get_vertices()  # after layout_scene moved and scaled the figure
        legs = VGroup(MathTex("3", font_size=36).next_to(Line(C2, B2), LEFT, buff=0.12),
                      MathTex("4", font_size=36).next_to(Line(C2, A2), DOWN, buff=0.12),
                      MathTex("5", font_size=36).move_to((A2 + B2) / 2 + n * 0.3))
        with self.voiceover(text=PYTHAGORAS[0]) as tracker:
            self.play(FadeIn(title), Create(tri), FadeIn(corner), run_time=max(0.8, tracker.duration * 0.4))
            self.play(LaggedStart(*[FadeIn(s) for s in legs], lag_ratio=0.3), run_time=1)
        with self.voiceover(text=PYTHAGORAS[1]) as tracker:
            self.play(LaggedStart(Create(sq_a), Create(sq_b), Create(sq_c), lag_ratio=0.3),
                      *[ReplacementTransform(a, b) for a, b in zip(legs, sides)], run_time=max(1, tracker.duration * 0.6))
        with self.voiceover(text=PYTHAGORAS[2]) as tracker:
            self.play(LaggedStart(*[FadeIn(t, scale=0.6) for t in tiles_a], lag_ratio=0.1), run_time=max(0.6, tracker.duration * 0.3))
            self.play(LaggedStart(*[FadeIn(t, scale=0.6) for t in tiles_b], lag_ratio=0.06), run_time=max(0.6, tracker.duration * 0.3))
            self.play(FadeIn(counts[0]), FadeIn(counts[1]), run_time=0.5)
        with self.voiceover(text=PYTHAGORAS[3]) as tracker:
            self.play(FadeOut(counts[0]), FadeOut(counts[1]), run_time=0.3)
            movers = [*tiles_a, *tiles_b]
            self.play(LaggedStart(*[Transform(t, target) for t, target in zip(movers, tiles_c)], lag_ratio=0.04),
                      run_time=max(1.5, tracker.duration * 0.6))
            self.play(FadeIn(counts[2]), run_time=0.5)
        with self.voiceover(text=PYTHAGORAS[4]) as tracker:
            self.play(Write(formula), run_time=1.2)
            self.play(link(formula[0], sq_a), run_time=0.8)
            self.play(link(formula[2], sq_b), run_time=0.8)
            self.play(link(formula[4], sq_c), run_time=0.8)


class DeepTimeAfter(VoiceoverScene):
    def construct(self):
        title = header("A sliver at the end")
        events = [(-4.5e9, "Earth forms"), (-3.8e9, "first cells"), (-0.54e9, "first animals"), (-66e6, "dinosaurs end")]
        history = timeline(-4.5e9, 0, events, unit="years ago", width=12.5)
        place_in_content(history, above=title, fill=0.95)
        marks = history.event_marks
        with self.voiceover(text=DEEPTIME[0]) as tracker:
            self.play(FadeIn(title), Create(history.axis), FadeIn(history.ticks), run_time=max(0.8, tracker.duration * 0.4))
            self.play(FadeIn(marks[0], shift=UP * 0.2), run_time=0.6)
        with self.voiceover(text=DEEPTIME[1]) as tracker:
            self.play(FadeIn(marks[1], shift=DOWN * 0.2), run_time=max(0.6, tracker.duration * 0.3))
            span = Line(history.point(-4.5e9), history.point(-3.8e9), color=PRIMARY, stroke_width=10)
            self.play(Create(span), run_time=0.8)
        animals = Line(history.point(-0.54e9), history.point(0), color=ACCENT, stroke_width=10)
        with self.voiceover(text=DEEPTIME[2]) as tracker:
            self.play(FadeIn(marks[2], shift=UP * 0.2), run_time=0.6)
            self.play(Create(animals), FadeOut(span), run_time=max(0.8, tracker.duration * 0.4))
        with self.voiceover(text=DEEPTIME[3]) as tracker:
            self.play(FadeIn(marks[3], shift=DOWN * 0.2), run_time=0.6)
            self.play(spotlight(self, marks[3]), run_time=max(0.6, tracker.duration * 0.3))
        recent = timeline(-66e6, 0, [(-66e6, "dinosaurs end"), (-300e3, "first humans")], unit="years ago", width=12.5)
        place_in_content(recent, above=title, fill=0.95)
        with self.voiceover(text=DEEPTIME[4]) as tracker:
            # Labels would swell with the zoom: clear them first, keep the axis and the sliver.
            self.play(release(self), FadeOut(VGroup(*marks[:3], history.ticks, marks[3][1:])), run_time=0.5)
            self.play(zoom_to(self, history.point(-33e6), factor=12), run_time=max(1.2, tracker.duration * 0.4))
            self.play(FadeOut(VGroup(history, animals)), FadeIn(recent.axis), FadeIn(recent.ticks), FadeIn(recent.event_marks[0]), run_time=0.8)
            self.play(FadeIn(recent.event_marks[1], shift=UP * 0.2), run_time=0.6)
            self.play(pulse(recent.event_marks[1][0], scale=2.5), run_time=0.8)


class PendulumAfter(VoiceoverScene):
    def construct(self):
        title = header("What sets the swing")
        length, mass, phase = ValueTracker(1.0), ValueTracker(1.0), ValueTracker(0.0)
        scale = 2.4  # screen units per metre
        pivot = UP * 2.1 + LEFT * 2.6
        period = lambda: 2 * np.pi * np.sqrt(length.get_value() / 9.81)
        phase.add_updater(lambda m, dt: m.increment_value(dt / period()))
        angle = lambda: 0.4 * np.cos(2 * np.pi * phase.get_value())
        tip = lambda: pivot + scale * length.get_value() * np.array([np.sin(angle()), -np.cos(angle()), 0])
        ceiling = Line(pivot + LEFT * 0.8, pivot + RIGHT * 0.8, color=GREY_B, stroke_width=5)
        rod = always_redraw(lambda: Line(pivot, tip(), color=INK, stroke_width=3))
        bob = always_redraw(lambda: Circle(radius=0.16 * mass.get_value() ** (1 / 3), color=PRIMARY, fill_opacity=1).move_to(tip()))
        path = trail(bob, color=PRIMARY, fade=1.2)
        knob_l = slider(length, 0.5, 2.0, "length", width=3.2, unit=r"\,\text{m}")
        knob_m = slider(mass, 1, 8, "mass", width=3.2, unit=r"\,\text{kg}")
        readout = VGroup(MathTex("T", "=", font_size=48), always_redraw(lambda: DecimalNumber(period(), num_decimal_places=2, unit=r"\,\text{s}", font_size=48, color=ACCENT)))
        readout[1].add_updater(lambda m: m.next_to(readout[0], RIGHT, buff=0.2))
        panel = VGroup(knob_l, knob_m, readout[0]).arrange(DOWN, buff=0.8, aligned_edge=LEFT).move_to(RIGHT * 3.3 + UP * 0.2)
        readout[1].next_to(readout[0], RIGHT, buff=0.2)
        self.add(phase)
        with self.voiceover(text=PENDULUM[0]) as tracker:
            self.play(FadeIn(title), Create(ceiling), FadeIn(rod), FadeIn(bob), run_time=0.8)
            self.add(path)
            self.play(FadeIn(readout), run_time=max(0.6, tracker.duration * 0.3))
        with self.voiceover(text=PENDULUM[1]) as tracker:
            self.play(FadeIn(knob_l), run_time=0.5)
            self.play(knob_l.slide_to(2.0), run_time=max(1.5, tracker.duration * 0.6))
        with self.voiceover(text=PENDULUM[2]) as tracker:
            self.play(FadeIn(knob_m), run_time=0.5)
            self.play(knob_m.slide_to(8), run_time=max(1.2, tracker.duration * 0.5))
            self.play(pulse(readout), run_time=0.7)
        formula = MathTex("T", "=", r"2\pi", r"\sqrt{\frac{L}{g}}", font_size=60).next_to(readout, DOWN, buff=0.8).align_to(panel, LEFT)
        with self.voiceover(text=PENDULUM[3]) as tracker:
            self.play(Write(formula), run_time=1.2)
            self.play(link(formula[3], rod, knob_l.track), run_time=1.0)
            self.play(link(formula[0], readout), run_time=1.0)
