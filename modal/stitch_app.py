"""Editor — stitch 5-15s clips into a 25-40s final on Modal (brief SS6):
concat + burnt-in captions + visible 'AI-generated' label, 9:16 1080x1920."""
import modal

app = modal.App("talla-stitch")
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
image = (modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")
         .uv_pip_install("boto3", "requests", "fastapi[standard]").add_local_python_source("r2"))


def _probe_duration(path: str) -> float:
    import subprocess, json
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json",
                          "-show_format", path], capture_output=True, text=True)
    try:
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:
        return 0.0


@app.function(image=image, volumes={"/outputs": outputs}, timeout=600, scaledown_window=60)
def stitch(payload: dict) -> dict:
    """payload: {clip_volume_paths[]|clip_urls[],
                 audio_volume_paths?: per-clip local voice, same order — when
                   given for a clip, H3's native track is REPLACED by this
                   voice and the picture is trimmed/padded to its length,
                 lines:[{text,seconds}], project_id}
    -> {final_video_url, final_volume_path}. Volume paths read the shared
    talla-outputs volume (clips from H3/Wan, wavs from TTS/YarnGPT)."""
    import subprocess, time, requests, shutil, os
    from r2 import upload_to_r2
    outputs.reload()  # see clips committed by other containers
    sources = payload.get("clip_volume_paths") or payload.get("clip_urls") or []
    audio_sources = payload.get("audio_volume_paths") or []
    lines = payload.get("lines", [])
    clips, durations = [], []
    for i, src in enumerate(sources):
        p = f"/tmp/clip{i}.mp4"
        if payload.get("clip_volume_paths"):
            shutil.copy(f"/outputs/{src}", p)
        else:
            open(p, "wb").write(requests.get(src).content)
        audio_path = None
        if i < len(audio_sources) and audio_sources[i]:
            audio_path = f"/tmp/voice{i}.wav"
            shutil.copy(f"/outputs/{audio_sources[i]}", audio_path)
        if audio_path:
            dur = _probe_duration(audio_path) or float((lines[i] if i < len(lines) else {}).get("seconds", 5))
            prep = f"/tmp/clip{i}_voiced.mp4"
            # Replace H3's track with the local voice. If the voice is LONGER
            # than the clip, `-t` would cut it mid-sentence — so clone the
            # final frame (tpad) to carry the picture to the end of the
            # speech; `apad` pads the audio side symmetrically if shorter.
            subprocess.run(["ffmpeg", "-y", "-i", p, "-i", audio_path,
                            "-map", "0:v:0", "-map", "1:a:0", "-t", str(dur),
                            "-vf", f"tpad=stop_mode=clone:stop_duration={dur}",
                            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                            "-af", "apad", "-c:a", "aac", "-pix_fmt", "yuv420p", prep],
                           check=True, capture_output=True)
            clips.append(prep)
            durations.append(dur)
        else:
            clips.append(p)
            durations.append(_probe_duration(p) or float((lines[i] if i < len(lines) else {}).get("seconds", 5)))
    listfile = "/tmp/list.txt"
    open(listfile, "w").write("\n".join(f"file '{c}'" for c in clips))
    # Captions (SRT) from script lines, timed by the real clip durations.
    srt, t = [], 0.0
    for i, line in enumerate(lines, 1):
        dur = durations[i - 1] if i - 1 < len(durations) else float(line.get("seconds", 5))
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
