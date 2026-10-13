"""Write one tone clip per narration line where the TTS adapter looks for it,
so a benchmark renders real narration timing without calling a TTS provider.

python narration.py <script.py> <prefetch_dir>   (~2.6 words a second, like Aura)
"""
import ast
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/home/user")
import eduvids_tts
from manim_voiceover.helper import remove_bookmarks

script, directory = sys.argv[1], Path(sys.argv[2])
directory.mkdir(parents=True, exist_ok=True)
service = eduvids_tts.EduvidsTTSService(cache_dir=str(directory))
for node in ast.walk(ast.parse(Path(script).read_text())):
    if isinstance(node, ast.Call) and getattr(node.func, "attr", None) == "voiceover":
        for keyword in node.keywords:
            if keyword.arg == "text":
                spoken = remove_bookmarks(" ".join(keyword.value.value.split())).strip()
                data = service._provider_input_data(spoken, "deepgram")
                target = directory / (service.get_audio_basename(data) + ".mp3")
                seconds = len(spoken.split()) / 2.6
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                                f"sine=frequency=220:sample_rate=24000:duration={seconds:.2f}",
                                "-af", "volume=0.2", "-c:a", "libmp3lame", "-b:a", "48k", str(target)], check=True)
