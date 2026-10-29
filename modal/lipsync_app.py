"""Lip-sync talking head — SadTalker inside the talla-lipsync app.
Brief SS5 named LivePortrait, but LivePortrait is video-driven (needs a
driving video, not audio). For still-image + exact-TTS-audio, SadTalker is
the correct open engine: source photo + driven audio -> talking head, and
the audio track is preserved untouched. (LivePortrait stays available for
future video-driven work.) Weights download once into a Modal volume."""
import modal

app = modal.App("talla-lipsync")
weights = modal.Volume.from_name("talla-lp-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

image = (
    # SadTalker/gfpgan/basicsr need their era stack: py3.10 + torch 2.0
    # (torchvision>=0.17 removed transforms.functional_tensor and breaks basicsr).
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git")
    .uv_pip_install("torch==2.0.1", "torchvision==0.15.2", "transformers==4.30.2",
                    "huggingface-hub", "pillow", "boto3", "requests", "numpy==1.23.5",
                    "librosa==0.9.2", "scipy", "kornia==0.6.12", "face-alignment", "yacs", "pyyaml",
                    "facexlib==0.3.0", "gfpgan==1.3.8", "basicsr==1.4.2", "realesrgan", "av", "tqdm",
                    "opencv-python-headless", "imageio", "imageio-ffmpeg", "resampy",
                    "pydub", "ffmpeg-python", "safetensors", "einops")
    .run_commands(
        "git clone --depth 1 https://github.com/OpenTalker/SadTalker /opt/SadTalker",
    )
    # Volume mounts at /model_weights — never download into a mount path at
    # image-build time or Modal refuses to mount ("non-empty path").
    .env({"HF_HOME": "/model_weights"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/model_weights": weights, "/outputs": outputs},
         gpu="T4", timeout=1200, scaledown_window=60)
class LipSync:
    @modal.method()
    def animate(self, payload: dict) -> dict:
        """payload: {keyframe_b64?|keyframe_url, audio_b64?|audio_url}
        -> {clip_url, engine, mode}. Audio is muxed untouched."""
        import base64, subprocess, time, requests, glob, os
        from r2 import upload_to_r2

        def materialize(b64, url, path):
            data = base64.b64decode(b64) if b64 else requests.get(url, timeout=120).content
            open(path, "wb").write(data)

        materialize(payload.get("keyframe_b64"), payload.get("keyframe_url"), "/tmp/face.jpg")
        materialize(payload.get("audio_b64"), payload.get("audio_url"), "/tmp/voice.wav")
        result_dir = "/tmp/sadtalker_out"
        ckpt = "/model_weights/SadTalker"
        if not os.path.exists(os.path.join(ckpt, "SadTalker_V0.0.2_256.safetensors")):
            subprocess.run(["hf", "download", "vinthony/SadTalker", "--local-dir", ckpt], check=False)
        cmd = ["python", "inference.py",
               "--driven_audio", "/tmp/voice.wav",
               "--source_image", "/tmp/face.jpg",
               "--checkpoint_dir", ckpt,
               "--result_dir", result_dir,
               "--still", "--preprocess", "crop", "--enhancer", "gfpgan"]
        run = subprocess.run(cmd, cwd="/opt/SadTalker", capture_output=True, text=True)
        if run.returncode != 0:
            return {"error": "SadTalker failed", "log": (run.stdout + run.stderr)[-1500:], "mode": "error"}
        videos = sorted(glob.glob(f"{result_dir}/**/*.mp4", recursive=True), key=os.path.getmtime)
        if not videos:
            return {"error": "SadTalker produced no mp4", "log": (run.stdout + run.stderr)[-1500:], "mode": "error"}
        out = f"/outputs/lipsync_{int(time.time())}.mp4"
        subprocess.run(["cp", videos[-1], out], check=True)
        url = upload_to_r2(out, f"clips/lipsync_{int(time.time())}.mp4")
        outputs.commit()
        return {"clip_url": url, "engine": "sadtalker", "mode": "live"}


@app.local_entrypoint()
def main():
    import base64, pathlib
    root = pathlib.Path(__file__).parent.parent
    img = base64.b64encode((root / "data" / "keyframe_test.webp").read_bytes()).decode()
    aud = base64.b64encode((root / "data" / "tts_test.wav").read_bytes()).decode()
    print(LipSync().animate.remote({"keyframe_b64": img, "audio_b64": aud}))
