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
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "boto3")
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
        img = Image.open(io.BytesIO(requests.get(payload["keyframe_url"]).content)).convert("RGB")
        frames = self.pipe(image=img, prompt=payload.get("prompt", "talking naturally to camera"),
                           num_frames=81, num_inference_steps=30).frames[0]
        raw = f"/outputs/wan_{int(time.time())}.mp4"
        export_to_video(frames, raw, fps=24)
        url = upload_to_r2(raw, f"clips/wan_{int(time.time())}.mp4")
        outputs.commit()
        return {"clip_url": url, "engine": "wan", "mode": "live"}


@app.function(image=image, volumes={"/weights": weights, "/outputs": outputs},
              gpu="L4", timeout=900, scaledown_window=60)
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
    img = Image.open(io.BytesIO(requests.get(payload["keyframe_url"]).content)).convert("RGB")
    frames = pipe(image=img, prompt=payload.get("prompt", "talking naturally"),
                  num_frames=97, num_inference_steps=30).frames[0]
    raw = f"/outputs/ltx_{int(time.time())}.mp4"
    export_to_video(frames, raw, fps=24)
    url = upload_to_r2(raw, f"clips/ltx_{int(time.time())}.mp4")
    outputs.commit()
    return {"clip_url": url, "engine": "ltx", "mode": "live"}
