"""Wan 2.2 — co-secondary image-to-video (strongest open I2V line), plus
LTX as the guaranteed floor (already proven in the parent workspace)."""
import modal

app = modal.App("talla-wan")
weights = modal.Volume.from_name("talla-wan-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "diffusers>=0.35.0", "transformers>=4.51.0",
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "boto3", "fastapi[standard]")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         gpu="A100-80GB", timeout=1200, scaledown_window=60)
class WanEngine:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import WanImageToVideoPipeline
        self.pipe = WanImageToVideoPipeline.from_pretrained(
            "Wan-AI/Wan2.2-I2V-14B-Diffusers", torch_dtype=torch.bfloat16)
        self.pipe.to("cuda")

    @modal.method()
    def generate(self, payload: dict) -> dict:
        import io, time, requests
        from PIL import Image
        from diffusers.utils import export_to_video
        from r2 import upload_to_r2
        import base64
        raw = base64.b64decode(payload["keyframe_b64"]) if payload.get("keyframe_b64") else requests.get(payload["keyframe_url"]).content
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        frames = self.pipe(image=img, prompt=payload.get("prompt", "talking naturally to camera"),
                           num_frames=81, num_inference_steps=30).frames[0]
        raw = f"/outputs/wan_{int(time.time())}.mp4"
        export_to_video(frames, raw, fps=24)
        import os
        url = upload_to_r2(raw, f"clips/{os.path.basename(raw)}")
        outputs.commit()
        return {"clip_url": url, "engine": "wan", "mode": "live"}


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="POST")
def generate_http(payload: dict) -> dict:
    """Async spawn: POST {engine: wan|ltx, keyframe_b64|url, prompt} -> {call_id}"""
    if payload.get("engine") == "ltx":
        call = ltx_generate.spawn(payload)
    else:
        call = WanEngine().generate.spawn(payload)
    return {"call_id": call.object_id, "status": "running"}


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


@app.function(image=image, volumes={"/weights": weights, "/outputs": outputs},
              gpu="T4", timeout=900, scaledown_window=60)
def ltx_generate(payload: dict) -> dict:
    """LTX floor — reuses the parent workspace's proven LTX approach."""
    import io, time, requests, torch
    from PIL import Image
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video
    from r2 import upload_to_r2
    pipe = LTXImageToVideoPipeline.from_pretrained(
        "Lightricks/LTX-Video", torch_dtype=torch.bfloat16, cache_dir="/weights")
    pipe.to("cuda")
    import base64
    raw = base64.b64decode(payload["keyframe_b64"]) if payload.get("keyframe_b64") else requests.get(payload["keyframe_url"]).content
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    frames = pipe(image=img, prompt=payload.get("prompt", "talking naturally"),
                  num_frames=97, num_inference_steps=30).frames[0]
    raw = f"/outputs/ltx_{int(time.time())}.mp4"
    export_to_video(frames, raw, fps=24)
    import os
    url = upload_to_r2(raw, f"clips/{os.path.basename(raw)}")
    outputs.commit()
    return {"clip_url": url, "engine": "ltx", "mode": "live"}
