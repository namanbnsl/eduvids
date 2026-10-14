"""Before/after scenes for the video engagement review.

"Before" follows the current prompts with the devices they already had
(equation_link, population, chart, trajectory): a topic-label title, the
picture built up, the formula linked. "After" follows the new rules: open on
the hook picture in the first second, a claim for a title, the tempting
wrong answer struck out, the payoff as a big number, and a pointer at the
surprising detail. Both use the same house-style module and palette. No
narration is rendered; each beat is held for roughly its spoken length.
"""
from manim import *
from eduvids_style import *


class MontyBefore(Scene):
    def construct(self):
        title = header("The Monty Hall problem")
        doors = VGroup(*[RoundedRectangle(width=1.6, height=2.6, corner_radius=0.1, color=PRIMARY, fill_opacity=0.2) for _ in range(3)]).arrange(RIGHT, buff=0.6)
        names = VGroup(*[MathTex(str(i + 1), font_size=44).move_to(door) for i, door in enumerate(doors)])
        formula = MathTex(r"P(\text{win})", r"=", r"\tfrac{2}{3}", font_size=64)
        formula.set_color_by_tex(r"\tfrac{2}{3}", ACCENT)
        layout_scene(VGroup(doors, names), title=title, side=formula)
        self.play(FadeIn(title), run_time=0.8)
        self.play(Create(doors), FadeIn(names), run_time=1.2)
        self.wait(1.5)
        self.play(doors[2].animate.set_fill(MUTED, 0.5), run_time=0.8)
        self.wait(1.2)
        self.play(Write(formula), run_time=1.2)
        self.play(link(formula[2], doors[1]))
        self.wait(1.5)


class MontyAfter(Scene):
    def construct(self):
        title = header("Not 50/50")
        fig = big_number(r"67\%", was=r"50\%")
        place_in_content(fig, above=title, fill=0.5)
        guess = fig.was
        self.play(FadeIn(guess, scale=0.8), FadeIn(title), run_time=0.6)   # the hook: the guess everyone makes
        self.wait(1.4)
        self.play(strike(guess))
        self.play(pop_in(fig.figure, scale=0.4), run_time=1.0)
        self.wait(1.2)
        people = crowd(90, item="person", color=MUTED, width=8, height=3.2)
        wins = people.subset(range(0, 90, 3), color=PRIMARY)
        lose = people.subset([i for i in range(90) if i % 3], color=ACCENT)
        place_in_content(VGroup(people, wins, lose), above=title, fill=0.75)
        self.play(FadeOut(fig, guess), FadeIn(people), run_time=0.8)
        self.play(FadeIn(lose), FadeIn(wins), run_time=0.8)
        note = point_at(lose.item(lose.nearest(lose.get_corner(UR))) if hasattr(lose, "item") else lose, "switchers win", direction=UR, distance=0.9)
        self.play(note.reveal())
        self.wait(1.6)


class PrimesBefore(Scene):
    def construct(self):
        title = header("Prime numbers")
        row = cells([2, 3, 5, 7, 11, 13, 17, 19])
        place_in_content(row, above=title, fill=0.8)
        self.play(FadeIn(title), run_time=0.8)
        self.play(FadeIn(row), run_time=1.0)
        self.wait(1.6)
        formula = MathTex(r"\pi(x)", r"\approx", r"\frac{x}{\ln x}", font_size=64)
        formula.next_to(row, DOWN, buff=0.9)
        self.play(Write(formula), run_time=1.4)
        self.play(pulse(formula[2]))
        self.wait(2.0)


class PrimesAfter(Scene):
    def construct(self):
        title = header("Primes aren't random")
        spiral = prime_spiral()
        place_in_content(spiral, above=title, fill=0.95)
        self.play(FadeIn(spiral.dots, scale=0.6), run_time=1.0)            # the hook picture, first second
        self.play(FadeIn(title), run_time=0.5)
        self.wait(1.0)
        self.play(FadeIn(spiral.arm), run_time=0.8)
        note = point_at(spiral.arm.item(spiral.arm.nearest(spiral.arm.get_corner(DL))), "why a spiral?", direction=LEFT, distance=0.9)
        self.play(note.reveal())
        self.wait(1.5)
        guess = Text("random", font_size=56).to_corner(DR, buff=0.9)
        self.play(FadeOut(note), pop_in(guess), run_time=0.7)
        self.play(strike(guess))
        self.wait(1.5)


class ChaosBefore(Scene):
    def construct(self):
        title = header("Chaos theory")
        axes = Axes(x_range=[0, 10, 2], y_range=[-1.5, 1.5, 1], x_length=8, y_length=3.6)
        a = axes.plot(lambda t: np.sin(t) * np.exp(-0.05 * t), color=PRIMARY)
        b = axes.plot(lambda t: np.sin(t * 1.08) * np.exp(-0.05 * t), color=SECONDARY)
        layout_scene(VGroup(axes, a, b), title=title)
        self.play(FadeIn(title), run_time=0.8)
        self.play(Create(axes), run_time=1.0)
        self.play(Create(a), run_time=1.5)
        self.play(Create(b), run_time=1.5)
        self.wait(2.0)


class ChaosAfter(Scene):
    def construct(self):
        title = header("Same start, new future")
        storm = lorenz()
        place_in_content(storm, above=title, fill=0.92)
        self.play(Create(storm.path), FadeIn(title), run_time=2.0)          # the butterfly draws itself at once
        self.wait(0.6)
        self.play(Create(storm.twin), pop_in(storm.fork), run_time=1.6)
        note = point_at(storm.fork, r"10^{-5}\ \text{apart}", direction=LEFT, distance=1.0)
        self.play(note.reveal())
        self.wait(2.0)
