"""Smart UGC Video Pipeline:
- A-roll (Scene 1 & Scene 5): InfiniteTalk on Modal using aisha.webp (exact 100% avatar face consistency).
  Sequential execution reuses the warm H100 container to eliminate cold-start overhead and minimize credits.
- B-roll (Scenes 2, 3, 4): generated image-to-video motion (Modal LTX 2.5) + YarnGPT audio. No Ken Burns.
- Concat & Single-track Hausa kinetic captions cleanly positioned in the lower third.
"""
import os
import json
import base64
import time
import requests
import subprocess

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
TOKEN = os.environ.get("TALLA_ENDPOINT_TOKEN") or os.environ.get("MODAL_ENDPOINT_TOKEN")
if not TOKEN:
    raise RuntimeError("TALLA_ENDPOINT_TOKEN not found in environment or .env")
TALK_GEN_URL = "https://akinspajo--talla-talk-generate-http.us-east.modal.run"
TALK_RES_URL = "https://akinspajo--talla-talk-generate-result.us-east.modal.run"
FILE_URL = "https://akinspajo--talla-stitch-file-http.us-east.modal.run"

BASE_DIR = r"C:\Users\DELL\Downloads\Talla"
STORYBOARD_DIR = os.path.join(BASE_DIR, r"talla\data\hausa_storyboard")
AVATAR_PATH = os.path.join(BASE_DIR, r"talla\web\public\avatars\aisha.webp")
AUDIO_MANIFEST_PATH = os.path.join(STORYBOARD_DIR, "hausa_audio_manifest.json")
OUTPUT_DIR = os.path.join(BASE_DIR, r"talla\data\hausa_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_pure_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def get_media_duration(path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())

WAN_GEN_URL = "https://akinspajo--talla-wan-generate-http.us-east.modal.run"
WAN_RES_URL = "https://akinspajo--talla-wan-generate-result.us-east.modal.run"

# Real physical motion per beat. No zoompan: every B-roll clip is generated.
BROLL_PROMPTS = {
    2: "handheld phone-camera feel, a shopkeeper's hands pick up a worn paper receipt, "
       "look at it, frown and shake head slightly, natural hand motion, soft breathing sway",
    3: "handheld phone-camera feel, a shopkeeper taps and swipes a smartphone held in one hand, "
       "thumb scrolling, small natural hand tremor, nods with a pleased expression",
    4: "handheld selfie feel, a woman exhales with relief and breaks into a big smile, "
       "raises one hand in an excited gesture, head tilts, natural blinking",
}

def run_wan_broll(img_path, prompt, seconds, out_raw, seed=2007):
    """Image-to-video on Modal LTX 2.5 (silent; Wan 2.2 is ~$1.90 and ~29 min per clip, fallback only). Spawn, poll, download."""
    payload = {
        "engine": "ltx",
        "keyframe_b64": get_pure_b64(img_path),
        "prompt": prompt,
        "seconds": min(max(seconds, 1.0), 10.6),
        "seed": seed,
    }
    headers = {"Content-Type": "application/json", "X-Talla-Token": TOKEN}
    resp = requests.post(WAN_GEN_URL, json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Wan spawn failed ({resp.status_code}): {resp.text}")
    call_id = resp.json()["call_id"]
    t0 = time.time()
    while True:
        data = requests.get(f"{WAN_RES_URL}?call_id={call_id}", headers=headers, timeout=30).json()
        status = data.get("status")
        if status == "complete":
            f_resp = requests.get(f"{FILE_URL}?name={data['clip_volume_path']}", headers=headers, timeout=120)
            f_resp.raise_for_status()
            with open(out_raw, "wb") as f_out:
                f_out.write(f_resp.content)
            print(f"Wan clip ready in {time.time() - t0:.0f}s -> {os.path.basename(out_raw)}")
            return out_raw
        if status == "error":
            raise RuntimeError(f"Wan error: {data.get('error')}")
        time.sleep(10)

def make_broll_clip(img_path, audio_path, dur, out_mp4, prompt):
    """Generated B-roll muxed with the voice. If the voice outlasts the clip (LTX caps ~10.6s),
    the last frame is held rather than looped or panned."""
    raw = out_mp4.replace(".mp4", "_wan.mp4")
    run_wan_broll(img_path, prompt, dur, raw)
    vf = ("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,"
          "tpad=stop_mode=clone:stop_duration=6,format=yuv420p")
    cmd = [
        "ffmpeg", "-y", "-i", raw, "-i", audio_path,
        "-filter_complex", f"[0:v]{vf}[v];[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "192k", "-t", str(dur),
        out_mp4
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"Generated B-roll clip: {os.path.basename(out_mp4)} ({dur:.2f}s)")

def run_talking_head(audio_vol_path, prompt, out_mp4, seed=2007):
    """Spawn InfiniteTalk job on Modal and poll until downloaded."""
    b64 = get_pure_b64(AVATAR_PATH)
    payload = {
        "keyframe_b64": b64,
        "audio_volume_path": audio_vol_path,
        "prompt": prompt,
        "seed": seed,
        "steps": 4
    }
    headers = {"Content-Type": "application/json", "X-Talla-Token": TOKEN}
    print(f"Spawning InfiniteTalk for {audio_vol_path}...")
    resp = requests.post(TALK_GEN_URL, json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Spawn failed ({resp.status_code}): {resp.text}")
    call_id = resp.json()["call_id"]
    print(f"Spawned call_id={call_id}. Polling result...")

    t0 = time.time()
    while True:
        r = requests.get(f"{TALK_RES_URL}?call_id={call_id}", headers=headers, timeout=30)
        data = r.json()
        status = data.get("status")
        if status == "complete":
            clip_vol = data["clip_volume_path"]
            elapsed = time.time() - t0
            print(f"InfiniteTalk completed in {elapsed:.1f}s -> {clip_vol}")
            # Stream to local file
            f_resp = requests.get(f"{FILE_URL}?name={clip_vol}", headers=headers, timeout=60)
            if f_resp.status_code == 200:
                with open(out_mp4, "wb") as f_out:
                    f_out.write(f_resp.content)
                print(f"Saved talking head: {os.path.basename(out_mp4)} ({len(f_resp.content)} bytes)")
                return out_mp4
            else:
                raise RuntimeError(f"Failed to download clip: {f_resp.status_code}")
        elif status == "error":
            raise RuntimeError(f"InfiniteTalk error: {data.get('error')}")
        else:
            time.sleep(5)
            print(f"  ... job {call_id[:12]} still running ({time.time() - t0:.0f}s)")

def normalize_talking_head(in_mp4, out_mp4):
    """Normalize talking head video to strictly 1080x1920 24fps stereo."""
    cmd = [
        "ffmpeg", "-y", "-i", in_mp4,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,format=yuv420p",
        "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        out_mp4
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def format_timestamp(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def run_pipeline():
    print("=" * 60)
    print("STARTING SMART UGC GENERATION & ASSEMBLY")
    print("=" * 60)

    with open(AUDIO_MANIFEST_PATH, "r", encoding="utf-8") as f:
        audio_items = json.load(f)
    audio_by_n = {item["n"]: item for item in audio_items}

    # Step 1: Render Scene 1 (Hook) via InfiniteTalk
    print("\n--- [Beat 1/5: Hook A-roll] Rendering with InfiniteTalk ---")
    sc1_audio = audio_by_n[1]
    raw_sc1 = os.path.join(OUTPUT_DIR, "scene_1_raw_talk.mp4")
    run_talking_head(
        sc1_audio["volume_path"],
        prompt="A Nigerian Muslim woman named Aisha wearing a terracotta hijab talking expressively to camera, confession hook, natural gestures",
        out_mp4=raw_sc1,
        seed=2007
    )
    norm_sc1 = os.path.join(OUTPUT_DIR, "scene_1_talk.mp4")
    normalize_talking_head(raw_sc1, norm_sc1)

    # Step 2: Render Scene 5 (CTA) via InfiniteTalk (re-using warm H100)
    print("\n--- [Beat 5/5: CTA A-roll] Rendering with InfiniteTalk (Warm H100) ---")
    sc5_audio = audio_by_n[5]
    raw_sc5 = os.path.join(OUTPUT_DIR, "scene_5_raw_talk.mp4")
    run_talking_head(
        sc5_audio["volume_path"],
        prompt="A Nigerian Muslim woman named Aisha wearing a terracotta hijab smiling warmly and waving goodbye to camera, friendly CTA",
        out_mp4=raw_sc5,
        seed=2007
    )
    norm_sc5 = os.path.join(OUTPUT_DIR, "scene_5_talk.mp4")
    normalize_talking_head(raw_sc5, norm_sc5)

    # Step 3: Render B-roll clips (Scenes 2, 3, 4) with generated Wan motion
    print("\n--- [Beats 2, 3, 4: B-roll] Generating image-to-video ---")
    # Scene 2 (Pain)
    sc2_audio = audio_by_n[2]
    sc2_img = os.path.join(STORYBOARD_DIR, "scene_2_pain_broll.webp")
    sc2_mp4 = os.path.join(OUTPUT_DIR, "scene_2_broll.mp4")
    make_broll_clip(sc2_img, sc2_audio["local_path"], sc2_audio["duration_s"], sc2_mp4, BROLL_PROMPTS[2])

    # Scene 3 (Demo)
    sc3_audio = audio_by_n[3]
    sc3_img = os.path.join(STORYBOARD_DIR, "scene_3_demo_broll.webp")
    sc3_mp4 = os.path.join(OUTPUT_DIR, "scene_3_broll.mp4")
    make_broll_clip(sc3_img, sc3_audio["local_path"], sc3_audio["duration_s"], sc3_mp4, BROLL_PROMPTS[3])

    # Scene 4 (Relief)
    sc4_audio = audio_by_n[4]
    sc4_img = os.path.join(STORYBOARD_DIR, "scene_4_relief_aisha.webp")
    sc4_mp4 = os.path.join(OUTPUT_DIR, "scene_4_relief.mp4")
    make_broll_clip(sc4_img, sc4_audio["local_path"], sc4_audio["duration_s"], sc4_mp4, BROLL_PROMPTS[4])

    # Step 4: Stitch All 5 Scenes
    print("\n--- Assembling Final Timeline ---")
    scenes = [
        {"n": 1, "clip": norm_sc1, "text": sc1_audio["text"]},
        {"n": 2, "clip": sc2_mp4, "text": sc2_audio["text"]},
        {"n": 3, "clip": sc3_mp4, "text": sc3_audio["text"]},
        {"n": 4, "clip": sc4_mp4, "text": sc4_audio["text"]},
        {"n": 5, "clip": norm_sc5, "text": sc5_audio["text"]}
    ]

    concat_list_file = os.path.join(OUTPUT_DIR, "concat_list.txt")
    subtitles = []
    curr_time = 0.0

    with open(concat_list_file, "w", encoding="utf-8") as f:
        for s in scenes:
            clip_dur = get_media_duration(s["clip"])
            escaped_path = s["clip"].replace("\\", "/")
            f.write(f"file '{escaped_path}'\n")
            subtitles.append((curr_time, curr_time + clip_dur, s["text"]))
            print(f"  Scene {s['n']}: duration {clip_dur:.2f}s ({os.path.basename(s['clip'])})")
            curr_time += clip_dur

    print(f"Total Video Duration: {curr_time:.2f}s")

    stitched_raw = os.path.join(OUTPUT_DIR, "stitched_raw.mp4")
    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list_file,
        "-c", "copy",
        stitched_raw
    ]
    subprocess.run(cmd, check=True)
    print(f"Raw stitched video ready: {stitched_raw}")

    # Step 5: Generate Clean Kinetic Subtitles & Burn into Final Video
    srt_file = os.path.join(OUTPUT_DIR, "captions.srt")
    with open(srt_file, "w", encoding="utf-8") as f:
        for idx, (start, end, txt) in enumerate(subtitles, 1):
            f.write(f"{idx}\n")
            f.write(f"{format_timestamp(start)} --> {format_timestamp(end)}\n")
            f.write(f"{txt}\n\n")

    final_output = os.path.join(OUTPUT_DIR, "talla_aisha_winning_ugc_final.mp4")
    srt_escaped = srt_file.replace("\\", "/").replace(":", r"\:")
    
    # Modern UGC Subtitle Styling:
    # Yellow highlighted text, bold Segoe UI, clean black shadow/outline, safe margin from bottom
    sub_style = (
        "Fontname=Segoe UI,FontSize=18,Bold=1,"
        "PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,"  # &H0000FFFF is bright vibrant yellow
        "BorderStyle=1,Outline=2,Shadow=1,MarginV=120,Alignment=2"
    )

    burn_cmd = [
        "ffmpeg", "-y", "-i", stitched_raw,
        "-vf", f"subtitles='{srt_escaped}':force_style='{sub_style}'",
        "-c:v", "libx264", "-crf", "18", "-preset", "fast",
        "-c:a", "copy",
        final_output
    ]
    subprocess.run(burn_cmd, check=True)
    print("\n" + "=" * 60)
    print(f"FINAL SMART UGC VIDEO GENERATED SUCCESSFULLY!")
    print(f"Output path: {final_output}")
    print(f"Final Duration: {get_media_duration(final_output):.2f}s")
    print("=" * 60)

if __name__ == "__main__":
    run_pipeline()
