"""Exercise the house encoding hook against both Manim writer APIs.

Only Python's standard library is needed, so this regression runs even when
the local Manim/LaTeX toolchain is unavailable.
"""
import ast
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


tree = ast.parse(Path(sys.argv.pop(1)).read_text())
# Execute the actual import-time encoding hook with small writer fixtures.
def assignment_index(name):
    return next(
        i for i, node in enumerate(tree.body)
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == name for t in node.targets)
    )


start, end = assignment_index("_open_stream"), assignment_index("WATERMARK")
hook = compile(ast.Module(body=tree.body[start:end], type_ignores=[]), "video_style.py", "exec")


class EncodingCompatibilityTests(unittest.TestCase):
    def test_legacy_ffmpeg_writer_needs_no_pyav_hook(self):
        class Writer:
            def open_movie_pipe(self, file_path=None):
                return file_path

        original = Writer.open_movie_pipe
        exec(hook, {"SceneFileWriter": Writer})
        self.assertIs(Writer.open_movie_pipe, original)
        self.assertFalse(hasattr(Writer, "open_partial_movie_stream"))
        self.assertEqual(Writer().open_movie_pipe("probe.mp4"), "probe.mp4")

    def test_pyav_quality_preserves_other_codecs_and_stream_options(self):
        for codec in ("libx264", "qtrle", None):
            with self.subTest(codec=codec):
                calls = []

                class Writer:
                    def open_partial_movie_stream(self, *args, **kwargs):
                        calls.append((args, kwargs))
                        if codec is not None:
                            self.video_stream = SimpleNamespace(
                                codec_context=SimpleNamespace(name=codec),
                                options={"crf": "23", "preset": "medium"},
                            )
                        return "opened"

                exec(hook, {"SceneFileWriter": Writer})
                wrapped = Writer.open_partial_movie_stream
                # A second module import must not wrap the hook again.
                exec(hook, {"SceneFileWriter": Writer})
                self.assertIs(Writer.open_partial_movie_stream, wrapped)
                writer = Writer()
                self.assertEqual(
                    writer.open_partial_movie_stream("probe.mp4", flag=True), "opened"
                )
                self.assertEqual(calls, [(("probe.mp4",), {"flag": True})])
                if codec is not None:
                    self.assertEqual(
                        writer.video_stream.options,
                        {"crf": "16", "preset": "superfast", "bf": "0"} if codec == "libx264"
                        else {"crf": "23", "preset": "medium"},
                    )

    def test_frame_queue_is_bounded(self):
        from queue import Queue

        class Writer:
            def open_partial_movie_stream(self, *args, **kwargs):
                self.video_stream = SimpleNamespace(codec_context=SimpleNamespace(name="libx264"), options={})
                self.queue = Queue()

        exec(hook, {"SceneFileWriter": Writer})
        writer = Writer()
        writer.open_partial_movie_stream()
        # Manim's queue is unbounded; at 8 MB a 1080p frame that held ~1 GB.
        self.assertGreater(writer.queue.maxsize, 0)
        self.assertLessEqual(writer.queue.maxsize, 8)


if __name__ == "__main__":
    unittest.main()
