"""Reproducible visual review: same mathematics, before/after house modules.

Old-compatible scenes use the previous prompt's layout when the new layout
helpers are absent. NestedLabels deliberately uses identical code on both
sides to isolate the runtime guard fix. There is no narration or API call.
"""
from manim import *
from eduvids_style import *
import eduvids_style as style

REFINED = hasattr(style, "layout_scene")


class Derivative(Scene):
    def construct(self):
        title = header("The derivative is a slope")
        axes = Axes(x_range=[-3, 3, 1], y_range=[-1, 9, 2], x_length=7, y_length=4.5,
                    axis_config={"include_numbers": True, "include_tip": False})
        curve = axes.plot(lambda x: x*x, color=PRIMARY)
        formula = MathTex("f'(x)", "=", "2x", font_size=72)
        formula.set_color_by_tex("2x", ACCENT)
        name = Text("Instantaneous rate", font_size=32, color=MUTED)
        readout = VGroup(Text("Slope", font_size=32, color=MUTED),
                         DecimalNumber(4, num_decimal_places=1, font_size=48, color=ACCENT)).arrange(RIGHT, buff=0.25)
        block = VGroup(name, formula, readout).arrange(DOWN, aligned_edge=LEFT, buff=0.45)
        graph_label = MathTex("y=x^2", font_size=32, color=PRIMARY).next_to(axes.c2p(-2.3, 5.29), LEFT, buff=0.35)
        visual = VGroup(axes, curve, graph_label)
        if REFINED:
            notes = caption("A tangent measures change at one point")
            layout_scene(visual, title=title, notes=notes, side=block)
        else:
            # Previous prompt: fit the graph first, then position formulas.
            place_in_content(visual, above=title)
            block.next_to(axes.c2p(1, 1), RIGHT, buff=0.4)
            notes = Text("A tangent measures change at one point", font_size=32, color=MUTED).to_edge(DOWN, buff=0.6)
        t = ValueTracker(0.4)
        dot = always_redraw(lambda: Dot(axes.c2p(t.get_value(), t.get_value()**2), color=ACCENT))
        tangent = always_redraw(lambda: Line(
            axes.c2p(t.get_value() - 0.7, t.get_value()**2 - 1.4 * t.get_value()),
            axes.c2p(t.get_value() + 0.7, t.get_value()**2 + 1.4 * t.get_value()), color=ACCENT, stroke_width=4))
        readout[1].add_updater(lambda m: m.set_value(2 * t.get_value()))
        self.play(FadeIn(title), Create(axes), Create(curve), run_time=1)
        self.play(FadeIn(graph_label), FadeIn(block), FadeIn(notes), Create(tangent), FadeIn(dot), run_time=0.7)
        self.play(t.animate.set_value(2), run_time=2, rate_func=smooth)
        self.wait(0.8)


class WaveSurface(ThreeDScene):
    def construct(self):
        title = header("A wave in two directions")
        formula = MathTex(r"z = \sin x \cos y", font_size=48, color=ACCENT)
        self.set_camera_orientation(phi=62 * DEGREES, theta=-48 * DEGREES, focal_distance=24)
        axes = ThreeDAxes(x_range=[-3, 3, 1], y_range=[-3, 3, 1], z_range=[-1.5, 1.5, 1],
                         x_length=6, y_length=6, z_length=3,
                         axis_config={"include_tip": False, "include_ticks": False, "stroke_width": 1.5})
        surface = Surface(lambda u, v: axes.c2p(u, v, np.sin(u) * np.cos(v)),
                          u_range=[-3, 3], v_range=[-3, 3], resolution=(48, 48))
        # Meaningful coordinate slices, rather than outlining every patch.
        slices = VGroup(*[ParametricFunction(lambda u, v=v: axes.c2p(u, v, np.sin(u) * np.cos(v) + 0.012),
                         t_range=[-3, 3], color=INK, stroke_width=1.2, stroke_opacity=0.35)
                         for v in (-1.5, 0, 1.5)]) if REFINED else VGroup()
        for part in slices:
            glow(part, False)
        visual = VGroup(axes, surface, slices)
        if REFINED:
            formula.to_edge(DOWN, buff=0.65)
            fixed_overlay(self, title, formula)
            place_3d_in_content(self, visual, above=title, below=formula, orbit=16 * DEGREES)
        else:
            # Earlier surface template keeps the formula in the title lane.
            formula.to_corner(UR, buff=0.6)
            self.add_fixed_in_frame_mobjects(title, formula)
        self.play(FadeIn(title), FadeIn(surface), Create(axes), run_time=1)
        self.play(FadeIn(formula), FadeIn(slices), run_time=0.6)
        self.move_camera(theta=-32 * DEGREES, run_time=2, rate_func=smooth)
        self.wait(0.8)


class NestedLabels(Scene):
    def construct(self):
        title = header("Labels need room to breathe")
        axes = Axes(x_range=[-2, 2, 1], y_range=[-1, 4, 1], x_length=8, y_length=4.5,
                    axis_config={"include_tip": False}).shift(DOWN * 0.3)
        curve = axes.plot(lambda x: x*x, color=PRIMARY)
        tangent = Line(axes.c2p(0, -1), axes.c2p(2.3, 3.6), color=ACCENT)
        label = Text("Tangent", font_size=36, color=ACCENT).move_to(axes.c2p(1, 1))
        graph_label = MathTex("y=x^2", font_size=36, color=PRIMARY).move_to(axes.c2p(-1.4, 1.96))
        mixed = VGroup(axes, curve, tangent, label, graph_label)
        self.add(title, mixed)
        self.wait(1)
