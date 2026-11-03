"""Keyframe / avatar images on Modal — fallback while Meta Muse Image is
blocked (2026-11-01: dev.meta.ai returned 402 billing_not_configured).

Model: Tongyi-MAI/Z-Image-Turbo (Apache-2.0, 6B, 8-9 step photoreal) via
diffusers ZImagePipeline on one L40S. Synchronous endpoint — a warm image is
seconds; the first cold call downloads ~20 GB of weights into the
talla-image-weights volume, later cold starts load from the volume.

POST {prompt, size?: "1024x1536", seed?, steps?} -> {image_b64 (webp), width,
height, seed, steps, model}. The Worker wraps image_b64 as a data URL, the
same shape museImage returns, so the keyframe phase is unchanged.

Also hosts keyframe QC (replaces Meta SAM 3.1, same 2026-11-01 block):
OWLv2 open-vocabulary detection on CPU — POST {image_b64|image_url, phrase}
-> {phrase, detections, boxes[{x1,y1,x2,y2,frame_w,frame_h,confidence}]},
the same shape samSegment returned, so the QC gate is unchanged.

Auth: X-Talla-Token (talla_common.require_token), 401 before any GPU.
COST: L40S ~$1.95/h; ~5-10 s warm per image => well under $0.01 each.
"""
import modal

try:  # FastAPI is always present in-container; locally it only shapes the signature.
    from fastapi import Header
except ImportError:  # pragma: no cover - deploy machine without fastapi
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-image")
weights = modal.Volume.from_name("talla-image-weights", create_if_missing=True)
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])

CHECKPOINT = "Tongyi-MAI/Z-Image-Turbo"
DETECTOR = "google/owlv2-base-patch16-ensemble"
DETECT_THRESHOLD = 0.2
STEPS = 9  # model card: 9 steps (8 DiT forwards), guidance 0 for Turbo

image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("torch==2.7.0", "diffusers>=0.36.0", "transformers>=4.51.0",
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "scipy", "fastapi[standard]")
    # protobuf>=6 crash-loops volume-mounting apps (see wan_app.py). Pin LAST.
    .uv_pip_install("protobuf==4.25.8")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("talla_common")
)


def _size(s) -> tuple[int, int]:
    """'WxH' -> multiples of 16, clamped to 512-2048 (default 1024x1536)."""
    try:
        w, h = (int(v) for v in str(s or "1024x1536").lower().split("x"))
    except ValueError:
        w, h = 1024, 1536
    fit = lambda v: max(512, min(2048, v // 16 * 16))  # noqa: E731
    return fit(w), fit(h)


@app.cls(image=image, gpu="L40S", volumes={"/weights": weights}, timeout=900,
         scaledown_window=120, max_containers=1)
class ImageEngine:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import ZImagePipeline
        self.pipe = ZImagePipeline.from_pretrained(CHECKPOINT, torch_dtype=torch.bfloat16,
                                                   cache_dir="/weights").to("cuda")
        weights.commit()

    @modal.method()
    def generate(self, payload: dict) -> dict:
        import base64, io, random
        import torch
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("prompt required")
        w, h = _size(payload.get("size"))
        seed = int(payload["seed"]) if payload.get("seed") is not None else random.randint(0, 2**31 - 1)
        steps = int(payload.get("steps") or STEPS)
        img = self.pipe(prompt=prompt, width=w, height=h, num_inference_steps=steps,
                        guidance_scale=0.0,
                        generator=torch.Generator("cuda").manual_seed(seed)).images[0]
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=92)
        return {"image_b64": base64.b64encode(buf.getvalue()).decode(), "width": w, "height": h,
                "seed": seed, "steps": steps, "model": CHECKPOINT}


@app.function(image=image, timeout=900, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def generate_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """Sync: POST {prompt, size?, seed?, steps?} -> {image_b64, ...}"""
    from talla_common import require_token
    require_token(x_talla_token)  # 401 BEFORE any GPU
    return ImageEngine().generate.remote(payload or {})


@app.cls(image=image, cpu=4.0, memory=8192, volumes={"/weights": weights}, timeout=300,
         scaledown_window=120, max_containers=1)
class Detector:
    @modal.enter()
    def load(self):
        from transformers import pipeline
        self.pipe = pipeline("zero-shot-object-detection", model=DETECTOR, device="cpu")
        weights.commit()

    @modal.method()
    def detect(self, payload: dict) -> dict:
        import base64, io
        from PIL import Image
        phrase = str(payload.get("phrase") or "person").strip()[:60]
        raw = str(payload.get("image_b64") or "")
        if not raw:
            raise ValueError("image_b64 required")
        img = Image.open(io.BytesIO(base64.b64decode(raw.split(",")[-1]))).convert("RGB")
        hits = [h for h in self.pipe(img, candidate_labels=[phrase]) if h["score"] >= DETECT_THRESHOLD]
        boxes = [{"x1": int(h["box"]["xmin"]), "y1": int(h["box"]["ymin"]), "x2": int(h["box"]["xmax"]),
                  "y2": int(h["box"]["ymax"]), "frame_w": img.width, "frame_h": img.height,
                  "confidence": round(float(h["score"]), 3)} for h in hits]
        return {"phrase": phrase, "detections": len(boxes), "boxes": boxes, "model": DETECTOR}


@app.function(image=image, timeout=300, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def detect_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """Sync: POST {image_b64, phrase} -> {phrase, detections, boxes}"""
    from talla_common import require_token
    require_token(x_talla_token)
    return Detector().detect.remote(payload or {})
