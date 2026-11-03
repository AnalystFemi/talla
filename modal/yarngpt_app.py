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
per-language speaker names (yoruba_female2, ...). Pidgin is voiced with
the English presets (the Worker sends language=english for Pidgin).
Pacing: lines are split at punctuation / [pause] tags (split_phrases).

HTTP contract (Worker): POST {text, language, voice?} + header X-Talla-Token
-> speak synchronously (TTS is seconds, no async spawn needed). Every
response carries ``duration_s`` (real audio length) so the Worker can size
the video clip to the voice: seconds = min(duration_s, engine cap). Persona gender -> voice routing
lives in worker/src/personas.js; this app just honours `voice`.
"""
import modal

try:  # FastAPI is always present in-container; locally it only shapes the signature.
    from fastapi import Header
except ImportError:  # pragma: no cover
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-yarngpt")
weights = modal.Volume.from_name("talla-yarn-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
# Endpoint auth (contract §4): resolved at deploy — create the secret first.
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])
SAMPLE_RATE = 24000  # WavTokenizer large_speech_320_24k output rate

WAV_YAML = "wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml"
WAV_CKPT_URL = ("https://huggingface.co/novateur/WavTokenizer-large-speech-75token/"
                "resolve/c5512c1bd34a/wavtokenizer_large_speech_320_24k.ckpt")

LANG_MAP = {"nigerian-english": "english", "english": "english",
            "yoruba": "yoruba", "igbo": "igbo", "hausa": "hausa"}

# Fallback when the caller passes no voice (Worker normally passes one).
DEFAULT_VOICES = {
    "english": {"female": "idera", "male": "jude"},
    "yoruba": {"female": "yoruba_female2", "male": "yoruba_male1"},
    "igbo": {"female": "igbo_female2", "male": "igbo_male2"},  # no igbo_male1 upstream
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
    .add_local_python_source("r2", "talla_common")
)

# Pacing: YarnGPT's process_text strips ALL punctuation, so a whole line came
# out as one breathless run ("mumbled together", user 2026-11-02). Each phrase
# is now voiced on its own and joined with a real pause. Scripts may also say
# [pause] (0.6 s) or [long pause] (1.0 s) for a deliberate beat.
PAUSE_TAG = {"pause": 0.6, "long pause": 1.0, "beat": 0.4}
PAUSE_AFTER = {".": 0.38, "!": 0.38, "?": 0.42, ",": 0.18, ";": 0.24, ":": 0.24, "—": 0.24, "…": 0.5}


def split_phrases(text: str, min_words: int = 3) -> list:
    """'Abeg, this cream don change my skin. [pause] I no dey lie you.' ->
    [('Abeg this cream don change my skin', 0.6), ('I no dey lie you', 0.0)].
    Phrases under min_words merge forward (one-word takes are the ones that
    clip), keeping the longer pause. Pure function — unit-testable locally."""
    import re
    parts, buf = [], ""
    for tok in re.split(r"(\[[^\]]*\]|\.\.\.|[.!?,;:—…])", str(text or "")):
        if not tok:
            continue
        tag = tok.strip("[] ").lower() if tok.startswith("[") else None
        pause = PAUSE_TAG.get(tag, 0.4) if tag is not None else PAUSE_AFTER.get("…" if tok == "..." else tok)
        if pause is None:
            buf += tok
            continue
        if buf.strip():
            parts.append([buf.strip(), pause])
        elif parts:
            parts[-1][1] = max(parts[-1][1], pause)
        buf = ""
    if buf.strip():
        parts.append([buf.strip(), 0.0])
    merged = []
    for phrase, pause in parts:
        if merged and len(merged[-1][0].split()) < min_words:
            merged[-1][0] += " " + phrase
            merged[-1][1] = pause
        else:
            merged.append([phrase, pause])
    if len(merged) > 1 and len(merged[-1][0].split()) < min_words:
        last = merged.pop()
        merged[-1] = [merged[-1][0] + " " + last[0], last[1]]
    return [(p, round(z, 2)) for p, z in merged] or [(str(text or "").strip(), 0.0)]


def trim_silence(a, sr: int, thresh: float = 0.02, keep_s: float = 0.04):
    """Cut the model's leading/trailing silence so OUR pauses set the rhythm."""
    import torch
    env = a.abs().max(dim=0).values
    idx = torch.nonzero(env > thresh * (env.max() + 1e-9)).flatten()
    if len(idx) == 0:
        return a
    keep = int(sr * keep_s)
    return a[:, max(0, int(idx[0]) - keep): min(a.shape[-1], int(idx[-1]) + keep)]


