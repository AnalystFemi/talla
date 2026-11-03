"""Seed-VC — Zero-Shot Voice Conversion on Modal GPU (talla-vc).

Transforms any native speech (Hausa, Yoruba, Igbo, Pidgin) to sound like
one of Talla's 4 locked avatar voices (Zainab, Chinenye, Tayo, Umar)
while 100% preserving native pronunciation, dialect cadence, and timing.

Reference anchors:
  - Aisha  -> Zainab   (/opt/voices/zainab.wav)
  - Funmi  -> Chinenye (/opt/voices/chinenye.wav)
  - Ebuka  -> Tayo     (/opt/voices/tayo.wav)
  - Tunde  -> Umar     (/opt/voices/umar.wav)
"""
import modal
import os

try:
    from fastapi import Header
except ImportError:
    def Header(default=None, **_):
        return default

app = modal.App("talla-vc")
weights = modal.Volume.from_name("talla-vc-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])

W = "/weights"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .uv_pip_install(
        "torch==2.3.1", "torchvision==0.18.1", "torchaudio==2.3.1",
        "scipy==1.13.1", "librosa==0.10.2", "soundfile==0.12.1",
        "transformers==4.47.1", "accelerate", "munch==4.0.0", "einops==0.8.0",
        "pydub==0.25.1", "huggingface-hub>=0.28.1", "fastapi[standard]",
        "requests", "boto3", "pyyaml", "funasr==1.1.5", "modelscope==1.18.1", "matplotlib",
        "descript-audio-codec==1.0.0", "resemblyzer"
    )
    .uv_pip_install("protobuf==4.25.8")
    .run_commands(
        "git clone --depth 1 https://github.com/Plachtaa/seed-vc.git /opt/seed-vc"
    )
    .env({"HF_HOME": f"{W}/hf"})
    .add_local_file("data/voice_census/english_zainab.wav", remote_path="/opt/voices/zainab.wav")
    .add_local_file("data/voice_census/english_chinenye.wav", remote_path="/opt/voices/chinenye.wav")
    .add_local_file("data/voice_census/english_tayo.wav", remote_path="/opt/voices/tayo.wav")
    .add_local_file("data/voice_census/english_umar.wav", remote_path="/opt/voices/umar.wav")
    .add_local_python_source("r2", "talla_common")
)

VOICE_MAP = {
    "zainab": "/opt/voices/zainab.wav",
    "chinenye": "/opt/voices/chinenye.wav",
    "tayo": "/opt/voices/tayo.wav",
    "umar": "/opt/voices/umar.wav"
}

@app.cls(image=image, volumes={W: weights, "/outputs": outputs},
         gpu="T4", timeout=300, scaledown_window=120, max_containers=4)
