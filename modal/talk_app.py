"""InfiniteTalk — audio-driven talking-head video on Modal (talla-talk).

Why this exists: Wan/LTX are SILENT motion engines, so the persona's mouth
never matches the Yoruba/Pidgin line and every clip is capped near 5 s.
InfiniteTalk (MeiGen-AI, Apache-2.0) animates the keyframe FROM the voice
WAV: lips follow the audio and clip length follows the line.

Pipeline: keyframe (9:16) + YarnGPT/MMS WAV on the talla-outputs volume
-> chinese-wav2vec2 audio embedding -> InfiniteTalk (Wan2.1-I2V-14B-480P
base + InfiniteTalk audio weights + lightx2v 4-step LoRA) in streaming mode
-> 25 fps mp4 WITH the voice muxed. Stitch still normalises to 1080x1920.

Weights (~93 GB) live on the `talla-talk-weights` volume. Download them ONCE
on a cheap CPU container before the first render:
    modal run modal/talk_app.py::download
so the H100 never bills for a download.

Source pinned to commit 50aa0a9 of github.com/MeiGen-AI/InfiniteTalk; the
generate flow below mirrors its generate_infinitetalk.py single-person path.

COST: UNMEASURED until the first smoke test. H100 ~$3.95/h; the model is
cast to bf16 (~28 GB) and stays resident with T5/CLIP (no CPU offload).
"""
import modal

try:  # FastAPI is always present in-container; locally it only shapes the signature.
    from fastapi import Header
except ImportError:  # pragma: no cover
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-talk")
weights = modal.Volume.from_name("talla-talk-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
hf_secret = modal.Secret.from_name("huggingface-secret", required_keys=[])
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])

IT_COMMIT = "50aa0a94184315407a991ae804d9b58d6d311ba8"
W = "/weights"
BASE_DIR = f"{W}/Wan2.1-I2V-14B-480P"
WAV2VEC_DIR = f"{W}/chinese-wav2vec2-base"
IT_FILE = f"{W}/InfiniteTalk/single/infinitetalk.safetensors"
LORA_FILE = f"{W}/lora/Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"

FPS = 25
MAX_FRAMES = 1000           # 40 s, the upstream default ceiling
# Upstream LoRA recipe (README "Run with FusioniX or Lightx2v"): text CFG 1,
# audio CFG 2, shift 2; lightx2v needs only 4 steps.
STEPS, TEXT_CFG, AUDIO_CFG, SHIFT, MOTION_FRAME = 4, 1.0, 2.0, 2.0, 9
KEY_W, KEY_H = 720, 1280    # keyframe is fit to 9:16 so the 480p bucket is vertical

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .pip_install("torch==2.4.1", "torchvision==0.19.1", "torchaudio==2.4.1",
                 index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("xformers==0.0.28", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/"
                 "flash_attn-2.7.4.post1+cu12torch2.4cxx11abiFALSE-cp310-cp310-linux_x86_64.whl")
    .pip_install("opencv-python-headless>=4.9.0.80", "diffusers==0.32.2", "transformers==4.49.0",
                 "tokenizers>=0.20.3", "accelerate==1.1.1", "tqdm", "imageio", "imageio-ffmpeg",
                 "easydict", "ftfy", "scikit-image", "loguru", "numpy>=1.23.5,<2",
                 "xfuser==0.4.1", "pyloudnorm", "optimum-quanto==0.2.6", "decord", "einops",
                 "librosa", "soundfile", "safetensors", "huggingface-hub", "pillow", "boto3",
                 "requests", "fastapi[standard]")
    .pip_install("protobuf==4.25.8")  # same volume crash-loop pin as the other Talla apps
    .run_commands(f"git clone https://github.com/MeiGen-AI/InfiniteTalk.git /opt/it && "
                  f"cd /opt/it && git checkout {IT_COMMIT}")
    .env({"HF_HOME": f"{W}/hf"})
    .add_local_python_source("r2", "talla_common")
)