@app.cls(image=image, volumes={"/model_weights": weights, "/outputs": outputs},
         gpu="T4", timeout=900, scaledown_window=60, max_containers=1)
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
        -> {audio_url, audio_volume_path, duration_s, engine, voice, language, mode}
        Pidgin returns an error by design (MMS serves Pidgin)."""
        import torchaudio
        from talla_common import out_name, upload_or_volume
        lang = LANG_MAP.get((payload.get("language") or "english").lower())
        if not lang:
            return {"error": "YarnGPT does not serve this language; use MMS (Pidgin)",
                    "mode": "error", "duration_s": 0.0}
        gender = (payload.get("gender") or "female").lower()
        voice = payload.get("voice") or DEFAULT_VOICES[lang].get(gender, DEFAULT_VOICES[lang]["female"])
        # max_new_tokens, NOT max_length: the speaker prompt (reference audio
        # codes) already fills most of a 4000-token max_length, which silently
        # truncated every line to ~1-2 s (tone-marked Yoruba worst: longer
        # prompt, less room). ~75 codes/s -> 3000 new tokens is ~40 s of speech.
        # do_sample=True: without it temperature is ignored and decoding is
        # greedy, so a voice+line pair that stops early (live 2026-11-02: onye
        # Pidgin 1.24s for 12 words) stops early on EVERY retry. With sampling,
        # re-roll short takes (<0.18 s/word) up to 3x and keep the longest.
        import torch
        phrases = split_phrases(payload["text"])
        pieces, takes = [], 0
        for phrase, pause in phrases:
            ids = self.tok.tokenize_prompt(
                self.tok.create_prompt(phrase, lang=lang, speaker_name=voice))
            words = max(1, len(phrase.split()))
            best = None
            for t in range(1, 5):
                takes += 1
                output = self.model.generate(input_ids=ids, do_sample=True, temperature=0.1,
                                             repetition_penalty=1.1, max_new_tokens=3000)
                a = self.tok.get_audio(self.tok.get_codes(output)).float().cpu()
                if a.dim() == 1:
                    a = a.unsqueeze(0)
                a = trim_silence(a, SAMPLE_RATE)
                if best is None or a.shape[-1] > best.shape[-1]:
                    best = a
                if best.shape[-1] / SAMPLE_RATE >= words * 0.24:  # per phrase: stricter than whole-line
                    break
            fade = min(240, best.shape[-1] // 4)  # 10 ms fades: no clicks at joins
            if fade:
                ramp = torch.linspace(0, 1, fade)
                best[:, :fade] *= ramp
                best[:, -fade:] *= ramp.flip(0)
            pieces.append(best)
            if pause and phrase != phrases[-1][0]:  # no dead air after the last phrase
                pieces.append(torch.zeros(best.shape[0], int(SAMPLE_RATE * pause)))
        audio = torch.cat(pieces, dim=-1)
        duration_s = round(audio.shape[-1] / SAMPLE_RATE, 3)
        name = out_name("yarn", "wav")
        path = f"/outputs/{name}"
        torchaudio.save(path, audio, sample_rate=SAMPLE_RATE)
        outputs.commit()  # GPU work is safe on the volume before the optional upload
        url = upload_or_volume(path, f"audio/{name}", "audio/wav", name)
        return {"audio_url": url, "audio_volume_path": name, "duration_s": duration_s,
                "engine": "yarngpt2",
                "voice": voice, "language": payload.get("language"), "mode": "live", "takes": takes,
                "phrases": len(phrases)}


@app.function(image=image, timeout=600, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def speak_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """HTTP entry for the Cloudflare Worker: POST {text, language, voice?}"""
    from talla_common import require_token
    require_token(x_talla_token)  # 401 before the GPU class is touched
    if not str((payload or {}).get("text") or "").strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="text is required")
    return YarnGPT().speak.remote(payload)


@app.local_entrypoint()
def main(text: str = "Welcome to Talla, where your product becomes a video everybody understands.",
         language: str = "nigerian-english", voice: str = ""):
    payload = {"text": text, "language": language}
    if voice:
        payload["voice"] = voice
    print(YarnGPT().speak.remote(payload))
