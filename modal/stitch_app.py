"""Editor — stitch 5-15s clips into a 25-45s final on Modal (brief SS6):
concat + burnt-in captions + visible 'AI-generated' label, 9:16 1080x1920.
Winning-UGC upgrade: per-scene proof overlays (storyboard overlay beats) —
real product assets composited over the A-roll, then captioned+labelled.

Hardening (2026-10-30):
  * Every prepared clip is NORMALISED to one stream shape before concat:
    1080x1920 (scale-to-cover + center crop), SAR 1, 24 fps, yuv420p,
    AAC 48 kHz stereo. Wan (720x1280 @ 16 fps), LTX (768x1344 @ 24 fps) and
    voices (24 kHz YarnGPT / 16 kHz MMS) therefore never reach concat with
    mismatched params (the old concat DEMUXER silently desynced or dropped
    audio when one clip had no track or a different sample rate).
  * Clips with no voice get an anullsrc silent stereo track, so every
    segment has exactly one video + one audio stream.
  * Overlays are composited AFTER normalisation, so their pixel positions
    are always in 1080x1920 space.
  * Concat uses the concat FILTER (re-timestamps each segment) instead of
    the demuxer.
  * Captions use Noto Sans (apt fonts-noto-core) and escaped SRT text.
  * Volume names are validated against the contract regex (no path parts).
  * file_http streams talla-outputs files to the Worker (token-auth).

The ffmpeg command builders below are PURE functions (no Modal, no I/O) so
scripts/verify_engine_wiring.py can run them against synthetic clips offline.
"""
import modal

try:  # FastAPI is always present in-container; locally it only shapes the signature.
    from fastapi import Header
except ImportError:  # pragma: no cover
    def Header(default=None, **_):  # noqa: N802
        return default

app = modal.App("talla-stitch")
outputs = modal.Volume.from_name("talla-outputs", create_if_missing=True)
# Endpoint auth (contract §4): resolved at deploy — create the secret first.
auth_secret = modal.Secret.from_name("talla-endpoint-auth", required_keys=["TALLA_ENDPOINT_TOKEN"])
image = (modal.Image.debian_slim(python_version="3.12")
         # fonts-noto-core ships NotoSans-*.ttf (Latin incl. Yoruba/Igbo/Hausa
         # diacritics); without a real font libass/drawtext fall back to
         # whatever fontconfig finds (or nothing) on debian-slim.
         .apt_install("ffmpeg", "fontconfig", "fonts-noto-core", "fonts-noto-ui-core")
         .uv_pip_install("boto3", "requests", "fastapi[standard]")
         # protobuf>=6 crash-loops Modal apps that mount volumes (proven
         # 2026-10-29). Pin explicitly even though this image has no ML stack.
         .uv_pip_install("protobuf==4.25.8")
         .add_local_python_source("r2", "talla_common"))

# ---- target stream shape (every segment is normalised to exactly this) ----
TARGET_W, TARGET_H, TARGET_FPS = 1080, 1920, 24
AUDIO_SR, AUDIO_CH = 48000, 2
CAPTION_FONT = "Noto Sans"
LABEL_FONT_FILE = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
CAPTION_STYLE = (f"Fontname={CAPTION_FONT},FontSize=15,Alignment=2,MarginV=70,"
                 "Outline=2,Shadow=1")
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

NORM_V = (f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=increase,"
          f"crop={TARGET_W}:{TARGET_H},setsar=1,fps={TARGET_FPS},format=yuv420p")
NORM_A = f"aresample={AUDIO_SR},aformat=sample_fmts=fltp:channel_layouts=stereo"
ENC_V = ["-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p",
         "-r", str(TARGET_FPS)]
ENC_A = ["-c:a", "aac", "-b:a", "192k", "-ar", str(AUDIO_SR), "-ac", str(AUDIO_CH)]


def ff_quote(value: str) -> str:
    """Quote a path for use INSIDE an ffmpeg filtergraph option
    (subtitles filename, drawtext fontfile). Backslashes -> '/', and ':' / "'"
    escaped, so Windows test paths and odd names cannot break the graph."""
    v = str(value).replace("\\", "/").replace("'", r"\'").replace(":", r"\:")
    return f"'{v}'"


