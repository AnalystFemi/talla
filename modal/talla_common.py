"""Shared helpers for every Talla Modal app (mounted via add_local_python_source).

Pure stdlib on purpose: scripts/verify_engine_wiring.py imports this module
offline (no Modal, no FastAPI) to prove the auth / path-safety rules.

Contract §4 (Worker -> Modal auth):
  every web endpoint requires header ``X-Talla-Token`` equal (constant-time)
  to env ``TALLA_ENDPOINT_TOKEN``, injected by the Modal secret named
  ``talla-endpoint-auth``. Missing env var => refuse EVERYTHING (fail
  closed): an unconfigured deployment must never become a free GPU button.
  The check runs before any spawn, so a bad caller costs a CPU blip, never GPU.
"""
import hmac
import os
import re
import secrets
import time

AUTH_SECRET_NAME = "talla-endpoint-auth"
TOKEN_ENV = "TALLA_ENDPOINT_TOKEN"

# Volume basenames only: no slashes, no path parts, known media extensions.
NAME_RE = re.compile(r"^[A-Za-z0-9._-]+\.(mp4|wav|mp3|webp|png|jpg)$")
MEDIA_TYPES = {"mp4": "video/mp4", "wav": "audio/wav", "mp3": "audio/mpeg",
               "webp": "image/webp", "png": "image/png", "jpg": "image/jpeg"}
# Modal FunctionCall ids look like "fc-01ABC..."; anything else is rejected
# before it reaches the Modal API.
CALL_ID_RE = re.compile(r"^fc-[A-Za-z0-9]{6,64}$")


def token_ok(supplied, expected) -> bool:
    """Constant-time token check. Fails closed when either side is empty."""
    if not expected or not supplied:
        return False
    return hmac.compare_digest(str(supplied).encode("utf-8"), str(expected).encode("utf-8"))


def require_token(supplied) -> None:
    """Raise HTTP 401 unless the header matches the deployed secret.
    Call this as the FIRST line of every fastapi_endpoint."""
    if not token_ok(supplied, os.environ.get(TOKEN_ENV, "")):
        from fastapi import HTTPException  # container-only import
        raise HTTPException(status_code=401, detail="unauthorized")


def safe_name(name) -> str:
    """Return the basename if it is a legal volume object name, else raise."""
    if not isinstance(name, str) or not NAME_RE.fullmatch(name) or name.startswith("."):
        raise ValueError(f"illegal volume path: {name!r}")
    return name


def volume_path(name, root: str = "/outputs") -> str:
    return f"{root}/{safe_name(name)}"


def media_type(name: str) -> str:
    return MEDIA_TYPES.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")


def out_name(prefix: str, ext: str) -> str:
    """Collision-safe output basename: <prefix>_<unix>_<8 hex>.<ext>.
    Two containers finishing in the same second no longer overwrite each
    other (the old <prefix>_<unix>.<ext> names could)."""
    return f"{prefix}_{int(time.time())}_{secrets.token_hex(4)}.{ext}"


def poll_call(call_id) -> dict:
    """Non-blocking result check for a spawned FunctionCall (contract §3):
    {status: running} | {status: complete, ...} | {status: error, error}."""
    import modal
    if not isinstance(call_id, str) or not CALL_ID_RE.fullmatch(call_id):
        return {"status": "error", "error": "invalid call_id"}
    try:
        call = modal.FunctionCall.from_id(call_id)
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {str(e)[:200]}"}
    try:
        result = call.get(timeout=0)
        return {"status": "complete", **(result or {})}
    except TimeoutError:
        return {"status": "running"}
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {str(e)[:400]}"}


def cancel_call(call_id) -> dict:
    """Cancel a spawned FunctionCall (stops GPU billing for a job the Worker
    abandoned). Idempotent from the caller's point of view."""
    import modal
    if not isinstance(call_id, str) or not CALL_ID_RE.fullmatch(call_id):
        return {"status": "error", "error": "invalid call_id"}
    try:
        modal.FunctionCall.from_id(call_id).cancel()
        return {"status": "cancelled", "call_id": call_id}
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {str(e)[:200]}"}


def upload_or_volume(local_path: str, key: str, content_type: str, name: str) -> str:
    """R2 upload that can NEVER fail paid work: callers commit the volume
    first, then call this; any upload error falls back to the volume URL
    (the Worker reads media through file_http by basename anyway)."""
    try:
        from r2 import upload_to_r2
        return upload_to_r2(local_path, key, content_type)
    except Exception as e:
        print(f"[talla] R2 upload failed for {name}: {type(e).__name__}: {str(e)[:200]}")
        return f"modal-volume://talla-outputs/{name}"
