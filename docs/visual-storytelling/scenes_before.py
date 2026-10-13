"""Before: the same narration, written to the previous prompt's templates
(header, layout_scene, hero formulas, pop_in and pulse). These are faithful
best-case outputs of the old instructions, not deliberately weak ones."""
from manim import *
from manim_voiceover import VoiceoverScene
from eduvids_style import *
from narration import ATOM, BAYES, SUN, CURRENT, EQUATION, SEARCH, PYTHAGORAS, DEEPTIME, PENDULUM


class AtomBefore(VoiceoverScene):
    def construct(self):
        title = header("How small is an atom?")
        grain = Square(side_length=1.6, color=PRIMARY, fill_opacity=0.3)
        size = MathTex(r"1\,\text{mm}", font_size=44).next_to(grain, DOWN, buff=0.4)
        with self.voiceover(text=ATOM[0]) as tracker:
            self.play(FadeIn(title), Create(grain), run_time=max(0.6, tracker.duration * 0.4))
            self.play(Write(size), run_time=1)
        grid = VGroup(*[Circle(radius=0.22, color=PRIMARY, fill_opacity=0.5) for _ in range(25)]).arrange_in_grid(5, 5, buff=0.25)
        label = Text("Atoms", font_size=32, color=MUTED).next_to(grid, RIGHT, buff=0.6)
        with self.voiceover(text=ATOM[1]) as tracker:
            self.play(FadeOut(grain), FadeOut(size), run_time=0.5)
            self.play(Create(grid), FadeIn(label), run_time=max(0.8, tracker.duration * 0.5))
        with self.voiceover(text=ATOM[2]) as tracker:
            self.play(pulse(grid[12]), run_time=max(0.6, tracker.duration * 0.4))
        nucleus = Circle(radius=0.35, color=SECONDARY, fill_opacity=0.8)
        orbits = VGroup(*[Circle(radius=r, color=MUTED, stroke_width=2) for r in (0.9, 1.4, 1.9)])
        electrons = VGroup(*[Dot(orbits[i].point_at_angle(a), color=PRIMARY)
                             for i, n in enumerate((2, 8, 1)) for a in np.linspace(0, TAU, n, endpoint=False)])
        diagram = VGroup(orbits, nucleus, electrons)
        n_label = Text("Nucleus", font_size=32, color=SECONDARY).next_to(diagram, LEFT, buff=0.5)
        e_label = Text("Electron", font_size=32, color=PRIMARY).next_to(diagram, RIGHT, buff=0.5)
        notes = caption("A sodium atom is about a third of a nanometre wide")
        visual = VGroup(diagram, n_label, e_label)
        layout_scene(visual, title=title, notes=notes)
        with self.voiceover(text=ATOM[3]) as tracker:
            self.play(FadeOut(grid), FadeOut(label), run_time=0.5)
            self.play(Create(orbits), pop_in(nucleus), FadeIn(electrons), run_time=max(0.8, tracker.duration * 0.4))
            self.play(FadeIn(n_label), FadeIn(e_label), FadeIn(notes), run_time=0.8)
        formula = MathTex(r"11\,p^{+}", r"+", r"12\,n^{0}", font_size=72)
        formula.set_color_by_tex(r"11\,p^{+}", ACCENT)
        with self.voiceover(text=ATOM[4]) as tracker:
            self.play(FadeOut(visual), FadeOut(notes), run_time=0.5)
            self.play(Write(formula), run_time=1.5)
            self.play(pulse(formula[0]), run_time=0.6)