@app.function(image=image, volumes={W: weights}, secrets=[hf_secret], timeout=3 * 3600, cpu=4)
def download():
    """One-off CPU download of every weight file into the volume (idempotent)."""
    from huggingface_hub import hf_hub_download, snapshot_download
    snapshot_download("Wan-AI/Wan2.1-I2V-14B-480P", local_dir=BASE_DIR)
    snapshot_download("TencentGameMate/chinese-wav2vec2-base", local_dir=WAV2VEC_DIR)
    # README: the safetensors weights live on PR #1 of the wav2vec repo.
    hf_hub_download("TencentGameMate/chinese-wav2vec2-base", "model.safetensors",
                    revision="refs/pr/1", local_dir=WAV2VEC_DIR)
    snapshot_download("MeiGen-AI/InfiniteTalk", local_dir=f"{W}/InfiniteTalk",
                      allow_patterns=["single/infinitetalk.safetensors"])
    hf_hub_download("Kijai/WanVideo_comfy",
                    "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
                    local_dir=f"{W}/lora")
    weights.commit()
    return {"status": "ok"}


def _load_frame(payload: dict):
    """Handles keyframe_b64 or keyframe_url, returns a PIL RGB image."""
    import base64
    import io
    import requests
    from PIL import Image

    if payload.get("keyframe_b64"):
        raw = base64.b64decode(payload["keyframe_b64"])
    elif payload.get("keyframe_url"):
        raw = requests.get(payload["keyframe_url"], timeout=60).content
    else:
        raise ValueError("keyframe_b64 or keyframe_url is required")
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _audio_16k(path: str):
    """Upstream audio_prepare_single: 16 kHz mono, loudness-normalised to -23 LUFS."""
    import librosa
    import pyloudnorm as pyln
    speech, sr = librosa.load(path, sr=16000)
    loudness = pyln.Meter(sr).integrated_loudness(speech)
    if abs(loudness) <= 100:
        speech = pyln.normalize.loudness(speech, loudness, -23)
    return speech


@app.cls(image=image, volumes={W: weights, "/outputs": outputs},
         gpu="H100", timeout=1800, scaledown_window=300, max_containers=1)
