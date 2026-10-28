"""Nigerian TTS — SoroTTS / WazobiaVoice, open weights on Modal (brief SS4).
Priority 1. YarnGPT is API-only fallback and is NOT used unless these fail.
Weights download once into a Modal volume (cloud only, >5MB rule)."""
import os
import modal

app = modal.App("talla-tts")
weights = modal.Volume.from_name("talla-tts-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

# Confirm exact HF repo IDs at deploy time (see CREDITS.md checklist):
TTS_MODELS = {
    "soro": os.environ.get("SORO_TTS_MODEL", "Shinzmann/SoroTTS"),
    "wazobia": os.environ.get("WAZOBIA_MODEL", "Axiveri/WazobiaVoice"),
}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "transformers>=4.51.0", "huggingface-hub",
                    "soundfile", "boto3")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         gpu="L4", timeout=600, scaledown_window=60)
class NigerianTTS:
    @modal.enter()
    def load(self):
        # Lazy per-engine load kept in speak(); enter() just warms the volume.
        self._pipes = {}

    def _pipe(self, engine: str):
        if engine not in self._pipes:
            from transformers import pipeline
            self._pipes[engine] = pipeline("text-to-speech", model=TTS_MODELS[engine], device="cuda")
        return self._pipes[engine]

    @modal.method()
    def speak(self, payload: dict) -> dict:
        """payload: {text, language, engine?} -> {audio_url, engine}"""
        import time, soundfile as sf
        from r2 import upload_to_r2
        engine = payload.get("engine", "soro")
        out = self._pipe(engine)(payload["text"])
        path = f"/outputs/tts_{int(time.time())}.wav"
        sf.write(path, out["audio"], out["sampling_rate"])
        url = upload_to_r2(path, f"audio/tts_{int(time.time())}.wav", "audio/wav")
        outputs.commit()
        return {"audio_url": url, "engine": engine, "language": payload.get("language"), "mode": "live"}


@app.local_entrypoint()
def main(text: str = "Na this one finally solve am, no wahala again.", language: str = "pidgin"):
    print(NigerianTTS().speak.remote({"text": text, "language": language}))