class BayesBefore(VoiceoverScene):
    def construct(self):
        title = header("Ninety-nine percent accurate")
        acc = MathTex(r"P(+ \mid D) = 0.99", font_size=72)
        with self.voiceover(text=BAYES[0]) as tracker:
            self.play(FadeIn(title), Write(acc), run_time=max(0.8, tracker.duration * 0.4))
        prior = MathTex(r"P(D) = 0.01", font_size=64, color=PRIMARY)
        block = VGroup(acc.copy().scale(0.8), prior).arrange(DOWN, aligned_edge=LEFT, buff=0.5)
        place_in_content(block, above=title, fill=0.5)
        with self.voiceover(text=BAYES[1]) as tracker:
            self.play(Transform(acc, block[0]), run_time=0.8)
            self.play(pop_in(prior), run_time=0.8)
        with self.voiceover(text=BAYES[2]) as tracker:
            self.play(pulse(acc), run_time=max(0.6, tracker.duration * 0.4))
        false_pos = MathTex(r"P(+ \mid \neg D) = 0.01", font_size=64, color=SECONDARY)
        false_pos.next_to(prior, DOWN, buff=0.5).align_to(prior, LEFT)
        with self.voiceover(text=BAYES[3]) as tracker:
            self.play(Write(false_pos), run_time=1.2)
        bayes = MathTex(r"P(D \mid +)", r"=", r"\frac{0.99 \times 0.01}{0.99 \times 0.01 + 0.01 \times 0.99}", r"\approx 0.5", font_size=56)
        bayes.set_color_by_tex(r"\approx 0.5", ACCENT)
        place_in_content(bayes, above=title, fill=0.8)
        with self.voiceover(text=BAYES[4]) as tracker:
            self.play(FadeOut(acc), FadeOut(prior), FadeOut(false_pos), run_time=0.5)
            self.play(Write(bayes), run_time=1.8)
            self.play(pulse(bayes[3]), run_time=0.6)


class SunBefore(VoiceoverScene):
    def construct(self):
        title = header("A speck beside the Sun")
        sun = Circle(radius=1.8, color=YELLOW, fill_opacity=0.8)
        earth = Circle(radius=0.3, color=PRIMARY, fill_opacity=0.8)
        pair = VGroup(earth, sun).arrange(RIGHT, buff=1.5)
        sun_label = Text("Sun", font_size=32, color=YELLOW).next_to(sun, DOWN, buff=0.4)
        earth_label = Text("Earth", font_size=32, color=PRIMARY).next_to(earth, DOWN, buff=0.4)
        formula = MathTex(r"R_{\odot} \approx 109\, R_{\oplus}", font_size=64)
        visual = VGroup(pair, sun_label, earth_label)
        layout_scene(visual, title=title, side=formula)
        with self.voiceover(text=SUN[0]) as tracker:
            self.play(FadeIn(title), pop_in(sun), pop_in(earth), run_time=max(0.8, tracker.duration * 0.4))
            self.play(Write(formula), run_time=1.2)
        with self.voiceover(text=SUN[1]) as tracker:
            self.play(FadeIn(sun_label), FadeIn(earth_label), run_time=0.8)
            self.play(pulse(earth), run_time=0.8)
        with self.voiceover(text=SUN[2]) as tracker:
            self.play(Circumscribe(earth, color=ACCENT), run_time=max(0.8, tracker.duration * 0.4))


class CurrentBefore(VoiceoverScene):
    def construct(self):
        title = header("Fast light, slow electrons")
        wire = RoundedRectangle(width=6, height=3, corner_radius=0.4, color=GREY_B, stroke_width=5)
        battery = Text("Battery", font_size=32, color=MUTED).next_to(wire, LEFT, buff=0.4)
        bulb = Circle(radius=0.4, color=YELLOW, fill_opacity=0.2).move_to(wire.get_right())
        bulb_label = Text("Bulb", font_size=32, color=MUTED).next_to(bulb, RIGHT, buff=0.4)
        arrows = VGroup(*[Arrow(wire.point_from_proportion(t), wire.point_from_proportion(t + 0.05), buff=0, color=PRIMARY)
                          for t in (0.1, 0.35, 0.6, 0.85)])
        visual = VGroup(wire, battery, bulb, bulb_label, arrows)
        formula = MathTex(r"v_d \approx 0.1\,\text{mm/s}", font_size=56, color=ACCENT)
        layout_scene(visual, title=title, side=formula)
        with self.voiceover(text=CURRENT[0]) as tracker:
            self.play(FadeIn(title), Create(wire), FadeIn(battery), run_time=max(0.8, tracker.duration * 0.4))
            self.play(bulb.animate.set_fill(YELLOW, opacity=0.9), FadeIn(bulb_label), run_time=0.6)
        with self.voiceover(text=CURRENT[1]) as tracker:
            self.play(LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.2), run_time=max(0.8, tracker.duration * 0.4))
        with self.voiceover(text=CURRENT[2]) as tracker:
            self.play(Write(formula), run_time=1.2)
            self.play(pulse(formula), run_time=0.6)
        with self.voiceover(text=CURRENT[3]) as tracker:
            self.play(LaggedStart(*[Indicate(a, color=ACCENT) for a in arrows], lag_ratio=0.1), run_time=max(0.8, tracker.duration * 0.4))


