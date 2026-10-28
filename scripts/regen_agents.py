"""Regenerate the 5 Talla agent mascots with Muse Image ($0.01 each).
Uses the user's JPGs as identity guides (colour + accessory lock), but
re-renders premium: consistent framing, cream background, high-res.
Usage: python scripts/regen_agents.py [agent ...]  (default: all)"""
import base64, io, json, os, sys, urllib.request, urllib.error
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
env = {}
for line in open(os.path.join(ROOT, ".env")):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
KEY = env["META_API_KEY"]
BASE = (env.get("META_BASE_URL") or "https://api.meta.ai/v1").rstrip("/")

STYLE = ("Premium 3D cartoon mascot, single head centred and large in frame, toy-like soft rounded forms, "
         "smooth matte material, Nigerian features, friendly confident smile, premium studio lighting, "
         "solid warm cream background (#FAF6EE), no text, no letters, square composition, ultra clean render. "
         "Keep EXACTLY the same character identity, colour and signature accessory as the reference image.")

AGENTS = {
    "researcher": "Blue character, braided bun, orange-and-white glasses.",
    "critic": "Green character, black backwards cap, grey glasses.",
    "voice": "Pink character, pink braids with gold cuffs, big white-orange headphones with microphone.",
    "scriptwriter": "Orange character, brown locs and beard, tortoise glasses.",
    "editor": "Purple character, purple braids, pink glasses.",
}

def data_url(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((768, 768))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def edit(agent, guide_path):
    payload = {"model": "muse-image-1.0", "n": 1, "size": "1024x1024",
               "reasoning_strength": "low",
               "tool_enablement": {"enable_web_search": False, "enable_image_search": False, "enable_shell": False},
               "prompt": f"{STYLE} {AGENTS[agent]}",
               "images": [{"image_url": data_url(guide_path)}]}
    req = urllib.request.Request(BASE + "/images/edits", data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
    try:
        r = urllib.request.urlopen(req, timeout=300)
        d = json.loads(r.read())
        b64 = d["data"][0].get("b64_json")
        if not b64:
            print(agent, "no b64, keys:", list(d["data"][0].keys())); return False
        out = os.path.join(ROOT, "web", "public", "agents", f"{agent}.webp")
        raw = base64.b64decode(b64)
        open(out, "wb").write(raw)
        print(f"{agent}: OK -> {out} ({round(len(raw)/1024)} KB)")
        return True
    except urllib.error.HTTPError as e:
        print(agent, "HTTP", e.code, e.read().decode()[:400]); return False
    except Exception as e:
        print(agent, "ERROR", type(e).__name__, str(e)[:200]); return False

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(AGENTS)
    for a in wanted:
        guide = os.path.join(ROOT, "web", "public", "agents", f"{a}.jpg")
        edit(a, guide)
