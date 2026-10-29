"""YarnGPT2 — self-hosted Nigerian voice on Modal GPU (talla-yarngpt).

saheedniyi/YarnGPT2 (Apache-2.0). Loader/provenance: this file adopts the
bakeoff app (modal/yarngpt_bakeoff_app.py), the one combination proven to
run 2026-10-29 (open english/yoruba/hausa/igbo WAVs in
data/tts_bakeoff/open/). Key proven fixes carried over:
  (1) protobuf==4.25.8 pin (protobuf>=6 crash-loops Modal volume apps),
  (2) sys.path includes /opt (the cloned repo root IS the yarngpt package),
  (3) apt wget + libportaudio2.

Voices: English/Nigerian-English uses the model's 12 named preset voices
(6 female / 6 male, per the upstream README). Local languages use the
per-language speaker names (yoruba_female2, ...). Pidgin is NOT served
here — Pidgin stays on MMS (user decision); the app says so honestly.

HTTP contract (Worker): POST {text, language, voice?} -> speak synchronously
(TTS is seconds, no async spawn needed). Persona gender -> voice routing
lives in worker/src/personas.js; this app just honours `voice`.
"""
import modal

app = modal.App("talla-yarngpt")
weights = modal.Volume.from_name("talla-yarn-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

WAV_YAML = "wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml"
WAV_CKPT_URL = ("https://huggingface.co/novateur/WavTokenizer-large-speech-75token/"
                "resolve/c5512c1bd34a/wavtokenizer_large_speech_320_24k.ckpt")

LANG_MAP = {"nigerian-english": "english", "english": "english",
            "yoruba": "yoruba", "igbo": "igbo", "hausa": "hausa"}

# Fallback when the caller passes no voice (Worker normally passes one).
DEFAULT_VOICES = {
    "english": {"female": "idera", "male": "jude"},
    "yoruba": {"female": "yoruba_female2", "male": "yoruba_male1"},
    "igbo": {"female": "igbo_female2", "male": "igbo_male1"},
    "hausa": {"female": "hausa_female2", "male": "hausa_male1"},
}

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "wget", "libportaudio2")
    .uv_pip_install("torch==2.3.1", "torchaudio==2.3.1", "transformers==4.47.1",
                    "outetts==0.2.3", "uroman", "inflect", "gdown", "soundfile",
                    "boto3", "requests", "fastapi[standard]")
    .uv_pip_install("protobuf==4.25.8")  # proven fix (1)
    .run_commands(
        "git clone --depth 1 https://github.com/saheedniyi02/yarngpt.git /opt/yarngpt",
        "mkdir -p /opt/assets",
        f"wget -q https://huggingface.co/novateur/WavTokenizer-medium-speech-75token/resolve/main/{WAV_YAML} -O /opt/assets/wavtokenizer.yaml",
        f"wget -q {WAV_CKPT_URL} -O /opt/assets/wavtokenizer_large_speech_320_24k.ckpt",
    )
    .env({"HF_HOME": "/model_weights", "USE_TF": "0", "TRANSFORMERS_NO_TF": "1"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/model_weights": weights, "/outputs": outputs},
         gpu="T4", timeout=900, scaledown_window=60)
class YarnGPT:
    @modal.enter()
    def load(self):
        import sys
        sys.path.insert(0, "/opt")  # proven fix (2): repo root is the package
        from yarngpt.audiotokenizer import AudioTokenizerV2
        from transformers import AutoModelForCausalLM
        self.tok = AudioTokenizerV2(
            "saheedniyi/YarnGPT2",
            "/opt/assets/wavtokenizer_large_speech_320_24k.ckpt",
            "/opt/assets/wavtokenizer.yaml",
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            "saheedniyi/YarnGPT2", torch_dtype="auto").to(self.tok.device)

    @modal.method()
    def speak(self, payload: dict) -> dict:
        """payload: {text, language, voice?, gender?}
        -> {audio_url, audio_volume_path, engine, voice, language, mode}
        Pidgin returns an error by design (MMS serves Pidgin)."""
        import time, torchaudio, os
        from r2 import upload_to_r2
        lang = LANG_MAP.get((payload.get("language") or "english").lower())
        if not lang:
            return {"error": "YarnGPT does not serve this language; use MMS (Pidgin)", "mode": "error"}
        gender = (payload.get("gender") or "female").lower()
        voice = payload.get("voice") or DEFAULT_VOICES[lang].get(gender, DEFAULT_VOICES[lang]["female"])
        ids = self.tok.tokenize_prompt(
            self.tok.create_prompt(payload["text"], lang=lang, speaker_name=voice))
        output = self.model.generate(input_ids=ids, temperature=0.1,
                                     repetition_penalty=1.1, max_length=4000)
        audio = self.tok.get_audio(self.tok.get_codes(output)).float().cpu()
        if audio.dim() == 1:
            audio = audio.unsqueeze(0)
        name = f"yarn_{int(time.time())}.wav"
        path = f"/outputs/{name}"
        torchaudio.save(path, audio, sample_rate=24000)
        url = upload_to_r2(path, f"audio/{name}", "audio/wav")
        outputs.commit()
        return {"audio_url": url, "audio_volume_path": name, "engine": "yarngpt2",
                "voice": voice, "language": payload.get("language"), "mode": "live"}


@app.function(image=image, timeout=600)
@modal.fastapi_endpoint(method="POST")
def speak_http(payload: dict) -> dict:
    """HTTP entry for the Cloudflare Worker: POST {text, language, voice?}"""
    return YarnGPT().speak.remote(payload)


@app.local_entrypoint()
def main(text: str = "Welcome to Talla, where your product becomes a video everybody understands.",
         language: str = "nigerian-english", voice: str = ""):
    payload = {"text": text, "language": language}
    if voice:
        payload["voice"] = voice
    print(YarnGPT().speak.remote(payload))