class TalkEngine:
    @modal.enter()
    def load(self):
        import os
        import sys
        self.load_error = None  # same fail-fast contract as wan_app engines
        try:
            os.chdir("/opt/it")
            sys.path.insert(0, "/opt/it")
            import wan
            from wan.configs import WAN_CONFIGS
            from transformers import Wav2Vec2FeatureExtractor
            from src.audio_analysis.wav2vec2 import Wav2Vec2Model
            if not os.path.exists(IT_FILE):
                raise FileNotFoundError("weights missing: run `modal run modal/talk_app.py::download`")
            self.pipe = wan.InfiniteTalkPipeline(
                config=WAN_CONFIGS["infinitetalk-14B"], checkpoint_dir=BASE_DIR, device_id=0,
                rank=0, infinitetalk_dir=IT_FILE, lora_dir=[LORA_FILE], lora_scales=[1.0])
            self.audio_encoder = Wav2Vec2Model.from_pretrained(WAV2VEC_DIR, local_files_only=True).to("cpu")
            self.audio_encoder.feature_extractor._freeze_parameters()
            self.feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(WAV2VEC_DIR, local_files_only=True)
        except Exception as e:
            self.load_error = f"InfiniteTalk load failed: {type(e).__name__}: {str(e)[:300]}"

    def _embedding(self, speech):
        """Upstream get_embedding: wav2vec hidden states, one row per 25 fps frame."""
        import numpy as np
        import torch
        from einops import rearrange
        video_length = len(speech) / 16000 * FPS
        feat = np.squeeze(self.feature_extractor(speech, sampling_rate=16000).input_values)
        feat = torch.from_numpy(feat).float().unsqueeze(0)
        with torch.no_grad():
            emb = self.audio_encoder(feat, seq_len=int(video_length), output_hidden_states=True)
        emb = torch.stack(emb.hidden_states[1:], dim=1).squeeze(0)
        return rearrange(emb, "b s d -> s b d").cpu().detach()

    @modal.method()
    def generate(self, payload: dict) -> dict:
        """payload: {keyframe_b64|keyframe_url, audio_volume_path, prompt?}
        -> {clip_url, clip_volume_path, fps, num_frames, duration_s, has_audio, engine, mode}"""
        if self.load_error:
            raise RuntimeError(self.load_error)
        import tempfile
        import types
        import soundfile as sf
        import torch
        from PIL import Image, ImageOps
        from wan.utils.multitalk_utils import save_video_ffmpeg
        from talla_common import out_name, upload_or_volume, volume_path

        outputs.reload()  # the voice WAV was written by another app moments ago
        work = tempfile.mkdtemp()
        key = ImageOps.fit(_load_frame(payload), (KEY_W, KEY_H), method=Image.LANCZOS)
        key_path = f"{work}/key.png"
        key.save(key_path)

        speech = _audio_16k(volume_path(payload["audio_volume_path"]))
        emb_path, wav_path = f"{work}/1.pt", f"{work}/voice16k.wav"
        torch.save(self._embedding(speech), emb_path)
        sf.write(wav_path, speech, 16000)

        prompt = payload.get("prompt") or ("A Nigerian woman talking naturally to camera in a bright "
                                           "Lagos apartment, UGC selfie video, natural gestures.")
        extra = types.SimpleNamespace(use_teacache=False, teacache_thresh=0.2, size="infinitetalk-480",
                                      use_apg=False, apg_momentum=-0.75, apg_norm_threshold=55)
        video = self.pipe.generate_infinitetalk(
            {"prompt": prompt, "cond_video": key_path, "cond_audio": {"person1": emb_path},
             "video_audio": wav_path},
            size_buckget="infinitetalk-480", motion_frame=MOTION_FRAME, frame_num=81, shift=SHIFT,
            sampling_steps=STEPS, text_guide_scale=TEXT_CFG, audio_guide_scale=AUDIO_CFG,
            seed=42, offload_model=False, max_frames_num=MAX_FRAMES,
            color_correction_strength=1.0, extra_args=extra)

        name = out_name("talk", "mp4")
        save_video_ffmpeg(video, f"/outputs/{name[:-4]}", [wav_path], fps=FPS)  # appends .mp4
        outputs.commit()  # paid work is safe on the volume before the optional upload
        url = upload_or_volume(f"/outputs/{name}", f"clips/{name}", "video/mp4", name)
        frames = int(video.shape[1])
        return {"clip_url": url, "clip_volume_path": name, "fps": FPS, "num_frames": frames,
                "duration_s": round(frames / FPS, 3), "has_audio": True,
                "engine": "infinitetalk", "mode": "live"}


@app.function(image=image, timeout=120, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def generate_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """Async spawn: POST {keyframe_b64|keyframe_url, audio_volume_path, prompt?}"""
    from talla_common import require_token, safe_name
    require_token(x_talla_token)  # 401 BEFORE any spawn / GPU
    safe_name((payload or {}).get("audio_volume_path"))  # reject bad paths before the GPU starts
    call = TalkEngine().generate.spawn(payload)
    return {"call_id": call.object_id, "status": "running", "engine": "infinitetalk"}


@app.function(image=image, timeout=60, secrets=[auth_secret])
@modal.fastapi_endpoint(method="GET")
def generate_result(call_id: str = "", x_talla_token: str | None = Header(default=None)) -> dict:
    from talla_common import poll_call, require_token
    require_token(x_talla_token)
    return poll_call(call_id)


@app.function(image=image, timeout=60, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def cancel_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    from talla_common import cancel_call, require_token
    require_token(x_talla_token)
    return cancel_call((payload or {}).get("call_id"))
