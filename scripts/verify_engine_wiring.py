"""Offline, $0 wiring check for every Talla Modal app (no Modal SDK calls,
no GPU, no network). Mocks `modal`, imports each app, and asserts the
hardening contract (2026-10-30):

  * checkpoints: Wan A14B + LTX-2.5 (never the dead ids)
  * Wan grid 720x1280 vertical, 16 fps, 4n+1 frames capped at 81
  * LTX is a @app.cls with @modal.enter load; 8n+1 frames capped at 257 @ 24 fps
  * every GPU class/function has max_containers=1
  * every fastapi_endpoint checks X-Talla-Token BEFORE any spawn/remote, has
    the talla-endpoint-auth secret attached, and fails closed (401) when the
    env var is missing or the token is wrong
  * protobuf==4.25.8 pinned on every image that mounts volumes
  * file_http name regex rejects path tricks, accepts contract names
  * tts_app never serves Igbo (routes to YarnGPT)
  * stitch: SRT escaping + (if ffmpeg on PATH) a real normalise+overlay+concat
    run on two synthetic clips proving 1080x1920 @ 24 fps with continuous
    48 kHz stereo audio and the voice landing in the right segment.

Usage: python scripts/verify_engine_wiring.py
"""
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODAL_DIR = ROOT / "modal"
sys.path.insert(0, str(MODAL_DIR))  # talla_common, r2 import like in-container
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

APPS = ["wan_app", "stitch_app", "yarngpt_app", "tts_app", "h3_app", "lipsync_app"]
PROTOBUF_PIN = "protobuf==4.25.8"


# ---------------------------------------------------------------- modal mock
class _Secret:
    def __init__(self, name, **k):
        self.name = name

    @staticmethod
    def from_name(name, **k):
        return _Secret(name, **k)


class _Vol:
    def __init__(self, name):
        self.name = name

    @staticmethod
    def from_name(name, **k):
        return _Vol(name)

    def commit(self):
        pass

    def reload(self):
        pass


class _Img:
    def __init__(self):
        self.pip, self.apt, self.local = [], [], []

    @staticmethod
    def debian_slim(*a, **k):
        return _Img()

    def apt_install(self, *a, **k):
        self.apt += a
        return self

    def uv_pip_install(self, *a, **k):
        self.pip += a
        return self

    pip_install = uv_pip_install

    def run_commands(self, *a, **k):
        return self

    def env(self, *a, **k):
        return self

    def add_local_python_source(self, *a, **k):
        self.local += a
        return self


class _App:
    def __init__(self, name):
        self.name, self.registered = name, []

    def _reg(self, kind, k):
        def d(obj):
            obj._modal_kind, obj._modal_kwargs = kind, k
            self.registered.append(obj)
            return obj
        return d

    def cls(self, *a, **k):
        return self._reg("cls", k)

    def function(self, *a, **k):
        return self._reg("function", k)

    def local_entrypoint(self, *a, **k):
        return lambda f: f


def _endpoint(*a, **k):
    def d(f):
        f._endpoint = k.get("method", "GET")
        return f
    return d


m = types.ModuleType("modal")
m.Volume, m.Image, m.Secret = _Vol, _Img, _Secret
m.App = lambda name, *a, **k: _App(name)
m.FunctionCall = types.SimpleNamespace(from_id=None)
m.functions = types.SimpleNamespace(FunctionCall=m.FunctionCall)
m.enter = lambda *a, **k: (lambda f: setattr(f, "_enter", True) or f)
m.method = lambda *a, **k: (lambda f: f)
m.fastapi_endpoint = _endpoint
sys.modules["modal"] = m

from fastapi import HTTPException  # noqa: E402  (fastapi is a local dev dep)
import talla_common as tc  # noqa: E402

FAILS = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("  FAIL:", msg)


def load_app(name):
    src = (MODAL_DIR / f"{name}.py").read_text(encoding="utf-8")
    g = {"__name__": f"verify_{name}"}
    exec(compile(src, f"{name}.py", "exec"), g)
    return src, g


def expect_status(fn, code, *a, **k):
    try:
        fn(*a, **k)
    except HTTPException as e:
        return e.status_code == code
    return False