def normalize_cmd(src: str, out: str, dur: float, voice: str | None = None) -> list:
    """One scene -> canonical segment of exactly `dur` seconds.
    Voice given: the engine track is REPLACED by the voice; if the voice is
    longer than the picture, tpad clones the final frame so speech is never
    cut mid-sentence; apad pads the voice if the picture is longer.
    No voice: an anullsrc silent stereo track is synthesised, so concat
    always sees one audio stream per segment (no dropped/shifted audio)."""
    d = f"{max(float(dur), 0.1):.3f}"
    cmd = ["ffmpeg", "-y", "-i", src]
    if voice:
        cmd += ["-i", voice]
    else:
        cmd += ["-f", "lavfi", "-i", f"anullsrc=r={AUDIO_SR}:cl=stereo"]
    graph = (f"[0:v]{NORM_V},tpad=stop_mode=clone:stop_duration={d}[v];"
             f"[1:a]{NORM_A},apad[a]")
    return cmd + ["-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", d] + ENC_V + ENC_A + [out]


def overlay_cmd(base: str, overlay: str, style: str, dur: float, out: str,
                is_image: bool = False) -> list:
    """Composite one proof overlay over an ALREADY-NORMALISED segment (so all
    coordinates are 1080x1920). pip: proof card 880x1170 at (100,620) for the
    middle 60% of the scene. fullscreen: 2s A-roll head, then full-proof
    cutaway to the end (the winning-UGC talk-then-show rhythm). The segment's
    audio (voice or silence) is copied through untouched in timing."""
    d = float(dur)
    ov_in = (["-loop", "1", "-framerate", str(TARGET_FPS), "-t", f"{d:.3f}", "-i", overlay]
             if is_image else ["-i", overlay])
    style = (style or "pip").lower()
    if style == "fullscreen":
        head = min(2.0, d / 3)
        rest = max(d - head, 0.5)
        graph = (f"[0:v]trim=0:{head:.3f},setpts=PTS-STARTPTS[head];"
                 f"[1:v]{NORM_V},tpad=stop_mode=clone:stop_duration={rest:.3f},"
                 f"trim=0:{rest:.3f},setpts=PTS-STARTPTS[proof];"
                 f"[head][proof]concat=n=2:v=1:a=0,format=yuv420p[outv]")
    else:
        start, length = d * 0.2, d * 0.6
        # Scale/crop FIRST, then draw the border — the old order drew the
        # border and then cropped it away.
        graph = (f"[1:v]scale=880:1170:force_original_aspect_ratio=increase,crop=880:1170,"
                 f"setsar=1,fps={TARGET_FPS},drawbox=x=0:y=0:w=iw:h=ih:c=white@0.9:t=6,"
                 f"tpad=stop_mode=clone:stop_duration={d:.3f}[v2];"
                 f"[0:v][v2]overlay=x=100:y=620:"
                 f"enable='between(t,{start:.2f},{(start + length):.2f})',format=yuv420p[outv]")
    return (["ffmpeg", "-y", "-i", base] + ov_in +
            ["-filter_complex", graph, "-map", "[outv]", "-map", "0:a:0", "-t", f"{d:.3f}"]
            + ENC_V + ENC_A + [out])


def concat_cmd(segments: list, out: str, srt_path: str | None = None,
               label: bool = True, label_font_file: str | None = None) -> list:
    """Concat FILTER over identical-shape segments, then captions + label.
    The filter re-times every segment (unlike the demuxer, which trusts each
    file's timestamps), so audio stays continuous across scene cuts."""
    cmd = ["ffmpeg", "-y"]
    for s in segments:
        cmd += ["-i", s]
    n = len(segments)
    graph = "".join(f"[{i}:v][{i}:a]" for i in range(n)) + f"concat=n={n}:v=1:a=1[cv][ca]"
    post = []
    if srt_path:
        post.append(f"subtitles=filename={ff_quote(srt_path)}:force_style='{CAPTION_STYLE}'")
    if label:
        font = f"fontfile={ff_quote(label_font_file)}:" if label_font_file else ""
        post.append(f"drawtext={font}text='AI-generated':x=24:y=24:fontsize=34:"
                    "fontcolor=white@0.85:box=1:boxcolor=black@0.45")
    post.append("format=yuv420p")
    graph += f";[cv]{','.join(post)}[outv]"
    return cmd + ["-filter_complex", graph, "-map", "[outv]", "-map", "[ca]"] + ENC_V + ENC_A + ["-movflags", "+faststart", out]


def srt_text(text) -> str:
    """Make one caption cue safe: a blank line inside a cue ENDS the cue in
    SRT (the rest leaked out as garbage), and `{...}` is a libass override
    block (`{\\fs200}` would restyle the caption). Neutralise both; also
    defuse a stray '-->' that would look like a timing line."""
    t = str(text or "").replace("\r", "\n")
    t = "\n".join(line.strip() for line in t.split("\n") if line.strip())
    return t.replace("{", "(").replace("}", ")").replace("-->", "->")