class VCEngine:
    @modal.enter()
    def load(self):
        import sys
        import os
        sys.path.insert(0, "/opt/seed-vc")
        os.chdir("/opt/seed-vc")
        import torch
        from seed_vc_wrapper import SeedVCWrapper
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[talla-vc] Loading SeedVCWrapper on {self.device}...")
        self.wrapper = SeedVCWrapper(device=self.device)
        print("[talla-vc] SeedVCWrapper loaded successfully!")

    @modal.method()
    def convert(self, payload: dict) -> dict:
        import time
        import soundfile as sf
        import base64
        import tempfile
        from talla_common import out_name, upload_or_volume, volume_path, safe_name

        outputs.reload()
        temp_input = None

        if payload.get("source_b64"):
            raw_bytes = base64.b64decode(payload["source_b64"])
            temp_input = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_input.write(raw_bytes)
            temp_input.close()
            src_path = temp_input.name
            src_name = "b64_audio.wav"
        elif payload.get("source_volume_path"):
            src_name = safe_name(payload["source_volume_path"])
            src_path = volume_path(src_name)
            if not os.path.exists(src_path):
                raise FileNotFoundError(f"Source audio not found on volume: {src_name}")
        else:
            raise ValueError("source_b64 or source_volume_path is required")

        tgt_voice = (payload.get("target_voice") or "zainab").lower()
        if tgt_voice in VOICE_MAP:
            tgt_path = VOICE_MAP[tgt_voice]
        elif payload.get("target_volume_path"):
            tgt_path = volume_path(safe_name(payload["target_volume_path"]))
        else:
            tgt_path = VOICE_MAP["zainab"]

        diffusion_steps = int(payload.get("diffusion_steps") or 10)
        f0_condition = bool(payload.get("f0_condition", False))

        t0 = time.time()
        print(f"[talla-vc] Converting {src_name} -> {tgt_voice} (steps={diffusion_steps})...")
        gen = self.wrapper.convert_voice(
            source=src_path,
            target=tgt_path,
            diffusion_steps=diffusion_steps,
            f0_condition=f0_condition,
            stream_output=False
        )

        converted_audio = None
        import types
        import numpy as np
        if isinstance(gen, types.GeneratorType) or hasattr(gen, '__next__'):
            try:
                while True:
                    chunk = next(gen)
                    if isinstance(chunk, tuple) and len(chunk) > 1 and chunk[1] is not None:
                        converted_audio = chunk[1]
            except StopIteration as e:
                if e.value is not None:
                    converted_audio = e.value
        else:
            converted_audio = gen

        print(f"[talla-vc] Retrieved audio: type={type(converted_audio)}")
        if isinstance(converted_audio, tuple):
            print(f"[talla-vc] unwrap tuple: len={len(converted_audio)}")
            converted_audio = converted_audio[-1]
            
        converted_audio = np.asarray(converted_audio, dtype=np.float32).squeeze()
        print(f"[talla-vc] Audio array ready: shape={converted_audio.shape}, dtype={converted_audio.dtype}")
        if converted_audio.ndim > 1:
            converted_audio = converted_audio[0]

        out_name_str = out_name(f"vc_{tgt_voice}", "wav")
        out_path = f"/outputs/{out_name_str}"
        sr = 22050 if not f0_condition else 44100
        
        # Save converted audio to outputs volume
        sf.write(out_path, converted_audio, sr)
        outputs.commit()
        outputs.commit()
        
        dur = round(len(converted_audio) / sr, 3)
        url = upload_or_volume(out_path, f"audio/{out_name_str}", "audio/wav", out_name_str)
        
        # Also return base64 for fast zero-roundtrip clients
        with open(out_path, "rb") as f_out:
            converted_b64 = base64.b64encode(f_out.read()).decode("utf-8")

        if temp_input and os.path.exists(temp_input.name):
            try:
                os.remove(temp_input.name)
            except Exception:
                pass

        elapsed = time.time() - t0
        print(f"[talla-vc] Converted in {elapsed:.2f}s -> {out_name_str} ({dur}s)")

        return {
            "converted_volume_path": out_name_str,
            "converted_url": url,
            "converted_b64": converted_b64,
            "duration_s": dur,
            "target_voice": tgt_voice,
            "engine": "seed-vc",
            "elapsed_s": round(elapsed, 2)
        }

@app.function(image=image, timeout=120, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def convert_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    from talla_common import require_token
    require_token(x_talla_token)
    if not (payload or {}).get("source_volume_path") and not (payload or {}).get("source_b64"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="source_volume_path or source_b64 is required")
    return VCEngine().convert.remote(payload)

@app.local_entrypoint()
def test():
    import base64
    print("Testing Seed-VC conversion...")
    with open("data/voice_census/hausa_hausa_female1.wav", "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    payload = {"source_b64": b64, "target_voice": "zainab", "diffusion_steps": 10}
    engine = VCEngine()
    res = engine.convert.remote(payload)
    print("Conversion result:", res.get("converted_volume_path"), "duration:", res.get("duration_s"))