def endpoint_auth_order(src):
    """For every fastapi_endpoint def: require_token must be called before
    any .spawn/.remote/poll/cancel/FileResponse and the token arg must exist."""
    bad = []
    for node in ast.walk(ast.parse(src)):
        if not isinstance(node, ast.FunctionDef):
            continue
        if not any("fastapi_endpoint" in ast.unparse(d) for d in node.decorator_list):
            continue
        args = [a.arg for a in node.args.args]
        if "x_talla_token" not in args:
            bad.append(f"{node.name}: no x_talla_token header arg")
        calls = sorted((c.lineno, ast.unparse(c.func)) for c in ast.walk(node) if isinstance(c, ast.Call))
        auth = [ln for ln, f in calls if f.endswith("require_token")]
        work = [ln for ln, f in calls if re.search(r"(spawn|remote|poll_call|cancel_call|FileResponse|_payload)$", f)]
        if not auth:
            bad.append(f"{node.name}: no require_token call")
        elif work and min(work) < min(auth):
            bad.append(f"{node.name}: work before auth")
    return bad


# ------------------------------------------------------------ static checks
print("[1] talla_common: auth + names")
check(not tc.token_ok("x", ""), "token_ok must fail closed on empty expected")
check(not tc.token_ok("", "x"), "token_ok must reject empty supplied")
check(not tc.token_ok("abc", "abd"), "token_ok must reject wrong token")
check(tc.token_ok("s3cret", "s3cret"), "token_ok must accept matching token")
for bad in ["../x.mp4", "a/b.mp4", "/x.mp4", "..\\x.mp4", "x.exe", "", ".hidden.mp4", "x.mp4/", "x.MP4 ", None]:
    try:
        tc.safe_name(bad)
        check(False, f"safe_name accepted {bad!r}")
    except ValueError:
        pass
for good in ["final_1_ab12cd34.mp4", "yarn_1793287035.wav", "proof-card.png", "a.webp", "b.jpg", "c.mp3"]:
    try:
        tc.safe_name(good)
    except ValueError:
        check(False, f"safe_name rejected {good!r}")
check(re.fullmatch(r"final_\d{10}_[0-9a-f]{8}\.mp4", tc.out_name("final", "mp4")) is not None,
      "out_name must be <prefix>_<unix>_<8hex>.<ext>")
check(tc.out_name("x", "mp4") != tc.out_name("x", "mp4"), "out_name must be collision-safe")

apps = {}
for name in APPS:
    apps[name] = load_app(name)

print("[2] endpoints: token before work, secret attached, fail closed")
for name, (src, g) in apps.items():
    for b in endpoint_auth_order(src):
        check(False, f"{name}.{b}")
    eps = [o for o in g["app"].registered if getattr(o, "_endpoint", None)]
    check(eps, f"{name}: no endpoints found")
    for ep in eps:
        secrets_ = [s.name for s in ep._modal_kwargs.get("secrets", []) if hasattr(s, "name")]
        check("talla-endpoint-auth" in secrets_, f"{name}.{ep.__name__}: talla-endpoint-auth secret not attached")
    check("talla_common" in g["image"].local, f"{name}: talla_common not mounted in image")

# Behavioural: wan generate_http refuses before spawn, then spawns with the token.
_, wan = apps["wan_app"]
spawned = []


class _FakeEngine:
    def __init__(self):
        self.generate = types.SimpleNamespace(
            spawn=lambda p: spawned.append(p) or types.SimpleNamespace(object_id="fc-TEST123456"))


wan["WanEngine"] = wan["LTXEngine"] = _FakeEngine
os.environ.pop(tc.TOKEN_ENV, None)
check(expect_status(wan["generate_http"], 401, {"engine": "wan"}, x_talla_token="anything"),
      "wan generate_http must 401 when TALLA_ENDPOINT_TOKEN is unset (fail closed)")
os.environ[tc.TOKEN_ENV] = "verify-token"
check(expect_status(wan["generate_http"], 401, {"engine": "wan"}, x_talla_token=None), "wan: missing header must 401")
check(expect_status(wan["generate_http"], 401, {"engine": "wan"}, x_talla_token="nope"), "wan: wrong token must 401")
check(not spawned, "wan: a spawn happened before auth succeeded")
r = wan["generate_http"]({"engine": "ltx"}, x_talla_token="verify-token")
check(len(spawned) == 1 and r["engine"] == "ltx" and r["call_id"].startswith("fc-"), "wan: authorised spawn failed")
for ep_name in ["generate_result", "cancel_http", "engine_health"]:
    fn = wan[ep_name]
    args = ({"call_id": "fc-x"},) if ep_name == "cancel_http" else ()
    check(expect_status(fn, 401, *args, x_talla_token="nope"), f"wan.{ep_name} must 401 on wrong token")
