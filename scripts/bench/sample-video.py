from manim import *
from manim_voiceover import VoiceoverScene
from eduvids_tts import EduvidsTTSService
import numpy as np


class Scene01Intro(VoiceoverScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("The derivative is a slope")
        axes = Axes(x_range=[-3, 3, 1], y_range=[-1, 9, 2], x_length=7, y_length=4.5,
                    axis_config={"include_numbers": True})
        graph = axes.plot(lambda x: x ** 2, color=PRIMARY)
        visual = VGroup(axes, graph)
        notes = caption("How fast does a curve change at a single point?")
        layout_scene(visual, title=title, notes=notes)
        with self.voiceover(text="Every curve hides a question. How steep is it, right here, at this exact point? That single number is what calculus calls the derivative.") as tracker:
            self.play(FadeIn(title), Create(axes), run_time=max(0.4, tracker.duration * 0.35))
            self.play(Create(graph), run_time=max(0.4, tracker.duration * 0.45))
            self.wait(max(0, tracker.get_remaining_duration()))
        t = ValueTracker(-2)
        dot = always_redraw(lambda: Dot(axes.c2p(t.get_value(), t.get_value() ** 2), color=ACCENT))
        tangent = always_redraw(lambda: axes.plot(
            lambda x: 2 * t.get_value() * (x - t.get_value()) + t.get_value() ** 2,
            x_range=[t.get_value() - 1, t.get_value() + 1], color=ACCENT))
        with self.voiceover(text="Slide a point along the parabola and watch the tangent line swing with it. On the left it tilts down, at the bottom it lies flat, and on the right it climbs ever more steeply.") as tracker:
            self.play(pop_in(dot), FadeIn(tangent), FadeIn(notes))
            self.play(t.animate.set_value(2), run_time=max(0.4, tracker.duration * 0.7), rate_func=smooth)
            self.wait(max(0, tracker.get_remaining_duration()))


class Scene02Secant(VoiceoverScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("From secant to tangent")
        axes = Axes(x_range=[0, 4, 1], y_range=[0, 16, 4], x_length=6.5, y_length=4.2,
                    axis_config={"include_numbers": True})
        graph = axes.plot(lambda x: x ** 2, color=PRIMARY)
        h = ValueTracker(2)
        secant = always_redraw(lambda: Line(axes.c2p(1, 1), axes.c2p(1 + h.get_value(), (1 + h.get_value()) ** 2), color=SECONDARY))
        readout = always_redraw(lambda: VGroup(
            MathTex(r"h =", font_size=44),
            DecimalNumber(h.get_value(), num_decimal_places=2, font_size=44, color=ACCENT),
        ).arrange(RIGHT, buff=0.15).to_corner(DR, buff=0.8))
        formula = MathTex(r"\frac{f(1+h) - f(1)}{h}", font_size=64)
        layout_scene(VGroup(axes, graph), title=title, side=formula)
        with self.voiceover(text="Start with two points on the curve and join them. The slope of that secant line is rise over run, a difference quotient.") as tracker:
            self.play(FadeIn(title), Create(axes), Create(graph), run_time=max(0.4, tracker.duration * 0.4))
            self.play(Create(secant), Write(formula), run_time=max(0.4, tracker.duration * 0.4))
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="Now let the gap h shrink. The second point slides toward the first, and the secant settles onto the tangent line. Its slope approaches two.") as tracker:
            self.play(FadeIn(readout), run_time=0.6)
            self.play(h.animate.set_value(0.01), run_time=max(0.4, tracker.duration * 0.7), rate_func=smooth)
            self.wait(max(0, tracker.get_remaining_duration()))


class Scene03Limit(VoiceoverScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("The limit definition")
        f1 = MathTex(r"f'(x)", r"=", r"\lim_{h \to 0} \frac{f(x+h) - f(x)}{h}", font_size=72)
        f1.set_color_by_tex(r"\lim", ACCENT)
        f2 = MathTex(r"f'(x)", r"=", r"2x", font_size=80)
        f2.set_color_by_tex("2x", ACCENT)
        place_in_content(f1, above=title)
        f2.move_to(f1)
        with self.voiceover(text="Written as a limit, the derivative is the slope of the secant as the gap goes to zero. This one line is the whole definition.") as tracker:
            self.play(FadeIn(title), run_time=0.6)
            self.play(Write(f1), run_time=1.8)
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="For the parabola x squared, the algebra collapses beautifully. The derivative is simply two x.") as tracker:
            self.play(TransformMatchingTex(f1, f2), run_time=max(0.4, tracker.duration * 0.4))
            self.play(pulse(f2[2]))
            self.wait(max(0, tracker.get_remaining_duration()))


class Scene04Area(VoiceoverScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("Slopes add up to areas")
        axes = Axes(x_range=[0, 3, 1], y_range=[0, 9, 3], x_length=6.5, y_length=4.2,
                    axis_config={"include_numbers": True})
        graph = axes.plot(lambda x: x ** 2, color=PRIMARY)
        right = ValueTracker(0.5)
        area = always_redraw(lambda: axes.get_area(graph, x_range=[0, right.get_value()], color=PRIMARY, opacity=0.3))
        label = MathTex(r"\int_0^b x^2\,dx = \frac{b^3}{3}", font_size=56, color=ACCENT)
        layout_scene(VGroup(axes, graph), title=title, side=label)
        with self.voiceover(text="Run the idea backwards. If the derivative measures how fast area grows, then adding up thin strips under the curve recovers the area itself.") as tracker:
            self.play(FadeIn(title), Create(axes), Create(graph), run_time=max(0.4, tracker.duration * 0.35))
            self.play(FadeIn(area), run_time=0.6)
            self.play(right.animate.set_value(3), run_time=max(0.4, tracker.duration * 0.45))
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="That is the fundamental theorem of calculus. Slopes and areas are two sides of the same coin.") as tracker:
            self.play(Write(label), run_time=1.5)
            self.wait(max(0, tracker.get_remaining_duration()))


class Scene05Circle(VoiceoverScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("A circle grows by its rim")
        shape = Circle(radius=1.6, color=PRIMARY, fill_opacity=0.25)
        radius = Line(shape.get_center(), shape.get_right(), color=ACCENT, stroke_width=6)
        place_in_content(VGroup(shape, radius), above=title)
        lbl = MathTex("r", font_size=44, color=ACCENT).next_to(radius, UP, buff=0.25)
        formula = MathTex(r"\frac{d}{dr}\,\pi r^2 = 2\pi r", font_size=56).to_edge(DOWN, buff=0.7)
        with self.voiceover(text="Here is the same idea with a circle. Its area is pi r squared, and when the radius grows a little, the new area is a thin ring around the rim.") as tracker:
            self.play(FadeIn(title), DrawBorderThenFill(shape), run_time=max(0.4, tracker.duration * 0.35))
            self.play(Create(radius), FadeIn(lbl), run_time=max(0.4, tracker.duration * 0.3))
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="So the derivative of the area is the circumference. Two pi r.") as tracker:
            self.play(Write(formula), run_time=1.4)
            self.play(Circumscribe(formula, color=ACCENT))
            self.wait(max(0, tracker.get_remaining_duration()))


class Scene06Surface(VoiceoverScene, ThreeDScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("Slopes in two directions")
        notes = MathTex(r"z = \sin x \cos y", font_size=48).to_edge(DOWN, buff=0.6)
        fixed_overlay(self, title, notes)
        self.set_camera_orientation(phi=62 * DEGREES, theta=-48 * DEGREES, focal_distance=24)
        axes = ThreeDAxes(x_range=[-3, 3, 1], y_range=[-3, 3, 1], z_range=[-1.5, 1.5, 1], x_length=6, y_length=6, z_length=3,
                          axis_config={"include_ticks": False, "include_tip": False})
        surface = Surface(lambda u, v: axes.c2p(u, v, np.sin(u) * np.cos(v)), u_range=[-3, 3], v_range=[-3, 3], resolution=(32, 32))
        visual = VGroup(axes, surface)
        place_3d_in_content(self, visual, above=title, below=notes, orbit=16 * DEGREES)
        with self.voiceover(text="On a surface, the slope depends on which way you walk. Partial derivatives measure it along each axis separately.") as tracker:
            self.play(FadeIn(title), FadeIn(surface), Create(axes), run_time=max(0.4, tracker.duration * 0.35))
            self.play(FadeIn(notes), run_time=0.6)
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="Turn the view and the hills and valleys of the wave come into focus, each with its own steepness.") as tracker:
            self.move_camera(theta=-32 * DEGREES, run_time=max(0.4, tracker.duration * 0.7), rate_func=smooth)
            self.wait(max(0, tracker.get_remaining_duration()))


class Scene07Summary(VoiceoverScene):
    def construct(self):
        self.set_speech_service(EduvidsTTSService())
        title = header("What to remember")
        lines = VGroup(
            balanced_text("The derivative is the slope of the tangent line.", font_size=40),
            balanced_text("It is the limit of secant slopes as the gap shrinks.", font_size=40),
            balanced_text("Adding up slopes gives back area.", font_size=40),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.45)
        place_in_content(lines, above=title)
        lock_layout(lines)
        with self.voiceover(text="Three ideas to take with you. The derivative is a slope. It is defined as a limit. And slopes accumulate into areas.") as tracker:
            self.play(FadeIn(title), run_time=0.6)
            for line in lines:
                self.play(FadeIn(line, shift=RIGHT * 0.3), run_time=max(0.4, tracker.duration * 0.2))
            self.wait(max(0, tracker.get_remaining_duration()))
