"""MiniMax H3 — PRIMARY video engine, self-hosted on Modal (brief SS5).

Open weights: MiniMaxAI/MiniMax-H3 (33B, MiniMax H3 Community License).
H3 is omni-modal: it generates video AND synchronized stereo audio in one
denoising loop (diffusers MiniMaxH3Blocks, workflows fl2va/ref2va/t2va).
Stable dialogue languages are 11 (incl. English) — Pidgin/Yoruba/Hausa/Igbo
are NOT stable, so for those the Worker keeps H3's picture and swaps in our
local TTS track at stitch time. See worker/src/index.js generate chain.

Loading follows the diffusers recipe: ModularPipeline + ComponentsManager
with auto CPU offload — the 61.7GB transformer + 62.1GB Qwen3-VL conditioner
do NOT fit on one GPU, they stream. We load only the fl2va workflow
(transformer/ partition) to halve the download.

Output: results["videos"] + results["audio"] + results["sampling_rate"];
muxing is the caller's job — we use encode_video so the returned mp4
carries H3's native soundtrack. Payload may set audio_mode="silent" to
skip keeping native audio semantics in the prompt (Worker replaces it).

CREDIT GUARD: 768p short edge, 9:16 canvas, <=15s per clip,
scaledown_window small so idle GPUs stop billing quickly.
"""
import modal

app = modal.App("talla-h3")
weights = modal.Volume.from_name("talla-h3-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    # Modular Diffusers (MiniMaxH3Blocks) lives in recent diffusers; av is
    # needed by encode_video/reference decoding.
    .uv_pip_install("torch==2.7.0", "torchvision==0.22.0", "torchcodec",
                    "diffusers>=0.35.0", "transformers>=4.51.0",
                    "accelerate>=1.6.0", "huggingface-hub", "pillow", "boto3",
                    "av", "fastapi[standard]", "protobuf==4.25.8")
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2")
)

# H3 dialogue language tags (stable set). Anything else is described to the
# model in English and voiced locally — the Worker swaps the track.
H3_LANG_TAG = {"nigerian-english": "English", "english": "English"}