class EquationBefore(VoiceoverScene):
    def construct(self):
        title = header("Solving is balancing")
        eq = MathTex("x", "+", "1", "=", "3", font_size=80)
        place_in_content(eq, above=title, fill=0.5)
        with self.voiceover(text=EQUATION[0]) as tracker:
            self.play(FadeIn(title), Write(eq), run_time=max(0.8, tracker.duration * 0.5))
        notes = caption("Both sides of an equation are equal")
        with self.voiceover(text=EQUATION[1]) as tracker:
            self.play(pulse(eq[0]), run_time=max(0.6, tracker.duration * 0.3))
            self.play(FadeIn(notes), run_time=0.6)
        with self.voiceover(text=EQUATION[2]) as tracker:
            self.play(pulse(eq[3]), run_time=max(0.6, tracker.duration * 0.3))
        step = MathTex("x", "+", "1", "-", "1", "=", "3", "-", "1", font_size=80).move_to(eq)
        step[3:5].set_color(ACCENT); step[7:9].set_color(ACCENT)
        with self.voiceover(text=EQUATION[3]) as tracker:
            self.play(TransformMatchingTex(eq, step), run_time=max(0.8, tracker.duration * 0.4))
        answer = MathTex("x", "=", "2", font_size=96).move_to(eq)
        answer[2].set_color(ACCENT)
        with self.voiceover(text=EQUATION[4]) as tracker:
            self.play(TransformMatchingTex(step, answer), run_time=1)
            self.play(pulse(answer), run_time=0.6)


class SearchBefore(VoiceoverScene):
    def construct(self):
        title = header("Halve it every time")
        listing = MathTex(r"[3, 8, 12, 17, 23, 31, 42]", font_size=56)
        mid = MathTex(r"\text{mid} = 17", font_size=56, color=ACCENT)
        rule = MathTex(r"31 > 17 \Rightarrow \text{search right half}", font_size=48)
        found = MathTex(r"\text{found in } 2 \text{ steps}", font_size=48, color=ACCENT)
        block_ = VGroup(listing, mid, rule, found).arrange(DOWN, buff=0.5)
        place_in_content(block_, above=title, fill=0.8)
        lock_layout(block_)
        with self.voiceover(text=SEARCH[0]) as tracker:
            self.play(FadeIn(title), Write(listing), run_time=max(0.8, tracker.duration * 0.5))
        with self.voiceover(text=SEARCH[1]) as tracker:
            self.play(Write(mid), run_time=1)
        with self.voiceover(text=SEARCH[2]) as tracker:
            self.play(Write(rule), run_time=1.2)
        with self.voiceover(text=SEARCH[3]) as tracker:
            self.play(FadeIn(found), run_time=1)
        cost = MathTex(r"\log_2 1{,}000{,}000 \approx 20", font_size=72)
        place_in_content(cost, above=title, fill=0.6)
        with self.voiceover(text=SEARCH[4]) as tracker:
            self.play(FadeOut(VGroup(listing, mid, rule, found)), run_time=0.5)
            self.play(Write(cost), run_time=1.5)


