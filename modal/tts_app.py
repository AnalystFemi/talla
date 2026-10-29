"""Nigerian TTS on Modal (brief SS4) — verified models, per-language.

Verified 2026-10-28 (HF): the brief's SoroTTS (Orpheus LoRA) and WazobiaVoice
(gated Chatterbox) are NOT transformers-pipeline compatible. The verified
drop-in path is Meta MMS VITS per language (~40M params — runs on CPU, no GPU
queue, near-zero cost). NOTE: MMS/Soro licences are CC-BY-NC — fine for the
hackathon demo; commercial use needs a licence or a commercial TTS (see
CREDITS.md). Soro Orpheus / Wazobia remain opt-in engines for a later
natural-voice upgrade with custom loaders.
"""
import os
import modal

app = modal.App("talla-tts")
weights = modal.Volume.from_name("talla-tts-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

TTS_MODELS = {
    "pidgin": os.environ.get("TTS_PIDGIN", "facebook/mms-tts-pcm"),
    "yoruba": os.environ.get("TTS_YORUBA", "facebook/mms-tts-yor"),
    "hausa": os.environ.get("TTS_HAUSA", "facebook/mms-tts-hau"),
    "igbo": os.environ.get("TTS_IGBO", "Shinzmann/soro-tts-ibo"),
    "nigerian-english": os.environ.get("TTS_ENGLISH", "facebook/mms-tts-eng"),
    "english": os.environ.get("TTS_ENGLISH", "facebook/mms-tts-eng"),
}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "transformers>=4.51.0", "huggingface-hub",
                    "soundfile", "boto3", "fastapi[standard]")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         timeout=600, scaledown_window=30)  # CPU: tiny VITS models, no GPU queue
class NigerianTTS:
    @modal.enter()
    def load(self):
        self._pipes = {}

    def _pipe(self, language: str):
        if language not in self._pipes:
            from transformers import pipeline
            self._pipes[language] = pipeline("text-to-speech", model=TTS_MODELS[language])
        return self._pipes[language]

    @modal.method()
    def speak(self, payload: dict) -> dict:
        """payload: {text, language} -> {audio_url, engine, language, mode}"""
        import time, soundfile as sf
        from r2 import upload_to_r2
        language = (payload.get("language") or "pidgin").lower()
        if language not in TTS_MODELS:
            return {"error": f"Unsupported language: {language}", "mode": "error"}
        out = self._pipe(language)(payload["text"])
        import os
        path = f"/outputs/tts_{int(time.time())}.wav"
        sf.write(path, out["audio"], out["sampling_rate"])
        # Key must reuse the SAME basename — downstream reads /outputs/<basename>.
        url = upload_to_r2(path, f"audio/{os.path.basename(path)}", "audio/wav")
        outputs.commit()
        return {"audio_url": url, "engine": f"mms:{TTS_MODELS[language]}",
                "language": language, "mode": "live"}


@app.function(image=image, timeout=600)
@modal.fastapi_endpoint(method="POST")
def speak_http(payload: dict) -> dict:
    """HTTP entry for the Cloudflare Worker: POST {text, language}"""
    return NigerianTTS().speak.remote(payload)


@app.local_entrypoint()
def main(text: str = "Na this one finally solve am, no wahala again.", language: str = "pidgin"):
    print(NigerianTTS().speak.remote({"text": text, "language": language}))
