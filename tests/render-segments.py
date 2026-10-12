"""A scene split into timeline segments joins into the same movie as a whole
render: the same frames at the same timestamps, with the same soundtrack.

python3 tests/render-segments.py <workdir>   (needs Manim, manim-voiceover, ffmpeg)
"""
import os
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src/lib/thumbnail"))
import render_driver as driver  # noqa: E402

WORK = Path(sys.argv.pop(1))
STYLE = (REPO / "src/lib/thumbnail/video_style.py").read_text()

SCRIPT = '''
import wave
from pathlib import Path
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.base import SpeechService
from eduvids_style import *


class Tone(SpeechService):
    """Silent-ish clips with a length set by the text, so no TTS is needed."""

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        name = f"tone-{abs(hash(text)) % 10**8}.wav"
        target = Path(cache_dir or self.cache_dir) / name
        frames = int(16000 * len(text.split()) / 2.6)
        with wave.open(str(target), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(16000)
            out.writeframes(bytes(range(256)) * (frames * 2 // 256))
        return {"input_text": text, "input_data": {"input_text": text}, "original_audio": name}


class Split(VoiceoverScene):
    def construct(self):
        self.set_speech_service(Tone())
        circle = Circle(color=PRIMARY, fill_opacity=0.3)
        square = Square(color=ACCENT)
        with self.voiceover(text="A circle appears and then it slowly turns into a square shape") as tracker:
            self.play(Create(circle), run_time=0.7)
            self.play(Transform(circle, square), run_time=max(0.4, tracker.duration * 0.4))
            self.wait(max(0, tracker.get_remaining_duration()))
        dot = Dot(color=ACCENT)
        with self.voiceover(text="Now a dot travels along the edge of the square") as tracker:
            self.play(FadeIn(dot), run_time=0.5)
            self.play(MoveAlongPath(dot, circle), run_time=max(0.4, tracker.duration * 0.6))
            self.wait(max(0, tracker.get_remaining_duration()))
        self.play(FadeOut(dot), FadeOut(circle), run_time=0.6)
        self.wait(0.3)


class Flow(Scene):
    """A dt-driven updater (a dot flowing along a path) across segment cuts."""

    def construct(self):
        path = Circle(radius=2)
        dot = Dot(color=ACCENT)
        state = {"phase": 0.0}

        def move(mob, dt):
            state["phase"] = (state["phase"] + dt * 0.37) % 1
            mob.move_to(path.point_from_proportion(state["phase"]))

        dot.add_updater(move)
        self.add(path, dot)
        self.play(Create(Square()), run_time=1.5)
        self.wait(2)
        self.play(FadeIn(Triangle()), run_time=1.2)
        self.wait(1.5)
'''

FLAGS = ["--disable_caching", "--format=mp4", "-ql"]


def timestamps(path):
    """(pts, duration) of every frame."""
    out = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v", "-f", "framemd5", "-"])
    return [tuple(line.split(",")[2:4]) for line in out.decode().splitlines() if not line.startswith("#")]


def worst_psnr(a, b):
    """Lowest per-frame PSNR between two movies. A cut inside an animation
    starts a new encoded file, so frames after it are encoded (not drawn)
    differently; the picture itself is the same."""
    out = subprocess.run(["ffmpeg", "-i", str(a), "-i", str(b), "-lavfi", "[0:v][1:v]psnr", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    value = out.rsplit("min:", 1)[1].split()[0]
    return float("inf") if value == "inf" else float(value)


def audio(path):
    import numpy as np

    out = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a", "-f", "s16le", "-ac", "1", "-"])
    return np.frombuffer(out, dtype=np.int16).astype(int)


class SegmentTests(unittest.TestCase):
    def assertSameFrames(self, joined):
        self.assertEqual(timestamps(joined), timestamps(self.whole))
        self.assertGreater(worst_psnr(joined, self.whole), 50)

    def assertSameSoundtrack(self, joined):
        # Same length and the same samples. The AAC encoder's padding of the
        # final frame may differ by a few quanta (well below -50 dBFS).
        a, b = audio(joined), audio(self.whole)
        self.assertEqual(len(a), len(b))
        self.assertLessEqual(int(abs(a - b).max()), 64)

    @classmethod
    def setUpClass(cls):
        WORK.mkdir(parents=True, exist_ok=True)
        style = STYLE.replace("__EDUVIDS_PALETTE__", "teal-amber").replace("__EDUVIDS_WATERMARK__", "eduvids")
        (WORK / "eduvids_style.py").write_text(style)
        fonts = WORK / "eduvids-fonts"
        if not fonts.exists():
            fonts.symlink_to(REPO / "src/lib/thumbnail/fonts")
        (WORK / "script.py").write_text(SCRIPT)
        cls.env = dict(os.environ, PYTHONPATH=f"{WORK}:{os.environ.get('PYTHONPATH', '')}")
        subprocess.run(["manim", str(WORK / "script.py"), "Split", "--media_dir", str(WORK / "whole"), *FLAGS],
                       check=True, env=cls.env, cwd=WORK, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        cls.whole = driver.scene_output(WORK / "whole", "Split")

    def split(self, name, bounds, scene="Split"):
        media = WORK / name
        cfg = {"script": str(WORK / "script.py"), "media_dir": str(media), "manim_args": FLAGS}
        slots = [media / f"p{index}" for index in range(2)]
        tasks = [(scene, index, len(bounds) - 1, bounds[index], bounds[index + 1]) for index in range(len(bounds) - 1)]
        self.assertEqual(driver.render(cfg, tasks, slots, self.env), [])
        driver.merge_segments(cfg, scene, len(tasks))
        return driver.scene_output(media, scene)

    def test_segments_join_into_the_whole_render(self):
        # Cuts fall inside animations (the transform and the dot's path).
        joined = self.split("segments", [0, 2.5, 5.0, 1e9])
        self.assertIsNotNone(joined)
        self.assertSameFrames(joined)
        self.assertSameSoundtrack(joined)

    def test_empty_trailing_segment_keeps_the_soundtrack(self):
        # The last span starts after the scene ends, so that segment renders
        # nothing; the one before it played to the end and has every line.
        joined = self.split("trailing", [0, 3.0, 500.0, 1e9])
        self.assertSameFrames(joined)
        self.assertSameSoundtrack(joined)


    def test_dt_updaters_keep_their_phase_across_cuts(self):
        subprocess.run(["manim", str(WORK / "script.py"), "Flow", "--media_dir", str(WORK / "flow-whole"), *FLAGS],
                       check=True, env=self.env, cwd=WORK, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        whole = driver.scene_output(WORK / "flow-whole", "Flow")
        joined = self.split("flow", [0, 1.0, 3.9, 1e9], scene="Flow")
        self.assertEqual(timestamps(joined), timestamps(whole))
        # A drifting dot would sit pixels away (well under 45 dB).
        self.assertGreater(worst_psnr(joined, whole), 50)


if __name__ == "__main__":
    unittest.main()
