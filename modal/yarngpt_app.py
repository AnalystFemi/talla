"""YarnGPT2 — self-hosted on Modal GPU (user decision: HF first, API fallback).
saheedniyi/YarnGPT2 (Apache-2.0), Nigerian English/Yoruba/Igbo/Hausa.
Pidgin is NOT served here — Pidgin stays on MMS (user decision).
Custom loader per official repo: AudioTokenizerV2 + WavTokenizer (24kHz).
Assets are baked into the image under /opt (never a volume mount path).
"""
import modal

app = modal.App("talla-yarngpt")
weights = modal.Volume.from_name("talla-yarn-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

DEFAULT_VOICES = {  # female defaults; Studio voice picker can override
    "english": "idera", "yoruba": "yoruba_female2",
    "igbo": "igbo_female2", "hausa": "hausa_female2",
}
LANG_MAP = {"nigerian-english": "english", "english": "english",
            "yoruba": "yoruba", "igbo": "igbo", "hausa": "hausa"}

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "wget")
    .uv_pip_install("torch==2.3.1", "torchaudio==2.3.1", "transformers>=4.44.0",
                    "outetts", "uroman", "inflect", "gdown", "soundfile", "boto3", "requests")
    .run_commands(
        "git clone --depth 1 https://github.com/saheedniyi02/yarngpt.git /opt/yarngpt",
        "mkdir -p /opt/assets",
        "wget -q https://huggingface.co/novateur/WavTokenizer-medium-speech-75token/resolve/main/wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml -O /opt/assets/wavtokenizer.yaml",
        "gdown 1-ASeEkrn4HY49yZWHTASgfGFNXdVnLTt -O /opt/assets/wavtokenizer_large_speech_320_24k.ckpt",
    )
    .env({"HF_HOME": "/model_weights"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/model_weights": weights, "/outputs": outputs},
         gpu="T4", timeout=900, scaledown_window=60)
class YarnGPT:
    @modal.enter()
    def load(self):
        import sys, torch
        sys.path.insert(0, "/opt/yarngpt")
        from audiotokenizer import AudioTokenizerV2
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
        """payload: {text, language, voice?} -> {audio_url, engine, voice, mode}
        Pidgin returns an error by design (MMS serves Pidgin)."""
        import time, torchaudio
        from r2 import upload_to_r2
        lang = LANG_MAP.get((payload.get("language") or "english").lower())
        if not lang:
            return {"error": "YarnGPT does not serve this language; use MMS (Pidgin)", "mode": "error"}
        voice = payload.get("voice") or DEFAULT_VOICES[lang]
        prompt = self.tok.create_prompt(payload["text"], lang=lang, speaker_name=voice)
        input_ids = self.tok.tokenize_prompt(prompt)
        output = self.model.generate(input_ids=input_ids, temperature=0.1,
                                     repetition_penalty=1.1, max_length=4000)
        audio = self.tok.get_audio(self.tok.get_codes(output))
        path = f"/outputs/yarn_{int(time.time())}.wav"
        torchaudio.save(path, audio, sample_rate=24000)
        url = upload_to_r2(path, f"audio/yarn_{int(time.time())}.wav", "audio/wav")
        outputs.commit()
        return {"audio_url": url, "engine": "yarngpt2", "voice": voice,
                "language": payload.get("language"), "mode": "live"}


@app.local_entrypoint()
def main(text: str = "Welcome to Talla, where your product becomes a video everybody understands.",
         language: str = "nigerian-english", voice: str = ""):
    payload = {"text": text, "language": language}
    if voice:
        payload["voice"] = voice
    print(YarnGPT().speak.remote(payload))
