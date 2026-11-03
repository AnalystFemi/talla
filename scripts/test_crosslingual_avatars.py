"""Test Cross-Lingual Voice Conversion across all 4 Avatars and all Languages:
- Aisha (Anchor: Zainab)
- Funmi (Anchor: Chinenye)
- Ebuka (Anchor: Tayo)
- Tunde (Anchor: Umar)

Generates test audio for:
- Hausa (Native grammar -> Avatar identity)
- Yoruba (Native grammar -> Avatar identity)
- Igbo (Native grammar -> Avatar identity)
- English / Pidgin (Direct native anchor)

All outputs saved to: talla/data/avatar_crosslingual_tests/
And builds an interactive HTML player to listen and compare.
"""
import os
import json
import base64
import requests
import time

TOKEN = os.environ.get("TALLA_ENDPOINT_TOKEN") or os.environ.get("MODAL_ENDPOINT_TOKEN", "")
VC_URL = "https://akinspajo--talla-vc-convert-http.us-east.modal.run"
YARN_URL = "https://akinspajo--talla-yarngpt-speak-http.us-east.modal.run"
FILE_URL = "https://akinspajo--talla-stitch-file-http.us-east.modal.run"

BASE_DIR = r"C:\Users\DELL\Downloads\Talla\talla"
CENSUS_DIR = os.path.join(BASE_DIR, r"data\voice_census")
OUT_DIR = os.path.join(BASE_DIR, r"data\avatar_crosslingual_tests")
os.makedirs(OUT_DIR, exist_ok=True)

PIDGIN_SCRIPTS = {
    "Aisha": "Omo wait first! You know how money dey disappear from your account? Dis Rcpt app don save my life!",
    "Funmi": "Abeg make I tell you the truth! Since I start to dey use Rcpt, my bank alert dey always clear!",
    "Ebuka": "Guy, no be small thing o! Dis Rcpt app dey show me everywhere wey my salary dey enter!",
    "Tunde": "My people, if you dey run business, dis Rcpt app na the real game changer for all your money matter!"
}

AVATARS = [
    {
        "id": "female-creator",
        "name": "Aisha",
        "gender": "Female",
        "anchor_voice": "zainab",
        "anchor_file": os.path.join(CENSUS_DIR, "english_zainab.wav"),
        "native_sources": {
            "hausa": os.path.join(CENSUS_DIR, "hausa_hausa_female1.wav"),
            "yoruba": os.path.join(CENSUS_DIR, "yoruba_yoruba_female1.wav"),
            "igbo": os.path.join(CENSUS_DIR, "igbo_igbo_female1.wav")
        }
    },
    {
        "id": "female-creator-2",
        "name": "Funmi",
        "gender": "Female",
        "anchor_voice": "chinenye",
        "anchor_file": os.path.join(CENSUS_DIR, "english_chinenye.wav"),
        "native_sources": {
            "hausa": os.path.join(CENSUS_DIR, "hausa_hausa_female1.wav"),
            "yoruba": os.path.join(CENSUS_DIR, "yoruba_yoruba_female2.wav"),
            "igbo": os.path.join(CENSUS_DIR, "igbo_igbo_female2.wav")
        }
    },
    {
        "id": "male-creator-dark",
        "name": "Ebuka",
        "gender": "Male",
        "anchor_voice": "tayo",
        "anchor_file": os.path.join(CENSUS_DIR, "english_tayo.wav"),
        "native_sources": {
            "hausa": os.path.join(CENSUS_DIR, "hausa_hausa_male2.wav"),
            "yoruba": os.path.join(CENSUS_DIR, "yoruba_yoruba_male2.wav"),
            "igbo": os.path.join(CENSUS_DIR, "igbo_igbo_male2.wav")
        }
    },
    {
        "id": "male-creator-light",
        "name": "Tunde",
        "gender": "Male",
        "anchor_voice": "umar",
        "anchor_file": os.path.join(CENSUS_DIR, "english_umar.wav"),
        "native_sources": {
            "hausa": os.path.join(CENSUS_DIR, "hausa_hausa_male1.wav"),
            "yoruba": os.path.join(CENSUS_DIR, "yoruba_yoruba_male2.wav"),
            "igbo": os.path.join(CENSUS_DIR, "igbo_igbo_male2.wav")
        }
    }
]

