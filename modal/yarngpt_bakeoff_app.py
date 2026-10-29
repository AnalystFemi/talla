"""Session B bakeoff ONLY: open YarnGPT2 quality test vs hosted references.
Separate app/file from modal/yarngpt_app.py (Session A's) — do not merge blindly.
App: talla-yarngpt-bakeoff. Zero YarnGPT API credits; Modal GPU only.
Run: modal run modal/yarngpt_bakeoff_app.py --language english
"""
import modal

app = modal.App("talla-yarngpt-bakeoff")
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

WAV_YAML = "wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml"
WAV_CKPT_URL = ("https://huggingface.co/novateur/WavTokenizer-large-speech-75token/"
                "resolve/c5512c1bd34a/wavtokenizer_large_speech_320_24k.ckpt")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "wget", "libportaudio2")
    .uv_pip_install("torch==2.3.1", "torchaudio==2.3.1", "transformers==4.47.1",
                    "outetts==0.2.3", "uroman", "inflect", "gdown", "soundfile", "boto3")
    # Modal SDK crash fix: protobuf>=6 removes Enum.ValueType used by /pkg/modal
    .uv_pip_install("protobuf==4.25.8")
    .run_commands(
        "git clone --depth 1 https://github.com/saheedniyi02/yarngpt.git /opt/yarngpt",
        "mkdir -p /opt/assets",
        f"wget -q https://huggingface.co/novateur/WavTokenizer-medium-speech-75token/resolve/main/{WAV_YAML} -O /opt/assets/wavtokenizer.yaml",
        f"wget -q {WAV_CKPT_URL} -O /opt/assets/wavtokenizer_large_speech_320_24k.ckpt",
    )
    .env({"USE_TF": "0", "TRANSFORMERS_NO_TF": "1"})
    .add_local_python_source("r2")
)

DEFAULT_VOICE = {"english": "idera", "yoruba": "yoruba_female2",
                 "igbo": "igbo_female2", "hausa": "hausa_female1"}


@app.cls(image=image, volumes={"/outputs": outputs}, gpu="T4", timeout=900, scaledown_window=60)
class YarnBakeoff:
    @modal.enter()
    def load(self):
        import sys
        sys.path.insert(0, "/opt")  # repo root IS the yarngpt package
        from yarngpt.audiotokenizer import AudioTokenizerV2
        from transformers import AutoModelForCausalLM
        self.tok = AudioTokenizerV2("saheedniyi/YarnGPT2",
                                    "/opt/assets/wavtokenizer_large_speech_320_24k.ckpt",
                                    "/opt/assets/wavtokenizer.yaml")
        self.model = AutoModelForCausalLM.from_pretrained(
            "saheedniyi/YarnGPT2", torch_dtype="auto").to(self.tok.device)

    @modal.method()
    def speak(self, payload: dict) -> dict:
        import time, torchaudio
        from r2 import upload_to_r2
        lang = payload["language"]
        voice = payload.get("voice") or DEFAULT_VOICE[lang]
        ids = self.tok.tokenize_prompt(self.tok.create_prompt(payload["text"], lang=lang, speaker_name=voice))
        out = self.model.generate(input_ids=ids, temperature=0.1, repetition_penalty=1.1, max_length=4000)
        audio = self.tok.get_audio(self.tok.get_codes(out)).float().cpu()
        if audio.dim() == 1:
            audio = audio.unsqueeze(0)
        path = f"/outputs/yarnbake_{lang}_{int(time.time())}.wav"
        torchaudio.save(path, audio, sample_rate=24000)
        url = upload_to_r2(path, f"audio/bakeoff_{lang}_{int(time.time())}.wav", "audio/wav")
        outputs.commit()
        return {"audio_url": url, "engine": "yarngpt2-open-bakeoff", "language": lang, "voice": voice}


LINES = {
    "english": "That's not a receipt. Send this instead, your logo, in ten seconds.",
    "yoruba": "Ẹ kú àárọ̀, báwo ni ọjà ṣe ń lọ lónìí?",
    "hausa": "Sannu da zuwa, ya kasuwa take tafiya yau?",
    "igbo": "Nnọọ, kedu ka ahịa si aga taa?",
}


@app.local_entrypoint()
def main(language: str = "english"):
    print(YarnBakeoff().speak.remote({"text": LINES[language], "language": language}))
