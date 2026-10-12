"""Offline stand-in for manim_voiceover: each block lasts as long as its
narration takes to speak (about 2.6 words per second), so beat timing in the
review renders matches production without a TTS service."""
import json
import os
from contextlib import contextmanager

from manim import Scene

WORDS_PER_SECOND = 2.6


class _Tracker:
    def __init__(self, scene, duration):
        self.scene, self.duration = scene, duration
        self.start = scene.renderer.time

    def get_remaining_duration(self, buff=0.0):
        return max(0.0, self.duration - (self.scene.renderer.time - self.start) + buff)


class VoiceoverScene(Scene):
    def set_speech_service(self, *args, **kwargs):
        pass

    @contextmanager
    def voiceover(self, text="", **kwargs):
        tracker = _Tracker(self, max(1.0, len(text.split()) / WORDS_PER_SECOND))
        yield tracker
        remaining = tracker.get_remaining_duration()
        if remaining > 0.02:
            self.wait(remaining)
        log = os.environ.get("EDUVIDS_BEAT_LOG")
        if log:  # beat boundaries, so review stills line up across variants
            with open(log, "a") as handle:
                handle.write(json.dumps({"scene": type(self).__name__, "start": tracker.start,
                                         "end": self.renderer.time}) + "\n")