def to_b64(file_path):
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def build_player_html(results):
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Talla Cross-Lingual Avatar Voice Matrix</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #090d16;
      color: #f8fafc;
      margin: 0;
      padding: 30px;
    }}
    h1 {{ font-size: 26px; color: #38bdf8; margin-bottom: 6px; }}
    p.sub {{ color: #94a3b8; font-size: 14px; margin-top: 0; margin-bottom: 24px; }}
    .avatar-section {{
      background: #131b2e;
      border: 1px solid #1e293b;
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 24px;
    }}
    .avatar-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 12px;
    }}
    .avatar-title {{ font-size: 20px; font-weight: 700; color: #f1f5f9; }}
    .anchor-badge {{
      background: #0284c725;
      color: #38bdf8;
      border: 1px solid #0284c760;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 600;
    }}
    .clips-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 14px;
    }}
    .clip-card {{
      background: #1a233a;
      border: 1px solid #283556;
      border-radius: 10px;
      padding: 14px;
    }}
    .lang-label {{
      font-size: 14px;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }}
    .type-pill {{
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }}
    .type-native {{ background: #10b98120; color: #34d399; }}
    .type-pidgin {{ background: #f59e0b25; color: #fbbf24; border: 1px solid #f59e0b50; }}
    .type-cross {{ background: #8b5cf620; color: #c084fc; }}
    .clip-desc {{ font-size: 12px; color: #94a3b8; margin-bottom: 10px; }}
    audio {{ width: 100%; height: 34px; border-radius: 6px; }}
  </style>
</head>
<body>
  <h1>Talla Cross-Lingual Avatar Voice Matrix</h1>
  <p class="sub">Each avatar speaks in their single locked vocal identity across Nigerian English, Pidgin, Hausa, Yoruba, and Igbo.</p>
"""

    avatars_grouped = {}
    for r in results:
        avatars_grouped.setdefault(r["avatar"], []).append(r)

    for av_name, clips in avatars_grouped.items():
        anchor_voice = clips[0]["anchor"]
        gender = clips[0]["gender"]
        html += f"""
  <div class="avatar-section">
    <div class="avatar-header">
      <div class="avatar-title">{av_name} ({gender})</div>
      <div class="anchor-badge">Voice Anchor: {anchor_voice.upper()}</div>
    </div>
    <div class="clips-grid">
"""
        for c in clips:
            if c["type"] == "native":
                pill_class = "type-native"
                pill_text = "Native English"
            elif c["type"] == "pidgin":
                pill_class = "type-pidgin"
                pill_text = "Native Pidgin"
            else:
                pill_class = "type-cross"
                pill_text = "Cross-Lingual Clone"

            with open(c["file"], "rb") as f_aud:
                b64_audio = base64.b64encode(f_aud.read()).decode("utf-8")
            
            html += f"""
      <div class="clip-card">
        <div class="lang-label">
          <span>{c['language']}</span>
          <span class="type-pill {pill_class}">{pill_text}</span>
        </div>
        <div class="clip-desc">{av_name}'s voice speaking {c['language']}</div>
        <audio controls preload="none">
          <source src="data:audio/wav;base64,{b64_audio}" type="audio/wav">
        </audio>
      </div>
"""
        html += """
    </div>
  </div>
"""

    html += """
</body>
</html>
"""
    player_path = os.path.join(OUT_DIR, "crosslingual_player.html")
    with open(player_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\nInteractive Cross-Lingual Player generated at: {player_path}")

def main():
    print("=" * 60)
    print("CROSS-LINGUAL VOICE CONVERSION TEST HARNESS")
    print("=" * 60)

    results = []
    headers = {
        "Content-Type": "application/json",
        "X-Talla-Token": TOKEN
    }

    for avatar in AVATARS:
        name = avatar["name"]
        gender = avatar["gender"]
        anchor = avatar["anchor_voice"]
        print(f"\n--- Testing Avatar: {name} (Anchor: {anchor}) ---")

        # 1. Native English
        eng_dest = os.path.join(OUT_DIR, f"{name.lower()}_english_native_{anchor}.wav")
        if not os.path.exists(eng_dest):
            with open(avatar["anchor_file"], "rb") as f_in, open(eng_dest, "wb") as f_out:
                f_out.write(f_in.read())
        results.append({
            "avatar": name,
            "gender": gender,
            "language": "English",
            "file": eng_dest,
            "anchor": anchor,
            "type": "native"
        })
        print(f"  [English] Ready: {os.path.basename(eng_dest)}")

        # 2. Native Nigerian Pidgin (Voiced with Anchor)
        pidgin_dest = os.path.join(OUT_DIR, f"{name.lower()}_pidgin_native_{anchor}.wav")
        if not os.path.exists(pidgin_dest):
            print(f"  [Pidgin] Generating authentic Pidgin for {name} ({anchor})...")
            p_payload = {
                "text": PIDGIN_SCRIPTS.get(name, "Omo wait first! Dis Rcpt app don save my money!"),
                "language": "english",
                "voice": anchor
            }
            try:
                p_resp = requests.post(YARN_URL, json=p_payload, headers=headers, timeout=120)
                if p_resp.status_code == 200:
                    p_data = p_resp.json()
                    vol_name = p_data.get("audio_volume_path")
                    f_resp = requests.get(f"{FILE_URL}?name={vol_name}", headers={"X-Talla-Token": TOKEN}, timeout=60)
                    with open(pidgin_dest, "wb") as f_out:
                        f_out.write(f_resp.content)
                    print(f"  [Pidgin] Generated and saved: {os.path.basename(pidgin_dest)}")
                else:
                    print(f"  [Pidgin] Failed ({p_resp.status_code}): {p_resp.text}")
            except Exception as e:
                print(f"  [Pidgin] Error: {e}")
        else:
            print(f"  [Pidgin] Ready: {os.path.basename(pidgin_dest)}")

        if os.path.exists(pidgin_dest):
            results.append({
                "avatar": name,
                "gender": gender,
                "language": "Pidgin",
                "file": pidgin_dest,
                "anchor": anchor,
                "type": "pidgin"
            })

        # 3. Local Languages via Voice Conversion
        for lang, src_path in avatar["native_sources"].items():
            out_file = os.path.join(OUT_DIR, f"{name.lower()}_{lang}_as_{anchor}.wav")
            if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
                print(f"  [{lang.capitalize()}] Ready: {os.path.basename(out_file)}")
                results.append({
                    "avatar": name,
                    "gender": gender,
                    "language": lang.capitalize(),
                    "file": out_file,
                    "anchor": anchor,
                    "type": "cross-lingual"
                })
                continue

            print(f"  [{lang.capitalize()}] Converting native {lang} -> {name} ({anchor})...")
            payload = {
                "source_b64": to_b64(src_path),
                "target_voice": anchor,
                "diffusion_steps": 10
            }

            try:
                t0 = time.time()
                resp = requests.post(VC_URL, json=payload, headers=headers, timeout=120)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("converted_b64"):
                        with open(out_file, "wb") as f_out:
                            f_out.write(base64.b64decode(data["converted_b64"]))
                    elif data.get("converted_volume_path"):
                        vol_name = data["converted_volume_path"]
                        f_resp = requests.get(f"{FILE_URL}?name={vol_name}", headers={"X-Talla-Token": TOKEN}, timeout=60)
                        with open(out_file, "wb") as f_out:
                            f_out.write(f_resp.content)
                    
                    elapsed = time.time() - t0
                    print(f"  [{lang.capitalize()}] Converted successfully in {elapsed:.2f}s -> {os.path.basename(out_file)}")
                    results.append({
                        "avatar": name,
                        "gender": gender,
                        "language": lang.capitalize(),
                        "file": out_file,
                        "anchor": anchor,
                        "type": "cross-lingual"
                    })
                else:
                    print(f"  [{lang.capitalize()}] Failed ({resp.status_code}): {resp.text}")
            except Exception as e:
                print(f"  [{lang.capitalize()}] Error: {str(e)}")

    manifest_path = os.path.join(OUT_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    build_player_html(results)

if __name__ == "__main__":
    main()