check(wan["generate_result"]("../etc", x_talla_token="verify-token")["status"] == "error",
      "result endpoint must reject malformed call_id without touching Modal")

_, st = apps["stitch_app"]
check(expect_status(st["file_http"], 401, "final_1_ab12cd34.mp4", x_talla_token="nope"), "file_http must 401 on wrong token")
check(expect_status(st["file_http"], 400, "../x.mp4", x_talla_token="verify-token"), "file_http must 400 on ../x.mp4")
check(expect_status(st["file_http"], 404, "final_1_ab12cd34.mp4", x_talla_token="verify-token"),
      "file_http must pass the regex for final_1_ab12cd34.mp4 (then 404: not on this machine)")

_, tts = apps["tts_app"]
check("igbo" not in tts["TTS_MODELS"], "tts_app must not map Igbo (soro-tts is not pipeline-loadable)")
check("soro-tts" not in json.dumps(tts["TTS_MODELS"]), "soro-tts mapping still present")
check(expect_status(tts["speak_http"], 400, {"text": "Ndewo", "language": "igbo"}, x_talla_token="verify-token"),
      "tts speak_http must 400 Igbo (route to YarnGPT)")
os.environ.pop(tc.TOKEN_ENV, None)
for name in ["yarngpt_app", "tts_app"]:
    src = apps[name][0]
    check("duration_s" in src, f"{name}: responses must carry duration_s")
    check("outputs.commit()" in src and "upload_or_volume" in src, f"{name}: commit-then-safe-upload missing")
    check(src.index("outputs.commit()") < src.index("upload_or_volume(path"), f"{name}: commit must precede upload")

print("[3] cost caps + protobuf pin")
for name, (src, g) in apps.items():
    for obj in g["app"].registered:
        k = obj._modal_kwargs
        if k.get("gpu"):
            check(k.get("max_containers") == 1, f"{name}.{obj.__name__}: GPU without max_containers=1")
            check(k.get("timeout"), f"{name}.{obj.__name__}: GPU without explicit timeout")
    if any(o._modal_kwargs.get("volumes") for o in g["app"].registered):
        check(PROTOBUF_PIN in g["image"].pip, f"{name}: mounts volumes but image lacks {PROTOBUF_PIN}")
check("fonts-noto-core" in apps["stitch_app"][1]["image"].apt, "stitch: fonts-noto-core not installed")
for dep in ["ftfy", "regex", "opencv-python-headless"]:
    check(dep in wan["image"].pip, f"wan: {dep} missing from image")

print("[4] Wan / LTX engine wiring")
wsrc = apps["wan_app"][0]
check("Wan-AI/Wan2.2-I2V-A14B-Diffusers" in wsrc, "Wan A14B checkpoint missing")
check("Wan2.2-I2V-14B-Diffusers" not in wsrc, "dead Wan checkpoint id still present")
check("Lightricks/LTX-2.5-Diffusers" in wsrc and "LTX2ImageToVideoPipeline" in wsrc, "LTX-2.5 wiring missing")
check('Lightricks/LTX-Video"' not in wsrc, "old LTX-Video checkpoint still present")
check((wan["WAN_W"], wan["WAN_H"], wan["WAN_FPS"], wan["WAN_MAX_FRAMES"]) == (720, 1280, 16, 81), "Wan grid must be 720x1280 @16fps cap 81")
check((wan["LTX_W"], wan["LTX_H"], wan["LTX_FPS"], wan["LTX_MAX_FRAMES"]) == (768, 1344, 24, 257), "LTX grid must be 768x1344 @24fps cap 257")
for secs, want in [(1, 17), (2, 33), (5, 81), (5.06, 81), (9, 81), (15, 81), (None, 81), ("junk", 81)]:
    got = wan["wan_frames"]({"seconds": secs})
    check(got == want and (got - 1) % 4 == 0, f"wan_frames({secs}) = {got}, want {want}")
for secs, want in [(1, 25), (5, 121), (10.6, 257), (15, 257)]:
    got = wan["ltx_frames"]({"seconds": secs})
    check(got == want and (got - 1) % 8 == 0, f"ltx_frames({secs}) = {got}, want {want}")