class PythagorasBefore(VoiceoverScene):
    def construct(self):
        title = header("Three squares, one triangle")
        tri = Polygon(ORIGIN, RIGHT * 4 * 0.6, UP * 3 * 0.6, color=PRIMARY, fill_opacity=0.25)
        labels = VGroup(MathTex("a = 3", font_size=40).next_to(tri, LEFT, buff=0.3),
                        MathTex("b = 4", font_size=40).next_to(tri, DOWN, buff=0.3),
                        MathTex("c = 5", font_size=40, color=ACCENT).move_to(tri.get_center() + UR * 0.7))
        formula = MathTex("a^2", "+", "b^2", "=", "c^2", font_size=72)
        layout_scene(VGroup(tri, labels), title=title, side=formula)
        with self.voiceover(text=PYTHAGORAS[0]) as tracker:
            self.play(FadeIn(title), Create(tri), run_time=max(0.8, tracker.duration * 0.4))
            self.play(FadeIn(labels), run_time=0.8)
        with self.voiceover(text=PYTHAGORAS[1]) as tracker:
            self.play(Write(formula), run_time=max(0.8, tracker.duration * 0.5))
        numbers = MathTex("9", "+", "16", "=", "25", font_size=72).move_to(formula)
        with self.voiceover(text=PYTHAGORAS[2]) as tracker:
            self.play(TransformMatchingTex(formula.copy(), numbers.next_to(formula, DOWN, buff=0.6)), run_time=1.2)
        with self.voiceover(text=PYTHAGORAS[3]) as tracker:
            self.play(pulse(numbers[4]), run_time=max(0.6, tracker.duration * 0.3))
        with self.voiceover(text=PYTHAGORAS[4]) as tracker:
            self.play(Circumscribe(formula, color=ACCENT), run_time=1.2)


class DeepTimeBefore(VoiceoverScene):
    def construct(self):
        title = header("A sliver at the end")
        rows = VGroup(*[VGroup(MathTex(when, font_size=40, color=ACCENT), Text(what, font_size=36))
                        .arrange(RIGHT, buff=0.4) for when, what in (
                            (r"4.5\text{ billion years ago}", "Earth forms"),
                            (r"3.8\text{ billion years ago}", "first cells"),
                            (r"540\text{ million years ago}", "first animals"),
                            (r"66\text{ million years ago}", "dinosaurs end"),
                            (r"300{,}000\text{ years ago}", "first humans"))])
        rows.arrange(DOWN, aligned_edge=LEFT, buff=0.45)
        place_in_content(rows, above=title, fill=0.75)
        lock_layout(rows)
        for k, line in enumerate(DEEPTIME):
            with self.voiceover(text=line) as tracker:
                if k == 0:
                    self.play(FadeIn(title), run_time=0.5)
                self.play(FadeIn(rows[k], shift=RIGHT * 0.2), run_time=max(0.6, tracker.duration * 0.4))


class PendulumBefore(VoiceoverScene):
    def construct(self):
        title = header("What sets the swing")
        pivot = UP * 1.6 + LEFT * 2.5
        rod = Line(pivot, pivot + DOWN * 2.6 + RIGHT * 0.9, color=INK)
        bob = Circle(radius=0.25, color=PRIMARY, fill_opacity=1).move_to(rod.get_end())
        ceiling = Line(pivot + LEFT * 0.8, pivot + RIGHT * 0.8, color=GREY_B, stroke_width=5)
        l_label = MathTex("L", font_size=44).next_to(rod.get_center(), RIGHT, buff=0.3)
        m_label = MathTex("m", font_size=44).next_to(bob, RIGHT, buff=0.3)
        formula = MathTex("T", "=", r"2\pi", r"\sqrt{\frac{L}{g}}", font_size=72)
        layout_scene(VGroup(ceiling, rod, bob, l_label, m_label), title=title, side=formula)
        notes = caption("The period does not depend on mass")
        with self.voiceover(text=PENDULUM[0]) as tracker:
            self.play(FadeIn(title), Create(ceiling), Create(rod), FadeIn(bob), run_time=max(0.8, tracker.duration * 0.5))
        with self.voiceover(text=PENDULUM[1]) as tracker:
            self.play(FadeIn(l_label), Write(formula), run_time=max(0.8, tracker.duration * 0.5))
        with self.voiceover(text=PENDULUM[2]) as tracker:
            self.play(FadeIn(m_label), FadeIn(notes), run_time=max(0.8, tracker.duration * 0.4))
        with self.voiceover(text=PENDULUM[3]) as tracker:
            self.play(pulse(formula[3]), run_time=1)
