import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT_VIDEO = ROOT / "data" / "demo" / "talla_demo_rcpt.mp4"
QA_DIR = ROOT / "data" / "qa" / "subtitles"
QA_DIR.mkdir(parents=True, exist_ok=True)
OUT_VIDEO = QA_DIR / "talla_demo_subtitled.mp4"
ASS_PATH = QA_DIR / "test_subtitles.ass"

def format_ass_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int(round((s - int(s)) * 100))
    if cs >= 100:
        cs = 0
        sec += 1
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

def clean_caption_text(text: str) -> str:
    t = str(text or "").replace("\r", "\n")
    t = re.sub(r"\s*\[(?:long )?(?:pause|beat)\]\s*", " ", t, flags=re.I)
    t = "\n".join(line.strip() for line in t.split("\n") if line.strip())
    # Defuse ASS formatting / curly braces
    return t.replace("{", "(").replace("}", ")")

def caption_chunks_strict(text: str, max_words: int = 4, max_chars: int = 22) -> list[str]:
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cand = (" " + w) if cur else w
        cur_chars = sum(len(x) for x in cur) + (len(cur) - 1 if cur else 0)
        if cur and (len(cur) >= max_words or (cur_chars + len(cand) > max_chars) or cur[-1][-1:] in ".!?"):
            chunks.append(" ".join(cur))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        chunks.append(" ".join(cur))
    return chunks

def split_like_strict(text: str, chunks: list[str]) -> list[str]:
    words = text.split()
    n = len(chunks)
    if n <= 1 or not words:
        return [text] + [""] * max(0, n - 1)
    weights = [max(1, len(c.split())) for c in chunks]
    total_w = sum(weights)
    out, k, acc = [], 0, 0
    for i in range(n):
        acc += weights[i]
        j = round(len(words) * acc / total_w)
        out.append(" ".join(words[k:j]))
        k = j
    return out

def build_ass(lines: list, durations: list) -> str:
    header = """[Script Info]
Title: Talla Kinetic Two-Row Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Spoken,Noto Sans,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,0,2,60,60,330,1
Style: English,Noto Sans,44,&H0080FFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,60,60,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    t = 0.0
    for i, line in enumerate(lines or []):
        line = line if isinstance(line, dict) else {"text": str(line)}
        try:
            dur = float(durations[i]) if i < len(durations) else float(line.get("seconds") or 5.0)
        except (TypeError, ValueError):
            dur = 5.0

        raw_text = clean_caption_text(line.get("text", ""))
        chunks = caption_chunks_strict(raw_text, max_words=4, max_chars=22)
        if not chunks:
            t += dur
            continue

        raw_eng = clean_caption_text(line.get("english", "")).replace("\n", " ")
        if raw_eng.lower() == raw_text.lower().replace("\n", " "):
            raw_eng = ""

        eng_chunks = split_like_strict(raw_eng, chunks) if raw_eng else [""] * len(chunks)
        total_chars = sum(len(c) for c in chunks) or 1
        ct = t
        for c, e in zip(chunks, eng_chunks):
            cd = dur * len(c) / total_chars
            st_str = format_ass_time(ct)
            et_str = format_ass_time(ct + cd)
            # Spoken dialogue event
            events.append(f"Dialogue: 0,{st_str},{et_str},Spoken,,0,0,0,,{c}")
            # English translation event (if present)
            if e.strip():
                events.append(f"Dialogue: 0,{st_str},{et_str},English,,0,0,0,,{e.strip()}")
            ct += cd
        t += dur

    return header + "\n".join(events) + "\n"

# Test script on the 13.55s talla_demo_rcpt video
test_lines = [
    {
        "text": "Omo see how I dey struggle with paper receipts!",
        "english": "Look how I struggle with paper receipts!",
        "seconds": 4.5
    },
    {
        "text": "Every single day stress just full my head!",
        "english": "Stress filled my head every single day!",
        "seconds": 4.5
    },
    {
        "text": "Rcpt app clear everything fast fast now.",
        "english": "Rcpt app resolved everything immediately.",
        "seconds": 4.55
    }
]

ass_content = build_ass(test_lines, [4.5, 4.5, 4.55])
ASS_PATH.write_text(ass_content, encoding="utf-8")
print(f"Wrote ASS file to {ASS_PATH}")

# Burn subtitles with ffmpeg using libass (subtitles= filter)
# Windows path escaping for ffmpeg filter: escape colon and backslashes
ass_escaped = str(ASS_PATH).replace("\\", "/").replace(":", "\\:")
cmd = [
    "ffmpeg", "-y",
    "-i", str(INPUT_VIDEO),
    "-vf", f"subtitles='{ass_escaped}'",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
    "-c:a", "copy",
    str(OUT_VIDEO)
]
print("Running ffmpeg...")
res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("FFmpeg error:", res.stderr[-500:])
    raise RuntimeError("FFmpeg burning failed")
print(f"Burned video created: {OUT_VIDEO}")

# Extract 6 frames at different timestamps
timestamps = [1.0, 2.5, 5.0, 7.5, 10.0, 12.0]
for ts in timestamps:
    frame_path = QA_DIR / f"frame_{ts:.1f}s.png"
    cmd_frame = [
        "ffmpeg", "-y",
        "-ss", str(ts),
        "-i", str(OUT_VIDEO),
        "-frames:v", "1",
        str(frame_path)
    ]
    subprocess.run(cmd_frame, check=True, capture_output=True)
    print(f"Extracted frame at {ts}s -> {frame_path.name}")

print("ALL_FRAMES_EXTRACTED")