for s in [x / 4 for x in range(0, 70)]:
    f = wan["ltx_frames"]({"seconds": s or 0.1})
    check((f - 1) % 8 == 0 and f <= 257, f"ltx_frames({s}) off-grid: {f}")
for cls_name, gpu in [("WanEngine", "H100"), ("LTXEngine", "A100-80GB")]:
    cls = next(o for o in wan["app"].registered if o.__name__ == cls_name)
    check(cls._modal_kind == "cls" and getattr(cls.load, "_enter", False), f"{cls_name} must be @app.cls with @modal.enter load")
    check(cls._modal_kwargs.get("gpu") == gpu, f"{cls_name} gpu should be {gpu}")
    check(cls._modal_kwargs.get("timeout") == 2400, f"{cls_name} timeout should be 2400")
wk = next(o for o in wan["app"].registered if o.__name__ == "WanEngine")._modal_kwargs
check(wk.get("scaledown_window") == 300, "WanEngine scaledown_window should be 300")
check("ltx_generate" not in wan, "per-call ltx_generate function (reloads 22B weights every call) still present")
gen_src = ast.unparse(next(n for n in ast.walk(ast.parse(wsrc)) if isinstance(n, ast.ClassDef) and n.name == "WanEngine"))
check("width=WAN_W" in gen_src and "height=WAN_H" in gen_src, "Wan pipe call must pass width/height")
check("_fit_cover" in gen_src, "Wan must cover-crop the keyframe to the render canvas")
check("WAN_FPS" in gen_src, "Wan clip must export at WAN_FPS")
check(30 <= wan["WAN_STEPS_DEFAULT"] <= 40, "Wan steps outside 30-40")
check(wan["_wan_steps"]({"num_inference_steps": 999}) == 40 and wan["_wan_steps"]({"num_inference_steps": 1}) == 30,
      "Wan steps must clamp to 30-40")
try:
    import numpy as np
    from PIL import Image
    fv = wan["_first_video"]
    check(fv((np.zeros((1, 9, 4, 4, 3)), None)).shape == (9, 4, 4, 3), "_first_video tuple+5D")
    check(fv(np.zeros((2, 9, 4, 4, 3))).shape == (9, 4, 4, 3), "_first_video 5D")
    check(fv(np.zeros((9, 4, 4, 3))).shape == (9, 4, 4, 3), "_first_video 4D")
    check(fv([np.zeros((1, 9, 4, 4, 3)), None]).shape == (9, 4, 4, 3), "_first_video list[5D, audio]")
    check(len(fv([[1, 2, 3]])) == 3, "_first_video list of videos")
    check(wan["_fit_cover"](Image.new("RGB", (1280, 1920)), 720, 1280).size == (720, 1280), "_fit_cover 1280x1920 -> 720x1280")
    check(wan["_fit_cover"](Image.new("RGB", (832, 480)), 768, 1344).size == (768, 1344), "_fit_cover landscape -> 768x1344")
except ImportError:
    print("  (numpy/PIL not installed: shape checks skipped)")

print("[5] stitch captions")
check(st["srt_text"]("Hello\n\n{\\fs200}world --> x") == "Hello\n(\\fs200)world -> x", "srt_text escaping")
srt = st["build_srt"]([{"text": "One"}, {"text": "  "}, {"text": "Three"}], [2.0, 1.5, 2.5])
check(srt.startswith("1\n00:00:00,000 --> 00:00:02,000\nOne") and "2\n00:00:03,500 --> 00:00:06,000\nThree" in srt,
      f"build_srt timing/numbering wrong: {srt!r}")
check("Fontname=Noto Sans" in st["CAPTION_STYLE"], "captions must force Noto Sans")


# ------------------------------------------------------------ ffmpeg tests
def ffprobe(path):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format",
                        "-show_streams", str(path)], capture_output=True, text=True)
    return json.loads(r.stdout)


def mean_volume(path, start, dur):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", str(start), "-t", str(dur), "-i", str(path),
                        "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    m_ = re.search(r"mean_volume:\s*(-?[\d.]+|-inf)", r.stderr)
    return -999.0 if not m_ or m_.group(1) == "-inf" else float(m_.group(1))


def run(cmd, cwd=None):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(map(str, cmd))[:300]}\n{r.stderr[-1500:]}")


