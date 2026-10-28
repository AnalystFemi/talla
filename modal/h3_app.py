"""MiniMax H3 — PRIMARY video engine, self-hosted on Modal (brief SS5).

Open weights: MiniMaxAI/MiniMax-H3 (33B, MiniMax H3 Community License).
Weights (~66GB+) download ONCE into a Modal volume in the cloud.
H3 needs multi-GPU (reference serving uses 4 GPUs); we request H100:4.
No MiniMax API key or credits are used. Context-IR / Regenerate-2K are
API-only and intentionally skipped — Muse Spark writes our context instead.

CREDIT GUARD: 768p base generation first (never 2K direct), <=15s per clip,
scaledown_window small so idle GPUs stop billing quickly.
"""
import modal

app = modal.App("talla-h3")
weights = modal.Volume.from_name("talla-h3-weights", create_if_missing=True)
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
         gpu="H100:4", timeout=1800, scaledown_window=60)
class H3Engine:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import ModularPipeline
        # Downloads weights to the Modal volume on first run (cloud only).
        self.pipe = ModularPipeline.from_pretrained("MiniMaxAI/MiniMax-H3", dtype=torch.bfloat16)
        self.pipe.to("cuda")

    @modal.method()
    def generate(self, payload: dict) -> dict:
        """payload: {scene, script:{text}, keyframe_url?, project:{name,language}}"""
        import io, time, requests
        from PIL import Image
        from diffusers.utils import export_to_video
        from r2 import upload_to_r2

        scene = payload.get("scene", {})
        line = (payload.get("script") or {}).get("text", "")
        prompt = (
            f"Photoreal UGC talking-head video, raw iPhone selfie, visible pores, natural light. "
            f"Creator says in {payload.get('project', {}).get('language', 'Nigerian Pidgin')}: \"{line}\". "
            f"Shot: {scene.get('shot', 'talking-head')}. {scene.get('visual', '')} "
            f"Negative: plastic skin, airbrushed, CGI, beauty filter, watermark."
        )
        kwargs = {"prompt": prompt, "num_frames": 121}  # ~5s @24fps, 768p first
        if payload.get("keyframe_url"):
            kwargs["image"] = Image.open(io.BytesIO(requests.get(payload["keyframe_url"]).content)).convert("RGB")
        frames = self.pipe(**kwargs).frames[0]
        raw = f"/outputs/h3_{int(time.time())}.mp4"
        export_to_video(frames, raw, fps=24)
        url = upload_to_r2(raw, f"clips/h3_{int(time.time())}.mp4")
        outputs.commit()
        return {"clip_url": url, "engine": "h3", "mode": "live"}


@app.local_entrypoint()
def main():
    print(H3Engine().generate.remote({"scene": {"shot": "talking-head"}, "script": {"text": "Test"}, "project": {"language": "pidgin"}}))
