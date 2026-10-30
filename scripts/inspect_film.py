"""Film inspection harness (FFmpeg/ffprobe only, $0).

Given a finished film (local mp4), produces the technical inspection pack
used to judge calibration renders against the winning-UGC reference:
duration/streams, loudness (integrated LUFS), volumedetect, freeze-tail
measurement (how many final seconds are a held/cloned frame), and
sampled frames for eyeball comparison.

Usage: python scripts/inspect_film.py <film.mp4> [frames_dir]
"""
import json
import subprocess
import sys
from pathlib import Path


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    r = run(["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(path)])
    return json.loads(r.stdout)


def freezedetect_tail(path):
    """Report total freeze seconds. Primary: freezedetect (sensitive
    settings). Cross-check: compare the frame at (dur-2.5s) with the frame at
    (dur-0.3s) — a cloned tail is pixel-identical (SSIM ~1.0), real motion
    is not. The SSIM check is what judges the calibration's held-frame tail."""
    info = probe(path)
    dur = float(info["format"]["duration"])
    r = run(["ffmpeg", "-v", "info", "-i", str(path),
             "-vf", "freezedetect=n=0.001:d=0.4", "-map", "0:v:0",
             "-f", "null", "-"])
    durs = []
    for line in r.stderr.splitlines():
        if "freeze_duration:" in line:
            try:
                durs.append(float(line.split("freeze_duration:")[1].strip().split()[0]))
            except Exception:
                pass
    total_freeze = sum(durs)
    tail_ssim = None
    if dur > 3:
        rr = run(["ffmpeg", "-v", "info",
                  "-ss", str(dur - 2.5), "-i", str(path),
                  "-ss", str(dur - 0.3), "-i", str(path),
                  "-lavfi", "ssim", "-f", "null", "-"])
        for line in rr.stderr.splitlines():
            if "SSIM" in line and "All:" in line:
                try:
                    tail_ssim = float(line.split("All:")[1].strip().split()[0])
                except Exception:
                    pass
    return {"duration_s": round(dur, 2), "freeze_events": len(durs),
            "total_freeze_s": round(total_freeze, 2),
            "freeze_pct": round(100 * total_freeze / dur, 1) if dur else 0,
            "tail_frame_ssim": tail_ssim,
            "tail_verdict": ("held-frame tail (cloned)" if (tail_ssim or 0) > 0.995
                             else "tail keeps moving" if tail_ssim is not None else "unknown")}


def loudness(path):
    r = run(["ffmpeg", "-i", str(path), "-af", "loudnorm=print_format=json",
             "-map", "0:a:0", "-f", "null", "-"])
    tail = r.stderr[r.stderr.rfind("{"):]
    try:
        d = json.loads(tail[: tail.rfind("}") + 1])
        return {"integrated_lufs": d.get("input_i"), "true_peak_db": d.get("input_tp")}
    except Exception:
        return {"integrated_lufs": None, "true_peak_db": None}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    film = Path(sys.argv[1])
    frames_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    info = probe(film)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), {})
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), {})
    report = {
        "file": str(film),
        "duration_s": round(float(info["format"]["duration"]), 2),
        "video": {"codec": v.get("codec_name"), "size": f'{v.get("width")}x{v.get("height")}',
                  "fps": v.get("r_frame_rate")},
        "audio": {"codec": a.get("codec_name"), "sample_rate": a.get("sample_rate")},
        "loudness": loudness(film),
        "freeze": freezedetect_tail(film),
    }
    print(json.dumps(report, indent=2))
    if frames_dir:
        frames_dir.mkdir(parents=True, exist_ok=True)
        dur = float(info["format"]["duration"])
        for i, t in enumerate([0.5, dur / 2, max(dur - 0.5, 0.1)]):
            out = frames_dir / f"frame_{i}.jpg"
            run(["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", str(film),
                 "-frames:v", "1", "-q:v", "3", str(out)])
        print(f"frames -> {frames_dir}")


if __name__ == "__main__":
    main()
