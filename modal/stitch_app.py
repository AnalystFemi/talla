"""Editor — stitch 5-15s clips into a 25-45s final on Modal (brief SS6):
concat + burnt-in captions + visible 'AI-generated' label, 9:16 1080x1920.
Winning-UGC upgrade: per-scene proof overlays (storyboard overlay beats) —
real product assets composited over the A-roll, then captioned+labelled."""
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
                   given for a clip, the engine track is REPLACED by this
                   voice and the picture is trimmed/padded to its length,
                 overlays?: per-scene proof overlay, same order — null or
                   {volume_path|url, seconds, style:"pip"|"fullscreen"}.
                   Style pip = proof card bottom-third (2/3 in); fullscreen
                   = 2s A-roll head then full-proof cutaway (winning-UGC
                   rhythm). Real assets only — no overlay is ever AI-drawn.
                 lines:[{text,seconds}], project_id}
    -> {final_video_url, final_volume_path}. Volume paths read the shared
    talla-outputs volume (clips from Wan/LTX/H3, wavs from TTS/YarnGPT)."""
    import subprocess, time, requests, shutil, os
    from r2 import upload_to_r2
    outputs.reload()  # see clips committed by other containers
    sources = payload.get("clip_volume_paths") or payload.get("clip_urls") or []
    audio_sources = payload.get("audio_volume_paths") or []
    overlay_sources = payload.get("overlays") or payload.get("overlay_volume_paths") or []
    lines = payload.get("lines", [])

    def _fetch_overlay(spec, dest):
        """Copy/download one overlay asset. Returns path or None (soft-fail:
        a missing proof asset must never kill the film — A-roll carries on)."""
        if not spec:
            return None
        # Intent-only specs ({asset, note, seconds, style} from the agents,
        # with no volume_path/url yet) carry no file to fetch — return None
        # cleanly so the scene stays clean A-roll; never raise.
        if isinstance(spec, dict) and not spec.get("volume_path") and not spec.get("url"):
            return None
        try:
            name = spec.get("volume_path") if isinstance(spec, dict) else spec
            url = spec.get("url") if isinstance(spec, dict) else None
            if name and payload.get("clip_volume_paths") is not False:
                import os as _os
                cand = f"/outputs/{name}"
                if _os.path.exists(cand):
                    shutil.copy(cand, dest)
                    return dest
            if url:
                open(dest, "wb").write(requests.get(url, timeout=60).content)
                return dest
        except Exception:
            return None
        return None

    def _apply_overlay(base_clip, overlay_asset, style, dur, out_path, idx):
        """Composite one proof overlay over a voiced A-roll clip (both 1080x1920
        by this point). pip: proof card bottom-two-thirds for the middle of
        the scene. fullscreen: 2s A-roll head, then full-proof cutaway to the
        end of the voiceover (the winning-UGC talk-then-show rhythm)."""
        ov = f"/tmp/ov{idx}.mp4"
        shutil.copy(overlay_asset, ov)
        ov_dur = _probe_duration(ov) or dur
        style = (style or "pip").lower()
        if style == "fullscreen":
            head = min(2.0, dur / 3)
            vf = (f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
                  f"trim=0:{head},setpts=PTS-STARTPTS[head];"
                  f"[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
                  f"trim=0:{max(dur - head, 0.5)},setpts=PTS-STARTPTS[proof];"
                  f"[head][proof]concat=n=2:v=1:a=0[outv]")
            subprocess.run(["ffmpeg", "-y", "-i", base_clip, "-i", ov,
                            "-filter_complex", vf, "-map", "[outv]", "-map", "0:a:0?",
                            "-t", str(dur), "-c:v", "libx264", "-crf", "18",
                            "-preset", "fast", "-c:a", "aac", "-pix_fmt", "yuv420p",
                            out_path], check=True, capture_output=True)
        else:
            # pip card: proof scaled to lower two-thirds, rounded-corner feel
            # via a subtle white border, shown middle 60% of the scene.
            start, length = dur * 0.2, dur * 0.6
            vf = (f"[1:v]scale=880:-1,format=yuva420p,"
                  f"drawbox=x=0:y=0:w=iw:h=ih:c=white@0.9:t=6,"
                  f"scale=880:1170:force_original_aspect_ratio=increase,"
                  f"crop=880:1170[v2];[0:v][v2]overlay=x=100:y=620:"
                  f"enable='between(t,{start:.2f},{(start + length):.2f})'[outv]")
            subprocess.run(["ffmpeg", "-y", "-i", base_clip, "-i", ov,
                            "-filter_complex", vf, "-map", "[outv]", "-map", "0:a:0?",
                            "-t", str(dur), "-c:v", "libx264", "-crf", "18",
                            "-preset", "fast", "-c:a", "aac", "-pix_fmt", "yuv420p",
                            "-shortest", out_path], check=True, capture_output=True)
        return out_path

    clips, durations = [], []
    overlays_applied = 0  # counts ONLY overlays actually composited below
    for i, src in enumerate(sources):
        p = f"/tmp/clip{i}.mp4"
        if payload.get("clip_volume_paths"):
            cand = f"/outputs/{src}"
            if not os.path.exists(cand):
                raise FileNotFoundError(
                    f"stitch: missing clip file for scene {i + 1}: '{src}' not found in talla-outputs volume (checked {cand})")
            shutil.copy(cand, p)
        else:
            open(p, "wb").write(requests.get(src).content)
        audio_path = None
        if i < len(audio_sources) and audio_sources[i]:
            audio_path = f"/tmp/voice{i}.wav"
            shutil.copy(f"/outputs/{audio_sources[i]}", audio_path)
        ov_spec = overlay_sources[i] if i < len(overlay_sources) else None
        if audio_path:
            dur = _probe_duration(audio_path) or float((lines[i] if i < len(lines) else {}).get("seconds", 5))
            prep = f"/tmp/clip{i}_voiced.mp4"
            # Replace the engine track with the local voice. If the voice is
            # LONGER than the clip, `-t` would cut it mid-sentence — so clone
            # the final frame (tpad) to carry the picture to the end of the
            # speech; `apad` pads the audio side symmetrically if shorter.
            subprocess.run(["ffmpeg", "-y", "-i", p, "-i", audio_path,
                            "-map", "0:v:0", "-map", "1:a:0", "-t", str(dur),
                            "-vf", f"tpad=stop_mode=clone:stop_duration={dur}",
                            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                            "-af", "apad", "-c:a", "aac", "-pix_fmt", "yuv420p", prep],
                           check=True, capture_output=True)
            # Proof overlay (winning-UGC cutaway): composite the real asset
            # over the voiced A-roll. Overlay failure degrades to clean
            # A-roll — it never fails the scene.
            ov_asset = _fetch_overlay(ov_spec, f"/tmp/ovsrc{i}.mp4")
            if ov_asset:
                try:
                    style = ov_spec.get("style") if isinstance(ov_spec, dict) else "pip"
                    final = f"/tmp/clip{i}_proof.mp4"
                    _apply_overlay(prep, ov_asset, style, dur, final, i)
                    clips.append(final)
                    overlays_applied += 1  # only on real composite success
                except Exception:
                    clips.append(prep)
            else:
                clips.append(prep)
            durations.append(dur)
        else:
            # No local voice for this scene (voice endpoint down): the proof
            # overlay must STILL apply — a missing voice must never silently
            # drop the winning-UGC proof cutaway. Composite over the silent
            # A-roll at its own duration; _apply_overlay maps 0:a:0? so the
            # absence of an audio stream is safe.
            dur = _probe_duration(p) or float((lines[i] if i < len(lines) else {}).get("seconds", 5))
            ov_asset = _fetch_overlay(ov_spec, f"/tmp/ovsrc{i}.mp4")
            if ov_asset:
                try:
                    style = ov_spec.get("style") if isinstance(ov_spec, dict) else "pip"
                    final = f"/tmp/clip{i}_proof.mp4"
                    _apply_overlay(p, ov_asset, style, dur, final, i)
                    clips.append(final)
                    overlays_applied += 1  # only on real composite success
                except Exception:
                    clips.append(p)
            else:
                clips.append(p)
            durations.append(dur)
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
    return {"final_video_url": url, "final_volume_path": out.replace("/outputs/", ""),
            "mode": "live", "overlays_applied": overlays_applied, "scenes": len(clips)}


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
