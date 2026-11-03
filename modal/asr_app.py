"""Spoken-line verify on Modal — replaces Meta Muse Voice Transcribe while the
Meta API is blocked (2026-11-01: 402 billing_not_configured).

Two open models, one L4, routed by language:
  yoruba / hausa / igbo -> facebook/mms-1b-all (Meta MMS, CC-BY-NC-4.0) with the
      yor/hau/ibo adapter. Live test 2026-11-02: Whisper turbo hallucinated
      Kazakh-script loops on a Yoruba YarnGPT line, so Whisper is NOT used here.
  english / pidgin      -> openai/whisper-large-v3-turbo (MIT), word timestamps.
Verify stays advisory: a low similarity is reported, never fatal.

POST {audio_b64, language?: "yoruba"|"hausa"|"igbo"|"english"|"pidgin"}
-> {text, words[{word,start,end}], language, model}. Same {text, words}
shape museTranscribe returned, so verifySpoken is unchanged.

Auth: X-Talla-Token (talla_common.require_token), 401 before any GPU.
COST: L4 ~$0.80/h; a 5-15 s clip is ~2 s warm => fractions of a cent.
"""
import modal

try:
    from fastapi import Header
except ImportError:  # pragma: no cover
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-asr")
weights = modal.Volume.from_name("talla-asr-weights", create_if_missing=True)
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])

CHECKPOINT = "openai/whisper-large-v3-turbo"
MMS = "facebook/mms-1b-all"
MMS_LANG = {"yoruba": "yor", "hausa": "hau", "igbo": "ibo"}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "transformers>=4.51.0", "accelerate>=1.6.0",
                    "huggingface-hub", "fastapi[standard]")
    .uv_pip_install("protobuf==4.25.8")  # see image_app.py
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("talla_common")
)


@app.cls(image=image, gpu="L4", volumes={"/weights": weights}, timeout=600,
         scaledown_window=120, max_containers=1)
class Transcriber:
    @modal.enter()
    def load(self):
        import torch
        from transformers import pipeline
        from transformers import AutoProcessor, Wav2Vec2ForCTC
        self.pipe = pipeline("automatic-speech-recognition", model=CHECKPOINT,
                             torch_dtype=torch.float16, device="cuda")
        self.mms_proc = AutoProcessor.from_pretrained(MMS)
        self.mms = Wav2Vec2ForCTC.from_pretrained(MMS).to("cuda")
        self.mms_lang = "eng"
        weights.commit()

    def _mms(self, audio: bytes, code: str) -> str:
        import torch
        from transformers.pipelines.audio_utils import ffmpeg_read
        if code != self.mms_lang:
            self.mms_proc.tokenizer.set_target_lang(code)
            self.mms.load_adapter(code)
            self.mms_lang = code
        wav = ffmpeg_read(audio, 16000)
        inputs = self.mms_proc(wav, sampling_rate=16000, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            ids = torch.argmax(self.mms(**inputs).logits, dim=-1)[0]
        return self.mms_proc.decode(ids)

    @modal.method()
    def transcribe(self, payload: dict) -> dict:
        import base64
        raw = str(payload.get("audio_b64") or "")
        if not raw:
            raise ValueError("audio_b64 required")
        audio = base64.b64decode(raw.split(",")[-1])
        name = str(payload.get("language") or "").lower()
        if name in MMS_LANG:  # no word timestamps from CTC here; text is what verify compares
            return {"text": self._mms(audio, MMS_LANG[name]).strip(), "words": [],
                    "language": MMS_LANG[name], "model": MMS}
        lang = "en" if name == "english" else None  # pidgin -> auto-detect
        kw = {"task": "transcribe", **({"language": lang} if lang else {})}
        out = self.pipe(audio, return_timestamps="word", generate_kwargs=kw)
        words = [{"word": c["text"].strip(), "start": c["timestamp"][0], "end": c["timestamp"][1]}
                 for c in out.get("chunks") or [] if c.get("text", "").strip()]
        return {"text": out.get("text", "").strip(), "words": words, "language": lang or "auto",
                "model": CHECKPOINT}


@app.function(image=image, timeout=600, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def transcribe_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """Sync: POST {audio_b64, language?} -> {text, words}"""
    from talla_common import require_token
    require_token(x_talla_token)
    return Transcriber().transcribe.remote(payload or {})
