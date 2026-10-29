"""Editor — stitch 5-15s clips into a 25-40s final on Modal (brief SS6):
concat + burnt-in captions + visible 'AI-generated' label, 9:16 1080x1920."""
import modal

app = modal.App("talla-stitch")
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
image = (modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")
         .uv_pip_install("boto3", "requests", "fastapi[standard]").add_local_python_source("r2"))


@app.function(image=image, volumes={"/outputs": outputs}, timeout=600, scaledown_window=60)
def stitch(payload: dict) -> dict:
    """payload: {clip_urls[]|clip_volume_paths[], lines:[{text,seconds}], project_id}
    -> {final_video_url}. Volume paths read the shared talla-outputs volume."""
    import subprocess, time, requests, shutil, os
    from r2 import upload_to_r2
    outputs.reload()  # see clips committed by other containers
    clips = []
    sources = payload.get("clip_volume_paths") or payload.get("clip_urls") or []
    for i, src in enumerate(sources):
        p = f"/tmp/clip{i}.mp4"
        if payload.get("clip_volume_paths"):
            shutil.copy(f"/outputs/{src}", p)
        else:
            open(p, "wb").write(requests.get(src).content)
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
          "subtitles=/tmp/caps.srt:force_style='FontSize=15,Alignment=2,MarginV=70,Outline=2,Shadow=1',"
          "drawtext=text='AI-generated':x=24:y=24:fontsize=34:fontcolor=white@0.85:box=1:boxcolor=black@0.45")
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
                    "-vf", vf, "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                    "-c:a", "aac", "-pix_fmt", "yuv420p", out], check=True)
    url = upload_to_r2(out, f"finals/{payload.get('project_id','demo')}_{int(time.time())}.mp4")
    outputs.commit()
    return {"final_video_url": url, "final_volume_path": out.replace("/outputs/", ""), "mode": "live"}


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="POST")
def stitch_http(payload: dict) -> dict:
    """Async spawn: POST {clip_volume_paths, lines, project_id} -> {call_id}"""
    call = stitch.spawn(payload)
    return {"call_id": call.object_id, "status": "running"}


@app.function(image=image, timeout=60)
@modal.fastapi_endpoint(method="GET")
def stitch_result(call_id: str) -> dict:
    call = modal.functions.FunctionCall.from_id(call_id)
    try:
        result = call.get(timeout=0)
        return {"status": "complete", **(result or {})}
    except TimeoutError:
        return {"status": "running"}
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {str(e)[:400]}"}
