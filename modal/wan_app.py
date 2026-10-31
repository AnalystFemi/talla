"""Wan 2.2 primary + LTX-2.5 fallback — silent image-to-video on Modal.

The worker always supplies either ``keyframe_b64`` or ``keyframe_url`` plus
an explicit engine and duration in seconds. Each engine has its OWN native
frame grid (owner decision, contract 2026-10-30):

  Wan 2.2 A14B: 720x1280 vertical (width=720, height=1280), 16 fps native,
                frames 4n+1, cap 81 (~5.06 s). Seconds clamp 1-5.0.
  LTX 2.5:      768x1344 vertical, 24 fps, frames 8n+1, cap 257 (~10.7 s).
                Seconds clamp 1-10.6.

The Worker sizes ``seconds = min(voice duration_s, engine cap)``; stitch
normalises every clip to 1080x1920 @ 24 fps and pads picture to the voice.

Engine honesty: Wan loads the verified ``Wan-AI/Wan2.2-I2V-A14B-Diffusers``
checkpoint (``WanImageToVideoPipeline``). LTX loads the VERIFIED LTX-2.5
checkpoint ``Lightricks/LTX-2.5-Diffusers`` via ``LTX2ImageToVideoPipeline``
(user-approved direction 2026-10-29: local models Wan 2.2 + LTX 2.5). The
LTX engine reports ``ltx_checkpoint`` in its result and the worker labels it
"LTX 2.5". LTX 2.5 is a 22B-class model: it needs a large GPU (A100-80GB
class), and Talla discards its generated audio — the local Nigerian voice
(YarnGPT2/MMS) is muxed onto the picture at stitch, so the spoken words stay
exactly the script. Both engines are SILENT motion engines for Talla.

Auth: every web endpoint requires X-Talla-Token (see talla_common.py);
401 happens before any spawn, so no GPU is ever started for a bad caller.

COST (UNCALIBRATED ESTIMATE — no live 720p render has been timed yet):
Modal H100 is ~$3.95/h (~$0.0011/s). Wan2.2 A14B at 720x1280, 81 frames,
40 steps on one H100 is expected at roughly 10-25 min of denoise, plus a
~5-8 min cold load of ~70 GB of bf16 weights from the volume when the
container is cold => roughly $0.70-$1.65 per warm clip, up to ~$2.20 cold.
max_containers=1 caps parallel spend at ONE H100; scaledown_window=300
keeps it warm between scenes of one film, then parks to $0. Replace these
numbers with the first calibration run's measured wall time.
"""
import modal

try:  # FastAPI is always present in-container; locally it only shapes the signature.
    from fastapi import Header
except ImportError:  # pragma: no cover - deploy machine without fastapi
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-wan")
weights = modal.Volume.from_name("talla-wan-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
# LTX-2.5-Diffusers is a gated (`gated: "auto"`) Hugging Face repo: the
# container needs an HF token whose account has accepted the model terms,
# supplied via the Modal secret `huggingface-secret` (env var HF_TOKEN).
# No token is committed here. NOTE: Secret.from_name is resolved at DEPLOY
# time — if `huggingface-secret` does not exist in the workspace, `modal
# deploy` FAILS (it does not silently run tokenless). `required_keys=[]`
# only means no specific key is enforced inside the secret. The secret
# already exists (created Session C round 3).
hf_secret = modal.Secret.from_name("huggingface-secret", required_keys=[])
# Endpoint auth (contract §4). Also resolved at deploy: deploy fails until
# the lead creates `talla-endpoint-auth` with key TALLA_ENDPOINT_TOKEN.
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])

WAN_CHECKPOINT = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
LTX_CHECKPOINT = "Lightricks/LTX-2.5-Diffusers"

# Per-engine native grids (see module docstring).
WAN_W, WAN_H, WAN_FPS, WAN_STEP, WAN_MAX_FRAMES, WAN_MAX_SECONDS = 720, 1280, 16, 4, 81, 5.0
LTX_W, LTX_H, LTX_FPS, LTX_STEP, LTX_MAX_FRAMES, LTX_MAX_SECONDS = 768, 1344, 24, 8, 257, 10.6

