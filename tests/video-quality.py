"""Geometry regressions for the actual Cairo/Manim house style.

The Node test installs the palette and bundled fonts into an isolated folder.
No network, narration service, or GPU is needed.
"""
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, sys.argv.pop(1))
from manim import *
from eduvids_style import *
import eduvids_style as style


class VideoQualityTests(unittest.TestCase):
    def test_nested_labels_and_simultaneous_geometry(self):
        scene = Scene()
        line = Line(LEFT * 4, RIGHT * 4)
        a = Text("Local slope", font_size=32)
        b = Text("Instantaneous change", font_size=32)
        scene.add(VGroup(line, a, b))
        skip = style._family_ids([a])
        points, boxes = style._obstacles(scene, skip, (-7, -4, 7, 4))
        self.assertTrue(style._clear(style._glyph_boxes(a), (0, 0), points, boxes))
        self.assertGreater(np.linalg.norm(a.get_center() - b.get_center()), 0.3)

    def test_grouped_play_checks_geometry_before_labels(self):
        scene = Scene()
        line = Line(LEFT * 4, RIGHT * 4)
        label = Text("Slope", font_size=32)
        style._arrange_incoming(scene, [AnimationGroup(FadeIn(label), Create(line))])
        self.assertGreater(abs(label.get_center()[1]), label.height / 2)
        self.assertEqual(scene.mobjects, [])

    def test_labels_clear_crowd_members(self):
        # A crowd is one unstroked filled path; each member is an obstacle.
        scene = Scene()
        box = Rectangle(width=6, height=4)
        dots = crowd(300, width=5.6, height=3.6)
        scene.add(box, dots)
        label = Text("Stretching and folding", font_size=28).move_to(box.get_bottom() + UP * 0.4)
        style._arrange_incoming(scene, [Write(label)])
        members = dots.centers()
        self.assertGreater(box.get_bottom()[1] + 0.2 - label.get_top()[1], -0.25)
        self.assertFalse(any(
            label.get_left()[0] < x < label.get_right()[0] and label.get_bottom()[1] < y < label.get_top()[1]
            for x, y, _ in members
        ))

    def test_labels_clear_where_moving_geometry_ends_up(self):
        scene = Scene()
        dots = VGroup(*[Dot([x, y, 0], radius=0.05) for x in np.linspace(-3, 0, 12) for y in np.linspace(-1.5, 1.5, 8)])
        scene.add(dots)
        label = Text("Stretching", font_size=28).move_to(DOWN * 2.2)
        builder = dots.animate.shift(DOWN * 0.7).stretch(1.6, 0)
        style._arrange_incoming(scene, [builder, Write(label)])
        end = builder.mobject.target
        self.assertGreater(end.get_bottom()[1] - label.get_top()[1], 0.1)
        self.assertIs(scene.mobjects[0], dots)
        self.assertEqual(len(scene.mobjects), 1)

    def test_explicit_blocks_keep_alignment_and_axis_anchors(self):
        scene = Scene()
        title = header("Derivatives measure change")
        start = title.get_center().copy()
        axes = Axes(x_range=[-2, 2, 1], y_range=[0, 4, 1], axis_config={"include_numbers": True})
        graph = axes.plot(lambda x: x*x)
        notes = caption("A tangent measures the local rate")
        block = VGroup(Text("Rate of change", font_size=32), MathTex("f'(x)=2x", font_size=56)).arrange(DOWN, aligned_edge=LEFT, buff=0.4)
        layout_scene(VGroup(axes, graph), title=title, notes=notes, side=block)
        anchor = axes.c2p(1, 1).copy()
        children = [mob.get_center().copy() for mob in block]
        scene.add(Line(title.get_left(), title.get_right()), title, axes, graph, *block)
        np.testing.assert_allclose(title.get_center(), start)
        np.testing.assert_allclose(axes.c2p(1, 1), anchor)
        for mob, center in zip(block, children):
            np.testing.assert_allclose(mob.get_center(), center)
        self.assertAlmostEqual(block[0].get_left()[0], block[1].get_left()[0])

    def test_updater_owned_label_stays_anchored(self):
        scene = Scene()
        label = Text("Tracked point", font_size=32)
        group = VGroup(Line(LEFT * 4, RIGHT * 4), label)
        group.add_updater(lambda mob: None)
        scene.add(group)
        np.testing.assert_allclose(label.get_center(), ORIGIN)

    def test_fixed_3d_overlays_are_guarded_without_early_reveal(self):
        scene = ThreeDScene()
        scene.set_camera_orientation(phi=65 * DEGREES, theta=-45 * DEGREES)
        label = Text("Surface height", font_size=32)
        fixed_overlay(scene, label)
        self.assertNotIn(label, scene.mobjects)
        scene.add(Line(LEFT * 4, RIGHT * 4), label)
        points, boxes = style._obstacles(scene, style._family_ids([label]), (-7, -4, 7, 4))
        self.assertTrue(style._clear(style._glyph_boxes(label), (0, 0), points, boxes))
        world_label = Text("x", font_size=32).shift(RIGHT)
        start = world_label.get_center().copy()
        scene.add(world_label)
        np.testing.assert_allclose(world_label.get_center(), start)

    def test_layout_lanes_in_landscape_and_portrait(self):
        for width, height in [(14.222, 8), (8, 14.222)]:
            with tempconfig({"frame_width": width, "frame_height": height}):
                title = header("A wave in two directions")
                notes = caption("One change along each axis")
                hero = Rectangle(width=6, height=4)
                side = MathTex("z=\\sin x\\cos y", font_size=48)
                layout_scene(hero, title=title, notes=notes, side=side)
                for mob in (hero, side):
                    self.assertLess(mob.get_top()[1], title.get_bottom()[1] - 0.4)
                    self.assertGreater(mob.get_bottom()[1], notes.get_top()[1] + 0.4)
                    self.assertLess(mob.get_right()[0], width / 2 - 0.5)
                    self.assertGreater(mob.get_left()[0], -width / 2 + 0.5)
                if width > height:
                    self.assertLess(hero.get_right()[0], side.get_left()[0] - 0.5)
                else:
                    self.assertGreater(hero.get_bottom()[1], side.get_top()[1] + 0.5)

    def test_projected_3d_hero_stays_between_overlays_during_orbit(self):
        for width, height in [(14.222, 8), (8, 14.222)]:
            with tempconfig({"frame_width": width, "frame_height": height}):
                scene = ThreeDScene()
                scene.set_camera_orientation(phi=62 * DEGREES, theta=-48 * DEGREES, focal_distance=24)
                title = header("A wave in two directions")
                notes = MathTex("z=\\sin x\\cos y", font_size=48).to_edge(DOWN, buff=0.6)
                fixed_overlay(scene, title, notes)
                surface = Surface(lambda u, v: [u, v, np.sin(u) * np.cos(v)], u_range=[-3, 3], v_range=[-3, 3], resolution=(12, 12))
                place_3d_in_content(scene, surface, above=title, below=notes, orbit=16 * DEGREES)
                for theta in np.linspace(-48, -32, 9):
                    scene.camera.set_theta(theta * DEGREES)
                    scene.camera.reset_rotation_matrix()
                    points = scene.camera.project_points(surface.get_all_points())
                    self.assertLess(points[:, 1].max(), title.get_bottom()[1] - 0.25)
                    self.assertGreater(points[:, 1].min(), notes.get_top()[1] + 0.25)
                    self.assertLess(points[:, 0].max(), width / 2 - 0.4)
                    self.assertGreater(points[:, 0].min(), -width / 2 + 0.4)

    def test_3d_lorenz_keeps_depth_and_fits_between_overlays(self):
        scene = ThreeDScene()
        scene.set_camera_orientation(phi=68 * DEGREES, theta=-50 * DEGREES)
        title = header("A path that never repeats")
        fixed_overlay(scene, title)
        storm = lorenz(3000, three_d=True)
        self.assertGreater(storm.depth, 1.0)
        place_3d_in_content(scene, storm, above=title, orbit=20 * DEGREES)
        for theta in np.linspace(-50, -30, 5):
            scene.camera.set_theta(theta * DEGREES)
            scene.camera.reset_rotation_matrix()
            points = scene.camera.project_points(storm.get_all_points())
            self.assertLess(points[:, 1].max(), title.get_bottom()[1])
            self.assertGreater(points[:, 1].min(), -config.frame_height / 2 + 0.4)
            self.assertLess(np.abs(points[:, 0]).max(), config.frame_width / 2 - 0.4)

    def test_surface_has_no_contrasting_patch_grid_and_lighting_rotates(self):
        scene = ThreeDScene()
        surface = Surface(lambda u, v: [u, v, u*v], resolution=(12, 12))
        face = surface[20]
        self.assertLess(np.linalg.norm(face.get_fill_color().to_rgb() - face.get_stroke_color().to_rgb()), 0.12)
        self.assertEqual(len(face.get_fill_rgbas()), 2)
        self.assertGreater(len({part.get_fill_color().to_hex() for part in surface}), 8)
        before = (style._surface_basis(face) @ face._eduvids_normal_coefficients).T
        surface.rotate(PI / 2, axis=RIGHT)
        after = (style._surface_basis(face) @ face._eduvids_normal_coefficients).T
        self.assertGreater(np.linalg.norm(after - before), 0.5)
        lit = scene.camera.modified_rgbas(face, scene.camera.get_fill_rgbas(face))
        self.assertEqual(len(lit), 2)  # Cairo interpolates light across the patch.
        self.assertTrue(np.isfinite(lit).all())

    def test_zero_length_holds_render_nothing_instead_of_failing(self):
        # A beat's closing wait(max(0, tracker.get_remaining_duration())) is 0
        # when the animations outlast the narration; Manim 0.22 raises on it.
        scene = Scene()
        for hold in (scene.wait, scene.pause):
            self.assertIsNone(hold(0))
            self.assertIsNone(hold(-0.2))
        if hasattr(Scene, "validate_run_time"):  # Manim >= 0.22; older ones play 0 frames
            self.assertEqual(scene.renderer.num_plays, 0)
            self.assertAlmostEqual(Scene.validate_run_time(0, scene.play), 1 / config.frame_rate)
            self.assertEqual(Scene.validate_run_time(2, scene.play), 2)

    def test_intermediate_movie_keeps_the_quality_profile(self):
        from manim.scene.scene_file_writer import SceneFileWriter

        with TemporaryDirectory() as folder:
            with tempconfig({"media_dir": folder, "pixel_width": 160, "pixel_height": 90}):
                scene = Scene()
                spec = getattr(getattr(scene, "session_spec", None), "video_encoder", None)
                if spec is not None:  # Manim >= 0.22: a resolved encoder spec
                    options = dict(spec.options)
                    self.assertLessEqual(config.encoder_queue_size, style.FRAME_QUEUE)
                elif hasattr(SceneFileWriter, "open_partial_movie_stream"):
                    writer = scene.renderer.file_writer
                    writer.open_partial_movie_stream(Path(folder) / "probe.mp4")
                    options = dict(writer.video_stream.options)
                    # Stop Manim's frame-consumer thread as well as PyAV.
                    writer.close_partial_movie_stream()
                else:
                    self.skipTest("legacy FFmpeg writer (see tests/video-encoding.py)")
        # Matches the old medium/CRF 18 against a lossless render (see the
        # comment in video_style.py) at far less CPU.
        self.assertEqual(options["crf"], "16")
        self.assertEqual(options["preset"], "superfast")
        # No B-frames: x264 buffers no frames ahead (less memory).
        self.assertEqual(options["bf"], "0")

    def test_held_frames_match_frames_written_one_by_one(self):
        from manim.scene.scene_file_writer import SceneFileWriter

        if style._SegmentEncoder is None and not hasattr(SceneFileWriter, "encode_and_write_frame"):
            self.skipTest("legacy FFmpeg writer")
        import av

        rng = np.random.default_rng(1)
        frames = [rng.integers(0, 255, (90, 160, 4), dtype=np.uint8) for _ in range(2)]

        def decoded(held):
            with TemporaryDirectory() as folder:
                with tempconfig({"media_dir": folder, "pixel_width": 160, "pixel_height": 90}):
                    scene = Scene()
                    path = Path(folder) / "probe.mp4"
                    if style._SegmentEncoder is not None:  # Manim >= 0.22
                        encoder = style._SegmentEncoder(target=path, spec=scene.session_spec.video_encoder)
                        for frame in frames:
                            if held:
                                encoder.write_frame(frame.copy(), repeat=4)  # converted once, sent 4 times
                            else:  # Manim's own encoder, one frame at a time
                                for _ in range(4):
                                    style._segment_write(encoder, frame.copy(), repeat=1)
                        encoder.finish()
                    else:
                        writer = scene.renderer.file_writer
                        writer.open_partial_movie_stream(path)
                        for frame in frames:
                            if held:
                                writer.encode_and_write_frame(frame, 4)  # converted once, sent 4 times
                            else:
                                for _ in range(4):
                                    writer.encode_and_write_frame(frame, 1)
                        writer.close_partial_movie_stream()
                    with av.open(str(path)) as container:
                        return [(f.pts, f.to_ndarray().tobytes()) for f in container.decode(video=0)]

        held, single = decoded(True), decoded(False)
        self.assertEqual(len(held), 8)
        self.assertEqual([pts for pts, _ in held], sorted({pts for pts, _ in held}))
        self.assertEqual(held, single)

if __name__ == "__main__":
    unittest.main()
