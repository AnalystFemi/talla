"""Nigerian TTS on Modal (brief SS4) — verified models, per-language.

Verified 2026-10-28 (HF): the brief's SoroTTS (Orpheus LoRA) and WazobiaVoice
(gated Chatterbox) are NOT transformers-pipeline compatible. The verified
drop-in path is Meta MMS VITS per language (~40M params — runs on CPU, no GPU
queue, near-zero cost). NOTE: MMS licences are CC-BY-NC — fine for the
hackathon demo; commercial use needs a licence or a commercial TTS (see
CREDITS.md). Soro Orpheus / Wazobia remain opt-in engines for a later
natural-voice upgrade with custom loaders.

IGBO IS NOT SERVED HERE (2026-10-30): the old mapping pointed Igbo at
`Shinzmann/soro-tts-ibo`, an Orpheus LoRA that the transformers
text-to-speech pipeline cannot load — every Igbo call would have crashed
after a cold start. Igbo always routes to YarnGPT2 (talla-yarngpt, proven
igbo_female2 / igbo_male1); this app answers Igbo with a clear 400.

Every response carries ``duration_s`` (real audio length) — the Worker sizes
the clip as min(duration_s, engine cap).
"""
import os
import modal

try:  # FastAPI is always present in-container; locally it only shapes the signature.
    from fastapi import Header
except ImportError:  # pragma: no cover
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-tts")
weights = modal.Volume.from_name("talla-tts-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
# Endpoint auth (contract §4): resolved at deploy — create the secret first.
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])

TTS_MODELS = {
    "pidgin": os.environ.get("TTS_PIDGIN", "facebook/mms-tts-pcm"),
    "yoruba": os.environ.get("TTS_YORUBA", "facebook/mms-tts-yor"),
    "hausa": os.environ.get("TTS_HAUSA", "facebook/mms-tts-hau"),
    "nigerian-english": os.environ.get("TTS_ENGLISH", "facebook/mms-tts-eng"),
    "english": os.environ.get("TTS_ENGLISH", "facebook/mms-tts-eng"),
}
# Languages that must go to YarnGPT2 instead (see module docstring).
YARN_ONLY = {"igbo": "Igbo is served by YarnGPT2 (talla-yarngpt), not MMS; route it to MODAL_YARN_ENDPOINT"}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "transformers>=4.51.0", "huggingface-hub",
                    "numpy", "soundfile", "boto3", "fastapi[standard]")
    # protobuf>=6 crash-loops Modal apps that mount volumes (proven 2026-10-29).
    .uv_pip_install("protobuf==4.25.8")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2", "talla_common")
)


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         timeout=600, scaledown_window=30, max_containers=2)  # CPU: tiny VITS models, no GPU queue
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
        """payload: {text, language} -> {audio_url, audio_volume_path, duration_s, engine, language, mode}"""
        import numpy as np
        import soundfile as sf
        from talla_common import out_name, upload_or_volume
        language = (payload.get("language") or "pidgin").lower()
        if language in YARN_ONLY:
            raise ValueError(YARN_ONLY[language])
        if language not in TTS_MODELS:
            return {"error": f"Unsupported language: {language}", "mode": "error", "duration_s": 0.0}
        out = self._pipe(language)(payload["text"])
        # VITS returns (1, N) float audio; squeeze to mono (N,) so soundfile
        # does not read it as 1 frame x N channels.
        audio = np.asarray(out["audio"], dtype=np.float32).squeeze()
        if audio.ndim > 1:
            audio = audio[0]
        sr = int(out["sampling_rate"])
        duration_s = round(audio.shape[0] / sr, 3) if sr else 0.0
        name = out_name("tts", "wav")
        path = f"/outputs/{name}"
        sf.write(path, audio, sr)
        outputs.commit()  # on the volume before the optional upload
        # Key reuses the SAME basename — downstream reads /outputs/<basename>.
        url = upload_or_volume(path, f"audio/{name}", "audio/wav", name)
        # NOTE: MMS is single-speaker per language with no voice choice. If the
        # project persona's gender does not match this fixed voice, that is a
        # known limitation (flagged in the Worker) — YarnGPT2 is the routed
        # voice wherever it serves the language.
        return {"audio_url": url, "audio_volume_path": name, "duration_s": duration_s,
                "engine": f"mms:{TTS_MODELS[language]}", "voice": None,
                "language": language, "mode": "live"}


@app.function(image=image, timeout=600, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def speak_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """HTTP entry for the Cloudflare Worker: POST {text, language}"""
    from fastapi import HTTPException
    from talla_common import require_token
    require_token(x_talla_token)  # 401 before any container work
    language = str((payload or {}).get("language") or "pidgin").lower()
    if language in YARN_ONLY:
        raise HTTPException(status_code=400, detail=YARN_ONLY[language])
    if not str((payload or {}).get("text") or "").strip():
        raise HTTPException(status_code=400, detail="text is required")
    return NigerianTTS().speak.remote(payload)


@app.local_entrypoint()
def main(text: str = "Na this one finally solve am, no wahala again.", language: str = "pidgin"):
    print(NigerianTTS().speak.remote({"text": text, "language": language}))