if shutil.which("ffmpeg") and shutil.which("ffprobe"):
    print("[6] ffmpeg: normalise + overlay + concat on synthetic clips")
    scratch = os.environ.get("TALLA_VERIFY_DIR") or tempfile.mkdtemp(prefix="talla_verify_")
    work = Path(scratch)
    work.mkdir(parents=True, exist_ok=True)
    a, b, voice, card = work / "a_832x480_silent.mp4", work / "b_720x1280_tone.mp4", work / "voice24k.wav", work / "card.png"
    try:
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=832x480:rate=16", "-t", "2",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", str(a)])
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24",
             "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000", "-t", "2",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(b)])
        # Voice LONGER than clip b (2.5 s vs 2 s): proves tpad carries picture.
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=24000", "-t", "2.5",
             "-ac", "1", str(voice)])
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=orange:size=600x400", "-frames:v", "1", str(card)])
        seg_a, seg_b, seg_a_ov = work / "seg_a.mp4", work / "seg_b.mp4", work / "seg_a_ov.mp4"
        run(st["normalize_cmd"](str(a), str(seg_a), 2.0, None))
        run(st["normalize_cmd"](str(b), str(seg_b), 2.5, str(voice)))
        run(st["overlay_cmd"](str(seg_a), str(card), "pip", 2.0, str(seg_a_ov), is_image=True))
        seg_b_fs = work / "seg_b_fs.mp4"
        run(st["overlay_cmd"](str(seg_b), str(card), "fullscreen", 2.5, str(seg_b_fs), is_image=True))
        for seg in [seg_a, seg_b, seg_a_ov, seg_b_fs]:
            info = ffprobe(seg)
            v = next(s for s in info["streams"] if s["codec_type"] == "video")
            au = [s for s in info["streams"] if s["codec_type"] == "audio"]
            check((v["width"], v["height"], v["r_frame_rate"], v["pix_fmt"]) == (1080, 1920, "24/1", "yuv420p"),
                  f"{seg.name}: video not 1080x1920/24/yuv420p: {v['width']}x{v['height']} {v['r_frame_rate']} {v['pix_fmt']}")
            check(len(au) == 1 and au[0]["sample_rate"] == "48000" and au[0]["channels"] == 2,
                  f"{seg.name}: audio not one 48k stereo track")
        srt_path = work / "caps.srt"
        srt_path.write_text(st["build_srt"]([{"text": "Silent scene {\\b1}"}, {"text": "Voiced scene"}], [2.0, 2.5]),
                            encoding="utf-8")
        font = "C:/Windows/Fonts/arial.ttf" if os.path.exists("C:/Windows/Fonts/arial.ttf") else None
        final = work / "final_test.mp4"
        run(st["concat_cmd"]([str(seg_a_ov), str(seg_b)], str(final), str(srt_path), label=True, label_font_file=font))
        info = ffprobe(final)
        v = next(s for s in info["streams"] if s["codec_type"] == "video")
        au = next(s for s in info["streams"] if s["codec_type"] == "audio")
        vdur, adur = float(v.get("duration", 0)), float(au.get("duration", 0))
        check((v["width"], v["height"], v["r_frame_rate"]) == (1080, 1920, "24/1"), "final not 1080x1920 @ 24 fps")
        check(au["sample_rate"] == "48000" and au["channels"] == 2 and au["codec_name"] == "aac", "final audio not AAC 48k stereo")
        check(abs(vdur - 4.5) < 0.15 and abs(adur - 4.5) < 0.15, f"final durations off: video {vdur:.3f}s audio {adur:.3f}s (want 4.5)")
        silent, voiced = mean_volume(final, 0.2, 1.5), mean_volume(final, 2.3, 1.9)
        check(silent < -70 and voiced > -40, f"audio misplaced: scene1 {silent} dB (want silence), scene2 {voiced} dB (want tone)")
        print(f"  final_test.mp4: {v['width']}x{v['height']} {v['r_frame_rate']} | video {vdur:.3f}s audio {adur:.3f}s "
              f"{au['sample_rate']}Hz x{au['channels']} | scene1 {silent} dB, scene2 {voiced} dB | dir {work}")
    except Exception as e:
        check(False, f"ffmpeg pipeline crashed: {e}")
else:
    print("[6] ffmpeg not on PATH: synthetic stitch test skipped")

if FAILS:
    print(f"ENGINE_WIRING_FAIL ({len(FAILS)})")
    sys.exit(1)
print("ENGINE_WIRING_OK")