# Diffusers Wan2.2 I2V A14B reference: guidance_scale 3.5, 40 steps. We keep
# steps in 30-40 (payload may ask for a cheaper 30-step draft).
WAN_STEPS_DEFAULT, WAN_STEPS_MIN, WAN_STEPS_MAX, WAN_GUIDANCE = 40, 30, 40, 3.5
WAN_NEGATIVE = ("worst quality, low quality, blurry, static frame, jitter, distorted face, "
                "deformed hands, extra fingers, watermark, subtitles, text overlay")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install("torch==2.7.0", "diffusers>=0.35.0", "transformers>=4.51.0",
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "numpy", "boto3",
                    "requests", "fastapi[standard]",
                    # ftfy/regex: CLIP text-encoder deps — missing ftfy crashed the
                    # first Funmi calibration render (NameError inside diffusers).
                    # opencv (headless): diffusers' export_to_video requires cv2 —
                    # missing cv2 crashed the first otherwise-successful render
                    # at export time (after the full denoise had completed).
                    "ftfy", "regex", "opencv-python-headless")
    # protobuf>=6 (pulled in by the ML stack) removes Enum.ValueType and
    # crash-loops ANY Modal app that mounts volumes (proven on talla-yarngpt,
    # SESSION_COORDINATION 2026-10-29). Pin LAST so it wins the resolve.
    .uv_pip_install("protobuf==4.25.8")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2", "talla_common")
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


def _fit_cover(img, width: int, height: int):
    """Scale-to-cover + center-crop to the exact render canvas. Feeding the
    raw 1280x1920 keyframe lets the pipeline pick its own size/aspect (and
    wastes VRAM); the conditioning image must match the output grid."""
    from PIL import Image, ImageOps
    return ImageOps.fit(img, (width, height), method=Image.LANCZOS, centering=(0.5, 0.5))


def _frame_count(payload: dict, fps: int, step: int, max_frames: int, max_seconds: float) -> int:
    """seconds -> frame count on the engine's grid (step*n + 1), capped.
    Seconds are clamped per engine first, so a 9 s request on Wan becomes
    81 frames (~5.06 s at 16 fps), never a silent fixed-length surprise."""
    try:
        seconds = float(payload.get("seconds") or max_seconds)
    except (TypeError, ValueError):
        seconds = max_seconds
    seconds = min(max(seconds, 1.0), max_seconds)
    requested = int(round(seconds * fps))
    frames = ((requested - 1 + step - 1) // step) * step + 1  # round UP onto the grid
    return max(step + 1, min(frames, max_frames))


def wan_frames(payload: dict) -> int:
    return _frame_count(payload, WAN_FPS, WAN_STEP, WAN_MAX_FRAMES, WAN_MAX_SECONDS)


def ltx_frames(payload: dict) -> int:
    return _frame_count(payload, LTX_FPS, LTX_STEP, LTX_MAX_FRAMES, LTX_MAX_SECONDS)


def _wan_steps(payload: dict) -> int:
    try:
        steps = int(payload.get("num_inference_steps") or WAN_STEPS_DEFAULT)
    except (TypeError, ValueError):
        steps = WAN_STEPS_DEFAULT
    return min(max(steps, WAN_STEPS_MIN), WAN_STEPS_MAX)


def _first_video(out):
    """Pick ONE video's frames out of a pipeline result, whatever the shape:
    tuple/list (video, audio) from return_dict=False, an output object with
    .frames, a batched np array (B, F, H, W, C) or an unbatched (F, H, W, C),
    or a list of per-video frame lists. The old code passed the whole batch
    to export_to_video, which treats each VIDEO as a frame."""
    video = out
    if isinstance(out, tuple):  # return_dict=False -> (video, audio)
        video = out[0]
    elif hasattr(out, "frames"):
        video = out.frames
    ndim = getattr(video, "ndim", None)
    if ndim == 5:  # (B, F, H, W, C) batched np output -> first video
        return video[0]
    if ndim == 4:  # (F, H, W, C) already one video
        return video
    if isinstance(video, list) and video:
        first = video[0]
        fnd = getattr(first, "ndim", None)
        if fnd == 5:  # [video_batch, audio] returned as a list
            return first[0]
        if fnd == 4 or isinstance(first, list):  # list of videos
            return first
    return video  # list of (H, W, C) frames: already one video


def _save_clip(prefix: str, frames, fps: int, outputs_volume) -> dict:
    from diffusers.utils import export_to_video
    from talla_common import out_name, upload_or_volume

    name = out_name(prefix, "mp4")
    path = f"/outputs/{name}"
    export_to_video(frames, path, fps=fps)
    # Commit FIRST: the clip is paid work and must be on the volume even if
    # the optional R2 upload below fails.
    outputs_volume.commit()
    url = upload_or_volume(path, f"clips/{name}", "video/mp4", name)
    return {"clip_url": url, "clip_volume_path": name, "mode": "live", "fps": fps}


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs}, secrets=[hf_secret],
         gpu="H100", timeout=2400, scaledown_window=300, max_containers=1)
