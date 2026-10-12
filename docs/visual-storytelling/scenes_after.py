"""After: the same narration, written to the new prompt's visual devices."""
from manim import *
from manim_voiceover import VoiceoverScene
from eduvids_style import *
from narration import ATOM, BAYES, SUN, CURRENT


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