def srt_timestamp(s: float) -> str:
    ms = int(round(max(s, 0.0) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    sec, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def build_srt(lines: list, durations: list) -> str:
    """Captions timed by the REAL normalised segment durations."""
    cues, t, idx = [], 0.0, 0
    for i, line in enumerate(lines or []):
        line = line if isinstance(line, dict) else {"text": str(line)}
        try:
            dur = float(durations[i]) if i < len(durations) else float(line.get("seconds", 5))
        except (TypeError, ValueError):
            dur = 5.0
        text = srt_text(line.get("text", ""))
        if text:
            idx += 1
            cues.append(f"{idx}\n{srt_timestamp(t)} --> {srt_timestamp(t + dur)}\n{text}\n")
        t += dur
    return "\n".join(cues)


def _is_image_ref(ref: str) -> bool:
    return str(ref or "").lower().split("?", 1)[0].endswith(IMAGE_EXTS)


def _run(cmd: list) -> None:
    import subprocess
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({r.returncode}): {r.stderr[-1200:]}")


def _probe_duration(path: str) -> float:
    import subprocess, json
    out = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json",
                          "-show_format", path], capture_output=True, text=True)
    try:
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:
        return 0.0


@app.function(image=image, volumes={"/outputs": outputs}, timeout=900, scaledown_window=60,
              max_containers=2)
def stitch(payload: dict) -> dict:
    """payload: {clip_volume_paths[]|clip_urls[],
                 audio_volume_paths?: per-clip local voice, same order — when
                   given for a clip, the engine track is REPLACED by this
                   voice and the picture is trimmed/padded to its length,
                 overlays?: per-scene proof overlay, same order — null or
                   {volume_path|url, seconds, style:"pip"|"fullscreen"}.
                   Real assets only — no overlay is ever AI-drawn.
                 lines:[{text,seconds}], project_id}
    -> {final_video_url, final_volume_path, duration_s, ...}. Volume paths
    read the shared talla-outputs volume (clips from Wan/LTX, wavs from
    TTS/YarnGPT) and must be bare basenames (contract regex)."""
    import os, shutil, requests
    from talla_common import out_name, safe_name, upload_or_volume, volume_path
    outputs.reload()  # see clips committed by other containers
    use_volume = bool(payload.get("clip_volume_paths"))
    sources = payload.get("clip_volume_paths") or payload.get("clip_urls") or []
    audio_sources = payload.get("audio_volume_paths") or []
    overlay_sources = payload.get("overlays") or payload.get("overlay_volume_paths") or []
    lines = payload.get("lines", [])
    if not sources:
        raise ValueError("stitch: no clips supplied")
    # Validate EVERY volume name up front: a bad name fails fast, before any encode.
    if use_volume:
        for s in sources:
            safe_name(s)
    for a in audio_sources:
        if a:
            safe_name(a)

    def _fetch_overlay(spec, dest_stem):
        """Copy/download one overlay asset. Returns (path, is_image) or None
        (soft-fail: a missing/illegal proof asset never kills the film)."""
        if not spec:
            return None
        if isinstance(spec, dict) and not spec.get("volume_path") and not spec.get("url"):
            return None  # intent-only spec from the agents: stay clean A-roll
        try:
            name = spec.get("volume_path") if isinstance(spec, dict) else spec
            url = spec.get("url") if isinstance(spec, dict) else None
            if name:
                cand = volume_path(name)  # raises on illegal names -> soft-fail
                if os.path.exists(cand):
                    ext = os.path.splitext(name)[1].lower()
                    dest = dest_stem + ext
                    shutil.copy(cand, dest)
                    return dest, _is_image_ref(name)
            if url:
                r = requests.get(url, timeout=(10, 60))
                r.raise_for_status()
                ext = ".png" if _is_image_ref(url) else ".mp4"
                dest = dest_stem + ext
                open(dest, "wb").write(r.content)
                return dest, _is_image_ref(url)
        except Exception as e:
            print(f"[stitch] overlay skipped: {type(e).__name__}: {str(e)[:200]}")
            return None
        return None

    segments, durations = [], []
    overlays_applied = 0  # counts ONLY overlays actually composited below
    for i, src in enumerate(sources):
        raw = f"/tmp/clip{i}.mp4"
        if use_volume:
            cand = volume_path(src)
            if not os.path.exists(cand):
                raise FileNotFoundError(
                    f"stitch: missing clip file for scene {i + 1}: '{src}' not found in talla-outputs volume")
            shutil.copy(cand, raw)
        else:
            r = requests.get(src, timeout=(10, 120))
            r.raise_for_status()
            open(raw, "wb").write(r.content)
        voice = None
        if i < len(audio_sources) and audio_sources[i]:
            cand = volume_path(audio_sources[i])
            if not os.path.exists(cand):
                raise FileNotFoundError(f"stitch: missing voice for scene {i + 1}: '{audio_sources[i]}'")
            voice = f"/tmp/voice{i}{os.path.splitext(cand)[1]}"
            shutil.copy(cand, voice)
        fallback = float((lines[i] if i < len(lines) and isinstance(lines[i], dict) else {}).get("seconds", 5) or 5)
        dur = (_probe_duration(voice) if voice else _probe_duration(raw)) or fallback
        seg = f"/tmp/seg{i}.mp4"
        _run(normalize_cmd(raw, seg, dur, voice))
        # Proof overlay over the normalised segment (voiced or silent).
        # Overlay failure degrades to clean A-roll — never fails the scene.
        ov_spec = overlay_sources[i] if i < len(overlay_sources) else None
        got = _fetch_overlay(ov_spec, f"/tmp/ovsrc{i}")
        if got:
            try:
                style = ov_spec.get("style") if isinstance(ov_spec, dict) else "pip"
                proofed = f"/tmp/seg{i}_proof.mp4"
                _run(overlay_cmd(seg, got[0], style, dur, proofed, is_image=got[1]))
                seg = proofed
                overlays_applied += 1  # only on real composite success
            except Exception as e:
                print(f"[stitch] overlay {i + 1} failed, clean A-roll kept: {str(e)[:300]}")
        segments.append(seg)
        durations.append(_probe_duration(seg) or dur)

    srt = build_srt(lines, durations)
    srt_path = None
    if srt.strip():
        srt_path = "/tmp/caps.srt"
        open(srt_path, "w", encoding="utf-8").write(srt)
    name = out_name("final", "mp4")
    out = volume_path(name)
    font = LABEL_FONT_FILE if os.path.exists(LABEL_FONT_FILE) else None
    _run(concat_cmd(segments, out, srt_path, label=True, label_font_file=font))
    outputs.commit()  # paid work is safe on the volume before the optional upload
    url = upload_or_volume(out, f"finals/{name}", "video/mp4", name)
    return {"final_video_url": url, "final_volume_path": name, "mode": "live",
            "duration_s": round(_probe_duration(out), 3),
            "overlays_applied": overlays_applied, "scenes": len(segments)}