def build_prompt(payload: dict) -> str:
    """Context-IR style prompt (model card: integrated_multimodal_description
    + <d>[Lang] dialogue</d>). Persona text comes from the project so the
    speaker H3 voices is the same person as the keyframe and the TTS voice."""
    scene = payload.get("scene", {})
    line = (payload.get("script") or {}).get("text", "")
    project = payload.get("project", {})
    persona = payload.get("persona") or {}
    who = persona.get("h3_description") or "a Nigerian creator in their late 20s"
    lang = (project.get("language") or "english").lower()
    tag = H3_LANG_TAG.get(lang, "English")
    spoken = line if tag == "English" else line
    return (
        f"integrated_multimodal_description: [Shot 1] Photoreal UGC talking-head video, "
        f"raw iPhone selfie style, vertical 9:16, static handheld camera. {who}, "
        f"visible skin pores, natural imperfections, everyday Nigerian indoor setting, "
        f"natural window light. Shot: {scene.get('shot', 'talking-head close-up')}. "
        f"{scene.get('visual', '')} The creator looks into the camera and speaks "
        f"directly to the viewer with natural mouth movement and relaxed expression. "
        f"<d>[{tag}] {spoken}</d> "
        f"overall_soundscape: quiet indoor room tone, the creator's clear voice close "
        f"to the phone microphone, no music. "
        f"Negative: plastic skin, airbrushed, CGI, beauty filter, watermark, subtitles."
    )


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         gpu="H100", timeout=1800, scaledown_window=60, memory=131072)
class H3Engine:
    @modal.enter()
    def load(self):
        import torch, traceback
        from diffusers import ComponentsManager, ModularPipeline
        # Diffusers modular API (docs, MiniMax-H3): the FULL pipeline's blocks
        # are SequentialPipelineBlocks — load_components(workflow=...) raises
        # NotImplementedError there (crash we hit 2026-10-29). The documented
        # pattern is to PRUNE to one workflow first:
        #   ModularPipeline.from_pretrained(...).blocks.get_workflow("fl2va")
        #     .init_pipeline(..., components_manager=manager)
        # then load_components(dtype=...) on that pruned pipeline.
        # Memory: 61.7GB transformer + 62.1GB Qwen3-VL conditioner cannot be
        # resident together on one H100 — ComponentsManager auto-offload
        # streams them (host RAM holds the rest; hence memory=128GB).
        # NOTE: fallback (no offload manager) can only work if both partitions
        # fit on the GPU — on H100-80GB they don't, so attempt 2 is a last
        # resort for multi-GPU nodes. Component-load ImportErrors (missing
        # deps) fail identically in both; the traceback says which.
        last_err = None
        for attempt, use_manager in enumerate((True, False), 1):
            try:
                manager = ComponentsManager() if use_manager else None
                if manager:
                    manager.enable_auto_cpu_offload(device="cuda", memory_reserve_margin="12GB")
                full = ModularPipeline.from_pretrained("MiniMaxAI/MiniMax-H3")
                wf = full.blocks.get_workflow("fl2va")
                pipe = wf.init_pipeline("MiniMaxAI/MiniMax-H3", components_manager=manager)
                pipe.load_components(dtype=torch.bfloat16)
                self.pipe = pipe
                print(f"[h3] loaded fl2va pipeline (attempt {attempt}, manager={use_manager})")
                break
            except Exception as e:
                last_err = e
                print(f"[h3] load attempt {attempt} failed: {type(e).__name__}: {e}")
                traceback.print_exc()
        if getattr(self, "pipe", None) is None:
            raise RuntimeError(f"H3 pipeline failed to load: {type(last_err).__name__}: {last_err}")
        try:
            self.pipe.transformer.set_attention_backend("_flash_3_hub")
        except Exception:
            pass  # full attention still works, just slower

    @modal.method()
    def generate(self, payload: dict) -> dict:
        """payload: {scene, script:{text}, keyframe_b64?|keyframe_url,
        persona?, project:{name,language}, seconds?}
        -> {clip_url, clip_volume_path, has_audio, engine, mode}
        The mp4 carries H3's native soundtrack (encode_video mux)."""
        import io, time, requests, os
        import torch
        from PIL import Image
        from diffusers.utils.export_utils import encode_video
        from r2 import upload_to_r2

        seconds = float((payload.get("script") or {}).get("seconds") or payload.get("seconds") or 6)
        seconds = min(max(seconds, 5), 15)  # H3 window: 5-15s
        # Frames must be 17*n+5 for the video VAE (144 -> snapped to 158).
        n = max(1, round((seconds * 24 - 5) / 17))
        num_frames = 17 * n + 5
        # Explicit 9:16 canvas at 768 short edge (multiples of 32). Without
        # this, a text-only call falls back to the 16:9 default canvas.
        kwargs = {"prompt": build_prompt(payload), "num_frames": num_frames,
                  "height": 1344, "width": 768,
                  "generator": torch.Generator().manual_seed(42),
                  "output": ["videos", "audio", "sampling_rate"]}
        if payload.get("keyframe_b64") or payload.get("keyframe_url"):
            import base64
            raw = base64.b64decode(payload["keyframe_b64"]) if payload.get("keyframe_b64") else requests.get(payload["keyframe_url"], timeout=120).content
            kwargs["image"] = Image.open(io.BytesIO(raw)).convert("RGB")
        else:
            # fl2va REQUIRES a condition image: MiniMaxH3PrepareConditionLatents
            # does torch.cat over condition_latents and crashes on an empty
            # list (hit 2026-10-29). A neutral dark anchor still lets the model
            # generate freely; real runs pass the persona keyframe.
            kwargs["image"] = Image.new("RGB", (768, 1344), (24, 24, 24))
        results = self.pipe(**kwargs)
        videos, audio, sr = results["videos"], results.get("audio"), results.get("sampling_rate")
        name = f"h3_{int(time.time())}.mp4"
        raw = f"/outputs/{name}"
        if audio is not None and sr:
            encode_video(videos[0], fps=24, output_path=raw, audio=audio[0], audio_sample_rate=sr)
            has_audio = True
        else:
            encode_video(videos[0], fps=24, output_path=raw)
            has_audio = False
        url = upload_to_r2(raw, f"clips/{os.path.basename(raw)}")
        outputs.commit()
        return {"clip_url": url, "clip_volume_path": name, "has_audio": has_audio,
                "engine": "h3", "mode": "live"}


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="POST")
def generate_http(payload: dict) -> dict:
    """Async spawn (H3 cold starts exceed HTTP timeouts): -> {call_id}"""
    call = H3Engine().generate.spawn(payload)
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


@app.local_entrypoint()
def main():
    # rcpt scene-1 style check: English line, female persona, no keyframe.
    print(H3Engine().generate.remote({
        "scene": {"shot": "talking-head close-up", "visual": "Creator holds a phone showing a receipt app"},
        "script": {"text": "Stop losing customers because your receipt no look serious.", "seconds": 6},
        "persona": {"h3_description": "a Nigerian woman in her late 20s with braids"},
        "project": {"name": "rcpt", "language": "nigerian-english"}}))
