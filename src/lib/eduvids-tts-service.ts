export const EDUVIDS_TTS_SERVICE_PATH = "/home/user/eduvids_tts.py";

export function eduvidsTTSSandboxEnvironment(): Record<string, string> {
  return {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
    OPENROUTER_TTS_MODEL:
      process.env.OPENROUTER_TTS_MODEL ?? "deepgram/flux-tts:free",
    OPENROUTER_TTS_VOICE: process.env.OPENROUTER_TTS_VOICE ?? "flux-sienna-en",
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ?? "",
    DEEPGRAM_TTS_BASE_URL:
      process.env.DEEPGRAM_TTS_BASE_URL ?? "https://api.deepgram.com",
    DEEPGRAM_TTS_MODEL: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-hera-en",
    DEEPGRAM_TTS_SPEED: process.env.DEEPGRAM_TTS_SPEED ?? "1.0",
    EDUVIDS_TTS_REQUEST_TIMEOUT_SECONDS:
      process.env.EDUVIDS_TTS_REQUEST_TIMEOUT_SECONDS ?? "60",
  };
}

/**
 * English Manim Voiceover adapter written into each E2B sandbox.
 * Provider order is Deepgram Aura-2, OpenRouter Flux, then gTTS. The first
 * successful provider is locked for the complete Manim process so a video
 * cannot change speakers between narration clips.
 */