class WanEngine:
    """H100 (not A100-80GB): A14B at 720p is ~2x the tokens of 480p and the
    A100 would likely blow the timeout. Both experts (~57 GB bf16) + UMT5
    (~11 GB) leave too little headroom for 720p x 81-frame activations on
    80 GB (Wan's own single-GPU 720p recipe offloads), so model CPU offload
    is ON: only the active expert sits on the GPU and they swap once at the
    boundary step — a few seconds per clip, versus a paid OOM crash."""

    @modal.enter()
    def load(self):
        import torch
        from diffusers import WanImageToVideoPipeline
        self.load_error = None  # same fail-fast contract as LTXEngine.load
        try:
            self.pipe = WanImageToVideoPipeline.from_pretrained(WAN_CHECKPOINT, torch_dtype=torch.bfloat16)
            self.pipe.enable_model_cpu_offload()
        except Exception as e:
            self.load_error = f"Wan load failed: {type(e).__name__}: {str(e)[:300]}"

    @modal.method()
    def generate(self, payload: dict) -> dict:
        if self.load_error:
            raise RuntimeError(self.load_error)
        frames = wan_frames(payload)
        steps = _wan_steps(payload)
        img = _fit_cover(_load_frame(payload), WAN_W, WAN_H)
        video = self.pipe(
            image=img,
            prompt=payload.get("prompt", "talking naturally to camera"),
            negative_prompt=WAN_NEGATIVE,
            width=WAN_W,
            height=WAN_H,
            num_frames=frames,
            num_inference_steps=steps,
            guidance_scale=WAN_GUIDANCE,
        ).frames[0]
        return {**_save_clip("wan", video, WAN_FPS, outputs), "engine": "wan",
                "num_frames": frames, "num_inference_steps": steps,
                "width": WAN_W, "height": WAN_H, "duration_s": round(frames / WAN_FPS, 3)}


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs}, secrets=[hf_secret],
         gpu="A100-80GB", timeout=2400, scaledown_window=300, max_containers=1)
