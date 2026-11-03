import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LTX_CLIP = ROOT / "data" / "downloads" / "ltx_1793651637_a1cfc011.mp4"
PROOF_PNG = ROOT / "data" / "proof" / "rcpt_payment_verified_fullscreen.png"
PIP_PNG = ROOT / "data" / "proof" / "rcpt_receipt_bisi.png"
QA_PROOF_DIR = ROOT / "data" / "qa" / "proof"
QA_PROOF_DIR.mkdir(parents=True, exist_ok=True)

NORM_V = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24"

# 1. First test: Trim last 0.5s of LTX clip (artifact guard: drops melting frames) and normalise to 1080x1920
# Probe duration
dur_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(LTX_CLIP)]
raw_dur = float(subprocess.check_output(dur_cmd).strip())
trimmed_dur = max(1.0, raw_dur - 0.5)
print(f"Original LTX duration: {raw_dur:.3f}s -> Trimmed artifact guard duration: {trimmed_dur:.3f}s")

norm_ltx = QA_PROOF_DIR / "ltx_trimmed_norm.mp4"
cmd_norm = [
    "ffmpeg", "-y",
    "-i", str(LTX_CLIP),
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-filter_complex", f"[0:v]trim=0:{trimmed_dur:.3f},setpts=PTS-STARTPTS,{NORM_V}[v];[1:a]apad[a]",
    "-map", "[v]", "-map", "[a]",
    "-t", f"{trimmed_dur:.3f}",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac",
    str(norm_ltx)
]
subprocess.run(cmd_norm, check=True)
print(f"Created normalised LTX clip: {norm_ltx}")

# 2. Test Fullscreen proof cutaway (for the last half of the scene)
# head = trimmed_dur / 2, rest = trimmed_dur - head
head = trimmed_dur * 0.45
rest = trimmed_dur - head
fullscreen_out = QA_PROOF_DIR / "proof_fullscreen_composite.mp4"

cmd_fullscreen = [
    "ffmpeg", "-y",
    "-i", str(norm_ltx),
    "-loop", "1", "-framerate", "24", "-t", f"{trimmed_dur:.3f}", "-i", str(PROOF_PNG),
    "-filter_complex",
    f"[0:v]trim=0:{head:.3f},setpts=PTS-STARTPTS[head];"
    f"[1:v]{NORM_V},tpad=stop_mode=clone:stop_duration={rest:.3f},trim=0:{rest:.3f},setpts=PTS-STARTPTS[proof];"
    f"[head][proof]concat=n=2:v=1:a=0,format=yuv420p[outv]",
    "-map", "[outv]", "-map", "0:a:0",
    "-t", f"{trimmed_dur:.3f}",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "copy",
    str(fullscreen_out)
]
subprocess.run(cmd_fullscreen, check=True)
print(f"Created fullscreen proof cutaway: {fullscreen_out}")

# 3. Test PIP overlay mode
pip_out = QA_PROOF_DIR / "proof_pip_composite.mp4"
start_pip = trimmed_dur * 0.2
len_pip = trimmed_dur * 0.6
cmd_pip = [
    "ffmpeg", "-y",
    "-i", str(norm_ltx),
    "-loop", "1", "-framerate", "24", "-t", f"{trimmed_dur:.3f}", "-i", str(PIP_PNG),
    "-filter_complex",
    f"[1:v]scale=880:1170:force_original_aspect_ratio=increase,crop=880:1170,setsar=1,fps=24,"
    f"drawbox=x=0:y=0:w=iw:h=ih:c=white@0.9:t=6,tpad=stop_mode=clone:stop_duration={trimmed_dur:.3f}[v2];"
    f"[0:v][v2]overlay=x=100:y=380:enable='between(t,{start_pip:.2f},{(start_pip + len_pip):.2f})',format=yuv420p[outv]",
    "-map", "[outv]", "-map", "0:a:0",
    "-t", f"{trimmed_dur:.3f}",
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "copy",
    str(pip_out)
]
subprocess.run(cmd_pip, check=True)
print(f"Created PIP proof overlay: {pip_out}")

# 4. Extract 4 frames from fullscreen composite
timestamps = [0.5, 1.0, 1.6, 2.2]
for ts in timestamps:
    fp = QA_PROOF_DIR / f"frame_fullscreen_{ts:.1f}s.png"
    subprocess.run(["ffmpeg", "-y", "-ss", str(ts), "-i", str(fullscreen_out), "-frames:v", "1", str(fp)], check=True, capture_output=True)
    print(f"Extracted fullscreen frame: {fp.name}")

# Also extract 2 frames from PIP composite
for ts in [1.0, 1.8]:
    fp = QA_PROOF_DIR / f"frame_pip_{ts:.1f}s.png"
    subprocess.run(["ffmpeg", "-y", "-ss", str(ts), "-i", str(pip_out), "-frames:v", "1", str(fp)], check=True, capture_output=True)
    print(f"Extracted PIP frame: {fp.name}")

print("PROOF_VERIFICATION_COMPLETE")