@app.function(image=image, timeout=120, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def stitch_http(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """Async spawn: POST {clip_volume_paths, audio_volume_paths, overlays,
    lines, project_id} -> {call_id}"""
    from talla_common import require_token
    require_token(x_talla_token)  # 401 before any spawn
    call = stitch.spawn(payload)
    return {"call_id": call.object_id, "status": "running"}


@app.function(image=image, timeout=60, secrets=[auth_secret])
@modal.fastapi_endpoint(method="GET")
def stitch_result(call_id: str = "", x_talla_token: str | None = Header(default=None)) -> dict:
    """Non-blocking poll (get(timeout=0))."""
    from talla_common import poll_call, require_token
    require_token(x_talla_token)
    return poll_call(call_id)


@app.function(image=image, timeout=60, secrets=[auth_secret])
@modal.fastapi_endpoint(method="POST")
def stitch_cancel(payload: dict, x_talla_token: str | None = Header(default=None)) -> dict:
    """POST {call_id} -> cancel an abandoned stitch so it stops billing (WP-H)."""
    from talla_common import cancel_call, require_token
    require_token(x_talla_token)  # 401 before touching Modal
    return cancel_call((payload or {}).get("call_id"))


@app.function(image=image, volumes={"/outputs": outputs}, timeout=300, secrets=[auth_secret])
@modal.fastapi_endpoint(method="GET")
def file_http(name: str = "", x_talla_token: str | None = Header(default=None)):
    """GET ?name=<basename> -> stream that file from talla-outputs (contract
    §4). The Worker proxies this as /api/media/file/<name>. Strict basename
    regex: no '/', no '..' path parts, media extensions only."""
    import os
    from fastapi import HTTPException
    from fastapi.responses import FileResponse
    from talla_common import media_type, require_token, volume_path
    require_token(x_talla_token)
    try:
        path = volume_path(name)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid name")
    outputs.reload()  # files committed by other containers since this one started
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path, media_type=media_type(name),
                        headers={"Cache-Control": "private, max-age=3600"})
