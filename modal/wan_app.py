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
# LTX-2.5-Diffusers is a gated (`gated: "auto"`) Hugging Face repo: the
# container needs an HF token whose account has accepted the model terms,
# supplied via a Modal secret named `huggingface-secret` (env var HF_TOKEN).
# No secret is committed here — the secret object is resolved on Modal at
# runtime, and containers simply run without a token when it is absent
# (Wan still works; the LTX load then fails with a clear gated-repo error).
hf_secret = modal.Secret.from_name("huggingface-secret", required_keys=[])
FPS = 24

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "diffusers>=0.35.0", "transformers>=4.51.0",
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "boto3", "fastapi[standard]",
                    # ftfy/regex: CLIP text-encoder deps — missing ftfy crashed the
                    # first Funmi calibration render (NameError inside diffusers).
                    # opencv (headless): diffusers' export_to_video requires cv2 —
                    # missing cv2 crashed the first otherwise-successful render
                    # at export time (after the full denoise had completed).
                    "ftfy", "regex", "opencv-python-headless")
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


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs}, secrets=[hf_secret],
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


def _engine_health_payload() -> dict:
    """Shared by the HTTP probe and the `health_check` CLI runner below
    (`modal run modal/wan_app.py::health_check` — same probe from inside
    Modal, for when local HTTPS to *.modal.run is unavailable)."""
    import os
    import requests
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    ltx_access = None
    if token:
        try:
            r = requests.get("https://huggingface.co/api/models/Lightricks/LTX-2.5-Diffusers",
                             headers={"Authorization": f"Bearer {token}"}, timeout=20)
            ltx_access = r.status_code
        except Exception as e:
            ltx_access = f"error: {type(e).__name__}"
    return {
        "status": "ok",
        "deploy_marker": "wan-ltx25-upgrade-2026-10-29",
        "wan_checkpoint": "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        "ltx_checkpoint": LTX_CHECKPOINT,
        "hf_token_present": bool(token),
        "ltx_repo_http_status": ltx_access,
    }


@app.function(image=image, timeout=120, secrets=[hf_secret])
@modal.fastapi_endpoint(method="GET")
def engine_health() -> dict:
    """Free deployment probe (CPU container, no GPU, no model load): reports
    what this deployment WOULD load, so the studio can verify the deployed
    code matches the repo before any paid render. Also checks (read-only HF
    API metadata call) whether the container's HF token can actually see the
    gated LTX-2.5 repo — 200 means terms accepted, 401/403 means not."""
    return _engine_health_payload()


LTX_CHECKPOINT = "Lightricks/LTX-2.5-Diffusers"


@app.function(image=image, volumes={"/weights": weights, "/outputs": outputs}, secrets=[hf_secret],
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


@app.function(image=image, timeout=120, secrets=[hf_secret])
def deployed_health_check() -> dict:
    """Remote-callable mirror of the engine_health probe, invoked against the
    DEPLOYED app by name — `Function.lookup("talla-wan",
    "deployed_health_check").remote()` — so the check verifies the actual
    deployed code (and that `huggingface-secret` is attached to it), not an
    ephemeral `modal run` copy."""
    return _engine_health_payload()


@app.function(image=image, timeout=300, secrets=[hf_secret])
def deployed_compat_check() -> dict:
    """CPU-only Diffusers compatibility probe (NO model download, NO GPU):
    confirms the pinned Diffusers exposes both pipeline classes and that each
    checkpoint repo's own model_index.json declares the exact class the code
    instantiates. Catches version-skew failures before a paid GPU render."""
    import os
    import requests
    import diffusers
    from huggingface_hub import model_info
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    out = {"diffusers": getattr(diffusers, "__version__", "unknown"), "checks": {}}
    for name, repo, cls in [
        ("wan", "Wan-AI/Wan2.2-I2V-A14B-Diffusers", "WanImageToVideoPipeline"),
        ("ltx", LTX_CHECKPOINT, "LTX2ImageToVideoPipeline"),
    ]:
        papi = hasattr(diffusers, cls)
        try:
            cfg = requests.get(f"https://huggingface.co/{repo}/resolve/main/model_index.json",
                               headers={"Authorization": f"Bearer {token}"} if token else {},
                               timeout=30).json()
            declared = cfg.get("_class_name")
        except Exception as e:
            declared = f"error: {type(e).__name__}"
        try:
            gated = model_info(repo, token=token).gated
        except Exception as e:
            gated = f"error: {type(e).__name__}"
        out["checks"][name] = {"pipeline_class_available": papi, "repo_class_name": declared, "gated": gated}
    return out


@app.local_entrypoint()
def health_check():
    """CLI mirror of the engine_health probe: `modal run modal/wan_app.py`.
    NOTE: `modal run` uses an ephemeral app — it proves the repo code works
    inside Modal, but only `deployed_health_check` (remote-called by name)
    proves what the DEPLOYED app runs."""
    print(_engine_health_payload())
