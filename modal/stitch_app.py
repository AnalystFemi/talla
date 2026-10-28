"""Editor — stitch 5-15s clips into a 25-40s final on Modal (brief SS6):
concat + burnt-in captions + visible 'AI-generated' label, 9:16 1080x1920."""
import modal

app = modal.App("talla-stitch")
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
image = (modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")
         .uv_pip_install("boto3", "requests").add_local_python_source("r2"))


@app.function(image=image, volumes={"/outputs": outputs}, timeout=600, scaledown_window=60)
def stitch(payload: dict) -> dict:
    """payload: {clip_urls[], lines:[{text,seconds}], project_id} -> {final_video_url}"""
    import subprocess, time, requests
    from r2 import upload_to_r2
    clips = []
    for i, url in enumerate(payload["clip_urls"]):
        p = f"/tmp/clip{i}.mp4"
        open(p, "wb").write(requests.get(url).content)
        clips.append(p)
    listfile = "/tmp/list.txt"
    open(listfile, "w").write("\n".join(f"file '{c}'" for c in clips))
    # Captions (SRT) from script lines
    srt, t = [], 0.0
    for i, line in enumerate(payload.get("lines", []), 1):
        dur = float(line.get("seconds", 5))
        fmt = lambda s: f"{int(s//3600):02d}:{int(s%3600//60):02d}:{s%60:06.3f}".replace(".", ",")
        srt.append(f"{i}\n{fmt(t)} --> {fmt(t+dur)}\n{line.get('text','')}\n")
        t += dur
    open("/tmp/caps.srt", "w").write("\n".join(srt))
    out = f"/outputs/final_{int(time.time())}.mp4"
    vf = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
          "subtitles=/tmp/caps.srt,"
          "drawtext=text='AI-generated':x=24:y=24:fontsize=34:fontcolor=white@0.85:box=1:boxcolor=black@0.45")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
                    "-vf", vf, "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                    "-c:a", "aac", "-pix_fmt", "yuv420p", out], check=True)
    url = upload_to_r2(out, f"finals/{payload.get('project_id','demo')}_{int(time.time())}.mp4")
    outputs.commit()
    return {"final_video_url": url, "mode": "live"}
