"""Behaviour of the storytelling helpers (crowds, zooms, spotlight, props).

The Node test installs the palette and bundled fonts into an isolated folder.
Animations are stepped directly, so nothing is rendered or encoded.
"""
import sys
import unittest

sys.path.insert(0, sys.argv.pop(1))
from manim import *
from eduvids_style import *
import eduvids_style as style


def run(scene, animation):
    """Step an animation to its end the way Scene.play does."""
    animation._setup_scene(scene)
    animation.begin()
    animation.interpolate(1)
    animation.finish()
    animation.clean_up_from_scene(scene)


class CrowdTests(unittest.TestCase):
    def test_crowd_is_one_path_and_fills_its_grid(self):
        people = crowd(1000, width=11, height=4.4, item="person")
        self.assertEqual(len(people), 1000)
        self.assertEqual(people.submobjects, [])  # one draw call
        self.assertLessEqual(people.width, 11 + 1e-6)
        self.assertLessEqual(people.height, 4.4 + 1e-6)
        self.assertTrue(people._eduvids_layout_locked)
        lattice = crowd(2400, width=4, height=4)
        self.assertEqual(lattice.rows * lattice.cols, 2400)  # a divisor grid, no ragged row

    def test_items_and_subsets_sit_exactly_on_their_members(self):
        dots = crowd(100, width=5, height=5).shift(RIGHT * 2)
        one = dots.item(37)
        np.testing.assert_allclose(one.get_center(), dots.centers()[37], atol=1e-9)
        share = dots.subset(range(0, 100, 10), color=ACCENT)
        self.assertEqual(len(share), 10)
        np.testing.assert_allclose(share.centers(), dots.centers()[::10], atol=1e-9)
        self.assertEqual(dots.nearest(dots.get_center()), dots.nearest())
        big = dots.subset([37, 137], grow=1.5)  # 137 wraps to 37
        self.assertAlmostEqual(big.width, one.width * 1.5, places=6)
        np.testing.assert_allclose(big.get_center(), one.get_center(), atol=1e-9)


class ZoomTests(unittest.TestCase):
    def test_zoom_brings_target_to_content_centre_and_spares_lanes(self):
        scene = Scene()
        title = header("How small is an atom?")
        notes = caption("A grain of salt")
        lattice = crowd(400, width=4, height=3)
        one = lattice.item(lattice.nearest(lattice.get_center() + RIGHT))
        bar = scale_bar(r"1\,\text{mm}")
        scene.add(title, notes, lattice, one, bar)
        title_before, bar_before = title.get_center().copy(), bar.get_center().copy()
        size = one.height
        run(scene, zoom_to(scene, one, fill=0.5))
        center, _, height = content_box(title, notes)
        np.testing.assert_allclose(one.get_center()[:2], center[:2], atol=1e-6)
        self.assertAlmostEqual(one.height, height * 0.5, places=4)
        self.assertGreater(one.height, size * 5)
        np.testing.assert_allclose(title.get_center(), title_before)
        np.testing.assert_allclose(bar.get_center(), bar_before)
        # Only crowd members clear of the title and caption lanes are drawn.
        top, bottom = title.get_bottom()[1], notes.get_top()[1]
        self.assertLess(len(lattice), 400)
        self.assertLessEqual(lattice.get_top()[1], top)
        self.assertGreaterEqual(lattice.get_bottom()[1], bottom)

    def test_lanes_and_kept_readouts_survive_manims_regrouping(self):
        # Playing an AnimationGroup makes Manim wrap the scene's mobjects in
        # an anonymous Group; lanes and kept objects must still stay put.
        scene = Scene()
        title = header("Fast light, slow electrons")
        readout = MathTex(r"0.1\,\text{mm/s}").to_edge(DOWN)
        wire = Line(LEFT * 3, RIGHT * 3)
        dot = Dot(RIGHT)
        scene.add(Group(title, readout, wire, dot))
        fixed = title.get_center().copy(), readout.get_center().copy()
        run(scene, zoom_to(scene, dot, factor=4, keep=[readout]))
        np.testing.assert_allclose(title.get_center(), fixed[0])
        np.testing.assert_allclose(readout.get_center(), fixed[1])
        self.assertAlmostEqual(wire.width, 24, places=4)
        run(scene, spotlight(scene, dot))
        self.assertAlmostEqual(title[0].get_fill_opacity(), 1.0)
        self.assertLess(wire.get_stroke_opacity(), 0.5)

    def test_zoom_out_restores_members_hidden_by_zoom_in(self):
        scene = Scene()
        lattice = crowd(400, width=4, height=3)
        one = lattice.item()
        scene.add(lattice, one)
        start = lattice.points.copy()
        run(scene, zoom_to(scene, one, factor=20, to=one.get_center()))
        self.assertLess(len(lattice), 400)
        run(scene, zoom_to(scene, one, factor=1 / 20, to=one.get_center()))
        self.assertEqual(len(lattice), 400)
        np.testing.assert_allclose(lattice.points, start, atol=1e-6)

    def test_flow_follows_its_path_through_a_zoom(self):
        scene = Scene()
        loop = Circle(radius=1)
        stream = flow(loop, count=6)
        scene.add(loop, stream)
        run(scene, zoom_to(scene, loop, factor=3))
        stream.update(0)
        radii = np.linalg.norm(stream.points[:, :2] - loop.get_center()[:2], axis=1)
        self.assertGreater(radii.min(), loop.width / 2 - 0.2)
        self.assertLess(radii.max(), loop.width / 2 + 0.2)