export const EDUVIDS_TTS_SERVICE_SOURCE = String.raw`from pathlib import Path
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from gtts import gTTS
from manim_voiceover.helper import remove_bookmarks
from manim_voiceover.services.base import SpeechService


LOGGER = logging.getLogger("eduvids_tts")
OPENROUTER_SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech"
LOCKED_PROVIDER = None


class EduvidsTTSService(SpeechService):
    def __init__(self, voice=None, global_speed=1.0, **kwargs):
        super().__init__(
            global_speed=global_speed,
            transcription_model=None,
            **kwargs,
        )
        self.openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        self.openrouter_model = os.environ.get(
            "OPENROUTER_TTS_MODEL", "deepgram/flux-tts:free"
        ).strip()
        self.openrouter_voice = voice or os.environ.get(
            "OPENROUTER_TTS_VOICE", "flux-miles-en"
        ).strip()
        self.deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
        self.deepgram_base_url = os.environ.get(
            "DEEPGRAM_TTS_BASE_URL", "https://api.deepgram.com"
        ).strip().rstrip("/")
        self.deepgram_model = os.environ.get(
            "DEEPGRAM_TTS_MODEL", "aura-2-hera-en"
        ).strip()
        try:
            configured_speed = float(
                os.environ.get("DEEPGRAM_TTS_SPEED", "1.0")
            )
        except ValueError:
            configured_speed = 1.0
        self.deepgram_speed = min(max(configured_speed, 0.7), 1.5)
        try:
            configured_timeout = float(
                os.environ.get("EDUVIDS_TTS_REQUEST_TIMEOUT_SECONDS", "60")
            )
        except ValueError:
            configured_timeout = 60
        self.request_timeout = min(max(configured_timeout, 5), 180)

    def _request_audio(self, request, provider):
        last_error = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(
                    request, timeout=self.request_timeout
                ) as response:
                    audio = response.read()
                    content_type = response.headers.get("Content-Type", "")
                if len(audio) < 128:
                    raise RuntimeError(provider + " returned an empty audio response")
                looks_like_mp3 = audio.startswith(b"ID3") or (
                    len(audio) > 1
                    and audio[0] == 0xFF
                    and (audio[1] & 0xE0) == 0xE0
                )
                declared_mp3 = "mpeg" in content_type.lower() or (
                    "mp3" in content_type.lower()
                )
                if not looks_like_mp3 and not declared_mp3:
                    raise RuntimeError(provider + " returned a non-MP3 response")
                return audio
            except urllib.error.HTTPError as error:
                last_error = error
                if 400 <= error.code < 500:
                    break
            except (urllib.error.URLError, TimeoutError, RuntimeError) as error:
                last_error = error

            if attempt == 0:
                time.sleep(0.25)

        status = getattr(last_error, "code", None)
        suffix = " (HTTP " + str(status) + ")" if status else ""
        raise RuntimeError(provider + " synthesis failed" + suffix) from last_error

    def _openrouter_audio(self, text):
        payload = json.dumps(
            {
                "model": self.openrouter_model,
                "input": text,
                "voice": self.openrouter_voice,
                "response_format": "mp3",
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            OPENROUTER_SPEECH_URL,
            data=payload,
            headers={
                "Authorization": "Bearer " + self.openrouter_key,
                "Content-Type": "application/json",
                "X-OpenRouter-Title": "eduvids",
            },
            method="POST",
        )
        return self._request_audio(request, "OpenRouter Flux TTS")

    def _deepgram_audio(self, text):
        api_version = "v2" if self.deepgram_model.startswith("flux-") else "v1"
        query = urllib.parse.urlencode(
            {
                "model": self.deepgram_model,
                "encoding": "mp3",
                "speed": format(self.deepgram_speed, ".2f"),
            }
        )
        request = urllib.request.Request(
            self.deepgram_base_url + "/" + api_version + "/speak?" + query,
            data=json.dumps({"text": text}).encode("utf-8"),
            headers={
                "Authorization": "Token " + self.deepgram_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        return self._request_audio(request, "Deepgram Flux TTS")

    def _provider_input_data(self, text, provider):
        input_data = {
            "input_text": text,
            "service": "eduvids-tts-v3",
            "provider": provider,
            "response_format": "mp3",
        }
        if provider == "openrouter":
            input_data.update(
                {
                    "model": self.openrouter_model,
                    "voice": self.openrouter_voice,
                }
            )
        elif provider == "deepgram":
            input_data["model"] = self.deepgram_model
            input_data["speed"] = self.deepgram_speed
        else:
            input_data["language"] = "en"
        return input_data

    def _generate_with_provider(self, provider, text, cache_root, path):
        input_data = self._provider_input_data(text, provider)
        cached = self.get_cached_result(input_data, cache_root)
        if cached is not None:
            print(
                "[eduvids-tts] provider=" + provider + " source=cache",
                flush=True,
            )
            return cached

        basename = self.get_audio_basename(input_data)
        filename = path or (basename + ".mp3")
        if not filename.lower().endswith(".mp3"):
            filename = str(Path(filename).with_suffix(".mp3"))
        output_path = cache_root / filename
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            if provider == "openrouter":
                output_path.write_bytes(self._openrouter_audio(text))
            elif provider == "deepgram":
                output_path.write_bytes(self._deepgram_audio(text))
            else:
                gTTS(text=text, lang="en").save(str(output_path))
        except Exception:
            output_path.unlink(missing_ok=True)
            raise

        if not output_path.exists() or output_path.stat().st_size < 128:
            output_path.unlink(missing_ok=True)
            raise RuntimeError(provider + " produced no usable MP3 audio")

        print(
            "[eduvids-tts] provider=" + provider + " source=generated",
            flush=True,
        )
        return {
            "input_text": text,
            "input_data": input_data,
            "original_audio": filename,
        }

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        global LOCKED_PROVIDER
        cache_root = Path(cache_dir or self.cache_dir)
        spoken_text = remove_bookmarks(text).strip()
        if not spoken_text:
            raise ValueError("Eduvids TTS received empty narration")

        if LOCKED_PROVIDER is not None:
            return self._generate_with_provider(
                LOCKED_PROVIDER, spoken_text, cache_root, path
            )

        providers = []
        if self.deepgram_key:
            providers.append("deepgram")
        if self.openrouter_key:
            providers.append("openrouter")
        providers.append("gtts")

        for provider in providers:
            try:
                result = self._generate_with_provider(
                    provider, spoken_text, cache_root, path
                )
                LOCKED_PROVIDER = provider
                print(
                    "[eduvids-tts] locked_provider=" + provider,
                    flush=True,
                )
                return result
            except Exception as error:
                if provider == "gtts":
                    raise
                LOGGER.warning("%s unavailable: %s", provider, error)

        raise RuntimeError("Eduvids TTS exhausted all providers")
`;