class LTXEngine:
    """LTX 2.5 fallback (silent motion for Talla).

    Loads the verified LTX-2.5 Diffusers checkpoint ONCE per container with
    ``LTX2ImageToVideoPipeline`` (weights cached under /weights). LTX 2.5
    natively generates audio too, but Talla discards it: the local Nigerian
    voice is muxed at stitch so the spoken words stay exactly the script.
    22B-class model — needs an A100-80GB-class GPU, not a T4.
    """

    @modal.enter()
    def load(self):
        import torch
        from diffusers import LTX2ImageToVideoPipeline
        # A failed load (e.g. 403 on the gated repo) must FAIL the call, not
        # crash-loop the container: Modal retries a crashing @enter until the
        # timeout, so the job polled as "running" for 45 min (2026-10-30).
        self.load_error = None
        try:
            self.pipe = LTX2ImageToVideoPipeline.from_pretrained(
                LTX_CHECKPOINT, torch_dtype=torch.bfloat16, cache_dir="/weights")
            self.pipe.to("cuda")
        except Exception as e:
            self.load_error = f"LTX load failed: {type(e).__name__}: {str(e)[:300]}"

    @modal.method()
    def generate(self, payload: dict) -> dict:
        if self.load_error:
            raise RuntimeError(self.load_error)
        frames = ltx_frames(payload)
        img = _fit_cover(_load_frame(payload), LTX_W, LTX_H)
        out = self.pipe(
            image=img,
            prompt=payload.get("prompt", "talking naturally"),
            negative_prompt="worst quality, inconsistent motion, blurry, jittery, distorted",
            width=LTX_W,
            height=LTX_H,
            num_frames=frames,
            frame_rate=LTX_FPS,
            num_inference_steps=30,
            guidance_scale=3.0,
            output_type="np",
            return_dict=False,
        )
        video = _first_video(out)
        return {**_save_clip("ltx", video, LTX_FPS, outputs), "engine": "ltx",
                "ltx_checkpoint": LTX_CHECKPOINT, "num_frames": frames,
                "width": LTX_W, "height": LTX_H, "duration_s": round(frames / LTX_FPS, 3)}


@app.function(image=image, timeout=120, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def generate_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """Async spawn: POST {engine: wan|ltx, keyframe_b64|url, prompt, seconds}"""
    from talla_common import require_token
    require_token(x_talla_token)  # 401 BEFORE any spawn / GPU
    engine = "ltx" if payload.get("engine") == "ltx" else "wan"
    call = (LTXEngine() if engine == "ltx" else WanEngine()).generate.spawn(payload)
    return {"call_id": call.object_id, "status": "running", "engine": engine}


@app.function(image=image, timeout=60, secrets=[auth_secret])
@modal.fastapi_endpoint(method="GET")
def generate_result(call_id: str = "", x_talla_token: str | None = Header(default=None)) -> dict:
    """Non-blocking poll (get(timeout=0)): never holds the Worker request."""
    from talla_common import poll_call, require_token
    require_token(x_talla_token)
    return poll_call(call_id)


@app.function(image=image, timeout=60, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def cancel_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """POST {call_id} -> cancel an abandoned render so it stops billing."""
    from talla_common import cancel_call, require_token
    require_token(x_talla_token)
    return cancel_call((payload or {}).get("call_id"))


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
        "deploy_marker": "wan-720p-hardening-2026-10-30",
        "wan_checkpoint": WAN_CHECKPOINT,
        "ltx_checkpoint": LTX_CHECKPOINT,
        "wan_grid": {"width": WAN_W, "height": WAN_H, "fps": WAN_FPS, "max_frames": WAN_MAX_FRAMES},
        "ltx_grid": {"width": LTX_W, "height": LTX_H, "fps": LTX_FPS, "max_frames": LTX_MAX_FRAMES},
        "hf_token_present": bool(token),
        "ltx_repo_http_status": ltx_access,
    }


@app.function(image=image, timeout=120, secrets=[hf_secret, auth_secret])
@modal.fastapi_endpoint(method="GET")
def engine_health(x_talla_token: str | None = Header(default=None)) -> dict:
    """Free deployment probe (CPU container, no GPU, no model load): reports
    what this deployment WOULD load, so the studio can verify the deployed
    code matches the repo before any paid render. Also checks (read-only HF
    API metadata call) whether the container's HF token can actually see the
    gated LTX-2.5 repo — 200 means terms accepted, 401/403 means not."""
    from talla_common import require_token
    require_token(x_talla_token)
    return _engine_health_payload()


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
        ("wan", WAN_CHECKPOINT, "WanImageToVideoPipeline"),
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
