import urllib.request, json, base64, time, pathlib

# Load environment variables
env_file = pathlib.Path(__file__).parent.parent / '.env'
env = {}
for line in env_file.read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()

url = env['MODAL_IMAGE_ENDPOINT']
token = env['MODAL_ENDPOINT_TOKEN']
print(f"Connected to Modal Image Endpoint: {url}")

output_dir = pathlib.Path(__file__).parent.parent / 'data' / 'hausa_storyboard'
output_dir.mkdir(parents=True, exist_ok=True)

# Aisha's Locked Persona Anchor from personas.js
AISHA_ANCHOR = (
    "Aisha, a Nigerian Hausa woman in her late 20s, deep rich brown skin, elegant emerald silk headscarf "
    "neatly wrapped, small gold stud earrings, natural glam makeup, graceful warm expression, "
    "wearing a modest cream kaftan top, adult woman. "
    "Background: bright modern Abuja apartment, beige sofa and green plants softly blurred behind her, soft daylight."
)
AISHA_SEED = 2007

# 5-Scene Winning UGC Storyboard (17 seconds total)
scenes = [
    {
        "n": 1,
        "type": "A-roll",
        "purpose": "Hook-Confession",
        "seconds": 3.5,
        "hausa": "Wallahi na daina rubuta receipt da hannu bayan abin da ya faru makon jiya!",
        "english": "I swear I stopped writing receipts by hand after what happened last week!",
        "filename": "scene_1_hook_aisha.webp",
        "seed": AISHA_SEED,
        "prompt": (
            f"Raw candid vertical 9:16 smartphone selfie video frame, front-facing camera at eye level. "
            f"{AISHA_ANCHOR} "
            f"Shot: Close-up selfie. She is leaning slightly forward toward the camera with an expressive shocked confessional look, "
            f"mouth slightly open in disbelief, whispering a secret like on FaceTime with a friend. "
            f"Authentic skin texture, realistic iPhone camera aesthetic, shallow depth of field f/1.8 bokeh."
        )
    },
    {
        "n": 2,
        "type": "B-roll",
        "purpose": "Pain-Agitation",
        "seconds": 3.5,
        "hausa": "Customer zai ce ya tura kudi, takarda ta bace, sai asara da hayaniya.",
        "english": "A customer claims they sent money, the paper receipt is lost, leading to losses and disputes.",
        "filename": "scene_2_pain_broll.webp",
        "seed": 3002,
        "prompt": (
            "Raw candid vertical 9:16 iPhone photo, realistic everyday Nigerian setting. "
            "Overhead POV shot looking down at a wooden counter in a small merchant shop in Kano Nigeria. "
            "A Nigerian shopkeeper's hands holding a worn, stained, paper invoice receipt booklet with faded handwritten blue ink notes, "
            "messy crossed-out numbers, looking chaotic and prone to fraud. "
            "Natural daylight from open shop doorway, shallow depth of field, authentic realistic texture. No CGI, no 3D render."
        )
    },
    {
        "n": 3,
        "type": "B-roll",
        "purpose": "Switch-Demo",
        "seconds": 3.5,
        "hausa": "Sai na canza zuwa rcpt — yana fitar da receipt mai tambarin shagona cikin sakanni goma!",
        "english": "Then I switched to rcpt — it generates a branded receipt for my shop in 10 seconds!",
        "filename": "scene_3_demo_broll.webp",
        "seed": 3003,
        "prompt": (
            "Raw candid vertical 9:16 iPhone photo. Close-up shot in a tidy modern Nigerian boutique shop. "
            "A Nigerian merchant's manicured hands holding a modern smartphone over a counter, "
            "showing a crisp modern electronic receipt with a clear QR code displayed, professional and organized. "
            "Soft warm shop lighting, authentic realistic texture. No CGI, no cartoon."
        )
    },
    {
        "n": 4,
        "type": "A-roll",
        "purpose": "Proof-Relief",
        "seconds": 3.5,
        "hausa": "Da zarar an duba QR code, kowa ya ga an biya kudi. Wahala ta kare!",
        "english": "Once the QR code is scanned, everyone sees payment is verified. Trouble is over!",
        "filename": "scene_4_relief_aisha.webp",
        "seed": AISHA_SEED,
        "prompt": (
            f"Raw candid vertical 9:16 smartphone selfie video frame, front-facing camera at eye level. "
            f"{AISHA_ANCHOR} "
            f"Shot: Medium selfie shot from chest up. She is smiling with genuine, visible relief, one hand raised "
            f"gesturing expressively with an enthusiastic knowing smile, nodding with excitement like sharing an amazing life hack on FaceTime with her best friend. "
            f"Authentic skin texture, soft daylight, realistic iPhone camera."
        )
    },
    {
        "n": 5,
        "type": "A-roll",
        "purpose": "Copy-Me-CTA",
        "seconds": 3.0,
        "hausa": "Ku gwada rcpt yau don samun kwanciyar hankali a kasuwancinku!",
        "english": "Try rcpt today for complete peace of mind in your business!",
        "filename": "scene_5_cta_aisha.webp",
        "seed": AISHA_SEED,
        "prompt": (
            f"Raw candid vertical 9:16 smartphone selfie video frame, front-facing camera at eye level. "
            f"{AISHA_ANCHOR} "
            f"Shot: Close-up selfie from chest up. She is smiling warmly and directly into the camera lens with a bright trustworthy smile, "
            f"giving a warm friendly nod and waving goodbye with one hand, wrapping up her call with a confident smile. "
            f"Soft natural light, authentic skin texture, realistic iPhone camera."
        )
    }
]

manifest = {
    "title": "Aisha Hausa UGC Storyboard (17s)",
    "creator": "Aisha (female-creator)",
    "language": "hausa",
    "total_seconds": 17.0,
    "scenes": []
}

for sc in scenes:
    print(f"\n--- Generating Scene {sc['n']}: {sc['purpose']} ({sc['type']}) ---")
    payload = {
        "prompt": sc["prompt"],
        "size": "1024x1536",
        "seed": sc["seed"]
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Talla-Token": token
        }
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            dt = time.time() - t0
            b64 = data.get("image_b64")
            if b64:
                file_path = output_dir / sc["filename"]
                file_path.write_bytes(base64.b64decode(b64))
                print(f"SUCCESS: Scene {sc['n']} rendered in {dt:.1f}s -> {file_path.name}")
                manifest["scenes"].append({
                    "n": sc["n"],
                    "type": sc["type"],
                    "purpose": sc["purpose"],
                    "seconds": sc["seconds"],
                    "hausa": sc["hausa"],
                    "english": sc["english"],
                    "image": str(file_path),
                    "render_time_s": round(dt, 2)
                })
            else:
                print(f"ERROR: No image_b64 in response for scene {sc['n']}")
    except Exception as e:
        print(f"FAILED Scene {sc['n']}: {e}")

manifest_path = output_dir / "storyboard_manifest.json"
manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"\nManifest saved to {manifest_path}")