class AttentionTests(unittest.TestCase):
    def test_spotlight_dims_others_and_release_restores_them(self):
        scene = Scene()
        title = header("Look here")
        soft = Circle(fill_opacity=0.3, stroke_opacity=0.8).shift(LEFT * 3)
        target = Square().shift(RIGHT * 3)
        group = VGroup(target, Dot())
        scene.add(title, soft, group)
        run(scene, spotlight(scene, target, dim=0.8))
        self.assertAlmostEqual(soft.get_fill_opacity(), 0.3 * 0.2, places=6)
        self.assertAlmostEqual(soft.get_stroke_opacity(), 0.8 * 0.2, places=6)
        self.assertAlmostEqual(group[1].get_fill_opacity(), 0.2, places=6)  # a sibling inside the group
        self.assertAlmostEqual(target.get_stroke_opacity(), 1.0)
        self.assertAlmostEqual(title[0].get_fill_opacity(), 1.0)  # lanes stay lit
        run(scene, release(scene))
        self.assertAlmostEqual(soft.get_fill_opacity(), 0.3, places=6)
        self.assertAlmostEqual(soft.get_stroke_opacity(), 0.8, places=6)

    def test_explode_and_assemble_round_trip(self):
        parts = VGroup(*[Dot(RIGHT * x) for x in (-1, 0, 2)])
        before = [p.get_center().copy() for p in parts]
        run(Scene(), explode(parts, factor=1.0))
        self.assertGreater(np.linalg.norm(parts[2].get_center() - before[2]), 0.5)
        run(Scene(), assemble(parts))
        for part, center in zip(parts, before):
            np.testing.assert_allclose(part.get_center(), center, atol=1e-9)


class PropTests(unittest.TestCase):
    def test_to_scale_keeps_true_ratios_on_one_baseline(self):
        earth, sun = Circle(), Circle()
        to_scale(earth, sun, sizes=[1, 10], height=4)
        self.assertAlmostEqual(sun.height / earth.height, 10, places=4)
        self.assertAlmostEqual(earth.get_bottom()[1], sun.get_bottom()[1], places=6)

    def test_atom_fills_shells_and_honours_radius(self):
        sodium = atom(11, 12, radius=2)
        self.assertEqual([len(shell) for shell in sodium.shells], [2, 8, 1])
        self.assertEqual(len(sodium.nucleus), 23)
        self.assertAlmostEqual(sodium.orbits[-1].width / 2, 2, places=4)
        self.assertLess(sodium.nucleus.width / 2, sodium.orbits[0].width / 2)

    def test_molecule_draws_double_bonds_and_cpk_colours(self):
        co2 = molecule([("O", (-1, 0)), ("C", (0, 0)), ("O", (1, 0))], [(0, 1, 2), (1, 2, 2)])
        self.assertEqual(len(co2.bonds), 4)
        self.assertEqual(len(co2.atoms), 3)
        self.assertEqual(co2.atoms[0][0].get_fill_color().to_hex(), RED.to_hex())

    def test_die_and_person(self):
        self.assertEqual(len(die(5).pips), 5)
        figure = person(height=2)
        self.assertAlmostEqual(figure.height, 2, places=6)
        self.assertEqual(figure.submobjects, [])


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], "-v"])
