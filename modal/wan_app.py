"""Wan 2.2 primary + LTX-2.5 fallback — silent image-to-video on Modal.

The worker always supplies either ``keyframe_b64`` or ``keyframe_url`` plus
an explicit engine and duration in seconds. Both model families use frame
counts of the form ``4n + 1`` at 24fps, so requested durations are normalised
against their supported short-form frame caps instead of silently returning
a fixed-length clip.

Engine honesty: Wan loads the verified ``Wan-AI/Wan2.2-I2V-A14B-Diffusers``
checkpoint (``WanImageToVideoPipeline``). LTX loads the VERIFIED LTX-2.5
checkpoint ``Lightricks/LTX-2.5-Diffusers`` via ``LTX2ImageToVideoPipeline``
(user-approved direction 2026-10-29: local models Wan 2.2 + LTX 2.5). The
LTX engine reports ``ltx_checkpoint`` in its result and the worker labels it
"LTX 2.5". LTX 2.5 is a 22B-class model: it needs a large GPU (A100-80GB
class), and Talla discards its generated audio — the local Nigerian voice
(YarnGPT2/MMS) is muxed onto the picture at stitch, so the spoken words stay
exactly the script. Both engines are SILENT motion engines for Talla.
"""
import modal

app = modal.App("talla-wan")
weights = modal.Volume.from_name("talla-wan-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
FPS = 24

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "diffusers>=0.35.0", "transformers>=4.51.0",
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "boto3", "fastapi[standard]")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2")
)


def _load_frame(payload: dict):
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


def _frame_count(payload: dict, max_frames: int) -> int:
    try:
        seconds = float(payload.get("seconds") or 5)
    except (TypeError, ValueError):
        seconds = 5.0
    seconds = min(max(seconds, 1.0), 15.0)
    requested = int(round(seconds * FPS))
    # Diffusion I2V models in this family expect 4n + 1 latent-decoded
    # frame counts. Round up to the nearest valid count, then cap it.
    frames = ((requested - 1 + 3) // 4) * 4 + 1
    return max(5, min(frames, max_frames))


def _save_clip(prefix: str, frames, outputs_volume) -> dict:
    import time
    from diffusers.utils import export_to_video
    from r2 import upload_to_r2

    name = f"{prefix}_{int(time.time())}.mp4"
    path = f"/outputs/{name}"
    export_to_video(frames, path, fps=FPS)
    try:
        url = upload_to_r2(path, f"clips/{name}")
    except Exception:
        # Callers can still use clip_volume_path when R2 is not configured.
        url = f"modal-volume://talla-outputs/{name}"
    outputs_volume.commit()
    return {"clip_url": url, "clip_volume_path": name, "mode": "live"}


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         gpu="A100-80GB", timeout=1200, scaledown_window=60)
class WanEngine:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import WanImageToVideoPipeline
        self.pipe = WanImageToVideoPipeline.from_pretrained(
            "Wan-AI/Wan2.2-I2V-A14B-Diffusers", torch_dtype=torch.bfloat16)
        self.pipe.to("cuda")

    @modal.method()
    def generate(self, payload: dict) -> dict:
        # Wan 2.2's practical short-form cap here is 161 frames (~6.7s at
        # 24fps). Stitch stretches/pads picture against the real voice length.
        frames = _frame_count(payload, max_frames=161)
        img = _load_frame(payload)
        video = self.pipe(
            image=img,
            prompt=payload.get("prompt", "talking naturally to camera"),
            num_frames=frames,
            num_inference_steps=30,
        ).frames[0]
        return {**_save_clip("wan", video, outputs), "engine": "wan", "num_frames": frames}


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="POST")
def generate_http(payload: dict) -> dict:
    """Async spawn: POST {engine: wan|ltx, keyframe_b64|url, prompt, seconds}"""
    if payload.get("engine") == "ltx":
        call = ltx_generate.spawn(payload)
    else:
        call = WanEngine().generate.spawn(payload)
    return {"call_id": call.object_id, "status": "running", "engine": payload.get("engine") or "wan"}


@app.function(image=image, timeout=60)
@modal.fastapi_endpoint(method="GET")
def generate_result(call_id: str) -> dict:
    call = modal.functions.FunctionCall.from_id(call_id)
    try:
        result = call.get(timeout=0)
        return {"status": "complete", **(result or {})}
    except TimeoutError:
        return {"status": "running"}
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {str(e)[:400]}"}


LTX_CHECKPOINT = "Lightricks/LTX-2.5-Diffusers"


@app.function(image=image, volumes={"/weights": weights, "/outputs": outputs},
              gpu="A100-80GB", timeout=1200, scaledown_window=60)
def ltx_generate(payload: dict) -> dict:
    """LTX 2.5 fallback (silent motion for Talla).

    Loads the verified LTX-2.5 Diffusers checkpoint with
    ``LTX2ImageToVideoPipeline``. LTX 2.5 natively generates audio too, but
    Talla discards it: the local Nigerian voice is muxed at stitch so the
    spoken words stay exactly the script. 22B-class model — needs an
    A100-80GB-class GPU, not a T4.
    """
    import torch
    from diffusers import LTX2ImageToVideoPipeline

    pipe = LTX2ImageToVideoPipeline.from_pretrained(
        LTX_CHECKPOINT, torch_dtype=torch.bfloat16, cache_dir="/weights")
    pipe.to("cuda")
    frames = _frame_count(payload, max_frames=257)
    img = _load_frame(payload)
    out = pipe(
        image=img,
        prompt=payload.get("prompt", "talking naturally"),
        negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted",
        width=768,
        height=1344,
        num_frames=frames,
        frame_rate=FPS,
        num_inference_steps=30,
        guidance_scale=3.0,
        output_type="np",
        return_dict=False,
    )
    video = out[0] if isinstance(out, (tuple, list)) else out.frames
    return {**_save_clip("ltx", video, outputs), "engine": "ltx",
            "ltx_checkpoint": LTX_CHECKPOINT, "num_frames": frames}
