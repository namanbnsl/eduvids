"""Show, then say: each voiceover line starts NARRATION_LEAD seconds after its
block begins, its subtitle moves with it, and the block's closing hold still
waits for the whole line, so lines never overlap and the scene ends after the
last one.

python3 tests/narration-lead.py <workdir>   (needs Manim, manim-voiceover, ffmpeg)
"""
import json
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
RATE = 16000

SCRIPT = '''
import json
import wave
from pathlib import Path
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.base import SpeechService
from eduvids_style import *


class Tone(SpeechService):
    """Clips with a length set by the text, so no TTS is needed."""

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        name = f"tone-{abs(hash(text)) % 10**8}.wav"
        target = Path(cache_dir or self.cache_dir) / name
        frames = int(16000 * len(text.split()) / 2.6)
        with wave.open(str(target), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(16000)
            out.writeframes(b"\\x00\\x40" * frames)
        return {"input_text": text, "input_data": {"input_text": text}, "original_audio": name}


class Lead(VoiceoverScene):
    def construct(self):
        self.set_speech_service(Tone())
        spans = []
        with self.voiceover(text="A circle appears on the screen right here") as tracker:
            spans.append([self.renderer.time, tracker.start_t, tracker.end_t, tracker.duration])
            self.play(FadeIn(Circle(color=PRIMARY)), run_time=0.7)
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="And then a square joins it") as tracker:
            spans.append([self.renderer.time, tracker.start_t, tracker.end_t, tracker.duration])
            self.play(pop_in(Square(color=ACCENT).shift(RIGHT * 2)), run_time=0.7)
            self.wait(max(0, tracker.get_remaining_duration()))
        Path("spans.json").write_text(json.dumps(spans))
'''

FLAGS = ["--disable_caching", "--format=mp4", "-ql"]


def clip_seconds(text):
    return int(RATE * len(text.split()) / 2.6) / RATE


def audio(path):
    import numpy as np

    out = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a", "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"]
    )
    return np.frombuffer(out, dtype=np.int16).astype(int)


def onsets(samples):
    """Start times of each run of sound after silence."""
    import numpy as np

    loud = np.abs(samples) > 1024
    starts = np.flatnonzero(loud[1:] & ~loud[:-1]) + 1
    if loud[0]:
        starts = np.insert(starts, 0, 0)
    return [start / RATE for start in starts]


class NarrationLeadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        WORK.mkdir(parents=True, exist_ok=True)
        style = STYLE.replace("__EDUVIDS_PALETTE__", "teal-amber").replace("__EDUVIDS_WATERMARK__", "eduvids")
        (WORK / "eduvids_style.py").write_text(style)
        fonts = WORK / "eduvids-fonts"
        if not fonts.exists():
            fonts.symlink_to(REPO / "src/lib/thumbnail/fonts")
        (WORK / "script.py").write_text(SCRIPT)
        env = dict(os.environ, PYTHONPATH=f"{WORK}:{os.environ.get('PYTHONPATH', '')}")
        subprocess.run(["manim", str(WORK / "script.py"), "Lead", "--media_dir", str(WORK / "media"), *FLAGS],
                       check=True, env=env, cwd=WORK,
                       stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        cls.movie = driver.scene_output(WORK / "media", "Lead")
        cls.spans = json.loads((WORK / "spans.json").read_text())
        cls.lead = 0.5
        cls.first = clip_seconds("A circle appears on the screen right here")
        cls.second = clip_seconds("And then a square joins it")

    def test_each_line_starts_after_its_picture(self):
        starts = onsets(audio(self.movie))
        self.assertEqual(len(starts), 2, starts)
        # The first line waits for the circle's fade; the second starts half a
        # second after its own block, which begins once the first line ends.
        self.assertAlmostEqual(starts[0], self.lead, delta=0.02)
        self.assertAlmostEqual(starts[1], self.lead + self.first + self.lead, delta=0.05)

    def test_trackers_cover_the_lead_and_the_whole_line(self):
        (begin1, start1, end1, duration1), (begin2, start2, end2, duration2) = self.spans
        self.assertAlmostEqual(duration1, self.lead + self.first, delta=0.01)
        self.assertAlmostEqual(end1 - start1, duration1, delta=1e-6)
        # The next beat begins once the previous line has been heard out (to
        # within the frame Manim rounds the closing wait down to).
        self.assertGreater(begin2, end1 - 1 / 15)
        self.assertAlmostEqual(duration2, self.lead + self.second, delta=0.01)

    def test_scene_ends_after_the_last_line(self):
        length = float(subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(self.movie)]).decode())
        self.assertAlmostEqual(length, 2 * self.lead + self.first + self.second, delta=0.1)

    def test_subtitles_follow_the_voice(self):
        srt = self.movie.with_suffix(".srt").read_text()
        first = srt.split("\n")[1]
        self.assertTrue(first.startswith("00:00:00,500"), srt)


if __name__ == "__main__":
    unittest.main()
