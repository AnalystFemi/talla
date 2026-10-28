"""LivePortrait — secondary lip-sync guarantee (brief SS5).
Preserves our exact SoroTTS/Wazobia audio untouched; only the face animates.
1 small GPU, ~seconds per clip. Use when H3 regenerates/mangles local speech."""
import modal

app = modal.App("talla-lipsync")
weights = modal.Volume.from_name("talla-lp-weights", create_if_missing=True)
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "git")
    .uv_pip_install("torch==2.7.0", "diffusers==0.33.1", "transformers==4.51.3",
                    "huggingface-hub", "pillow", "boto3", "onnxruntime-gpu")
    .run_commands(
        "git clone --depth 1 https://github.com/KwaiVGI/LivePortrait /opt/LivePortrait",
        "hf download KlingTeam/LivePortrait --local-dir /weights/LivePortrait || true",
    )
    .env({"HF_HOME": "/weights"})
    .add_local_python_source("r2")
)


@app.cls(image=image, volumes={"/weights": weights, "/outputs": outputs},
         gpu="L4", timeout=900, scaledown_window=60)
class LipSync:
    @modal.method()
    def animate(self, payload: dict) -> dict:
        """payload: {keyframe_url, audio_url, scene} -> {clip_url}"""
        import subprocess, time, requests
        from r2 import upload_to_r2
        img = requests.get(payload["keyframe_url"]).content
        aud = requests.get(payload["audio_url"]).content
        open("/tmp/face.jpg", "wb").write(img)
        open("/tmp/voice.wav", "wb").write(aud)
        out = f"/outputs/lp_{int(time.time())}.mp4"
        # LivePortrait inference: source portrait driven by generated motion,
        # then mux the EXACT TTS audio (never regenerated).
        subprocess.run(["python", "/opt/LivePortrait/inference.py",
                        "-s", "/tmp/face.jpg", "-o", "/tmp/lp_raw.mp4"], check=True)
        subprocess.run(["ffmpeg", "-y", "-i", "/tmp/lp_raw.mp4", "-i", "/tmp/voice.wav",
                        "-c:v", "copy", "-shortest", out], check=True)
        url = upload_to_r2(out, f"clips/liveportrait_{int(time.time())}.mp4")
        outputs.commit()
        return {"clip_url": url, "engine": "liveportrait", "mode": "live"}


@app.local_entrypoint()
def main(keyframe_url: str = "", audio_url: str = ""):
    print(LipSync().animate.remote({"keyframe_url": keyframe_url, "audio_url": audio_url}))
