import os
import glob
import base64
import json

census_dir = r"C:\Users\DELL\Downloads\Talla\talla\data\voice_census"
audition_dir = r"C:\Users\DELL\Downloads\Talla\talla\data\voice_audition"

wav_files = glob.glob(os.path.join(census_dir, "*.wav"))

voices = []

descriptions = {
    "english_zainab": {"name": "Zainab", "lang": "English / Pidgin", "gender": "Female", "desc": "Soothing, gentle, natural Nigerian accent (Aisha's original favorite)"},
    "english_idera": {"name": "Idera", "lang": "English / Pidgin", "gender": "Female", "desc": "Warm, melodic, friendly conversational (Funmi's original favorite)"},
    "english_chinenye": {"name": "Chinenye", "lang": "English / Pidgin", "gender": "Female", "desc": "Confident, clear corporate/fintech"},
    "english_joke": {"name": "Joke", "lang": "English / Pidgin", "gender": "Female", "desc": "Raspy, mature delivery"},
    "english_jude": {"name": "Jude", "lang": "English / Pidgin", "gender": "Male", "desc": "Warm, confident, natural Nigerian delivery"},
    "english_osagie": {"name": "Osagie", "lang": "English / Pidgin", "gender": "Male", "desc": "Smooth, calm tenor (Ebuka's favorite)"},
    "english_umar": {"name": "Umar", "lang": "English / Pidgin", "gender": "Male", "desc": "Deep, clear Northern Nigerian cadence"},
    "english_tayo": {"name": "Tayo", "lang": "English / Pidgin", "gender": "Male", "desc": "Upbeat, energetic delivery"},
    "english_emma": {"name": "Emma", "lang": "English / Pidgin", "gender": "Male", "desc": "Authoritative, deep"},
    "english_onye": {"name": "Onye", "lang": "English / Pidgin", "gender": "Female", "desc": "Vibrant, conversational"},
    "english_regina": {"name": "Regina", "lang": "English / Pidgin", "gender": "Female", "desc": "Mature, warm tone"},
    "english_remi": {"name": "Remi", "lang": "English / Pidgin", "gender": "Female", "desc": "Melodious, warm tone"},
    "hausa_hausa_female1": {"name": "Hausa Female 1", "lang": "Hausa", "gender": "Female", "desc": "Clear, resonant, natural Hausa cadence (Recommended)"},
    "hausa_hausa_female2": {"name": "Hausa Female 2", "lang": "Hausa", "gender": "Female", "desc": "Low-formant, flat/robotic (Disliked)"},
    "hausa_hausa_male1": {"name": "Hausa Male 1", "lang": "Hausa", "gender": "Male", "desc": "Deep, clear Hausa delivery"},
    "hausa_hausa_male2": {"name": "Hausa Male 2", "lang": "Hausa", "gender": "Male", "desc": "Natural tenor Hausa delivery"},
    "yoruba_yoruba_female1": {"name": "Yoruba Female 1", "lang": "Yoruba", "gender": "Female", "desc": "Smooth, tonal Yoruba female"},
    "yoruba_yoruba_female2": {"name": "Yoruba Female 2", "lang": "Yoruba", "gender": "Female", "desc": "Melodic, warm Yoruba female"},
    "yoruba_yoruba_male1": {"name": "Yoruba Male 1", "lang": "Yoruba", "gender": "Male", "desc": "Traditional cadence"},
    "yoruba_yoruba_male2": {"name": "Yoruba Male 2", "lang": "Yoruba", "gender": "Male", "desc": "Most stable Yoruba male"},
    "yoruba_yoruba_male3": {"name": "Yoruba Male 3", "lang": "Yoruba", "gender": "Male", "desc": "Energetic Yoruba male"},
    "igbo_igbo_female1": {"name": "Igbo Female 1", "lang": "Igbo", "gender": "Female", "desc": "Soft, authentic Igbo female"},
    "igbo_igbo_female2": {"name": "Igbo Female 2", "lang": "Igbo", "gender": "Female", "desc": "Bright, conversational Igbo female"},
    "igbo_igbo_male2": {"name": "Igbo Male 2", "lang": "Igbo", "gender": "Male", "desc": "Stable Igbo male delivery"}
}

for f in sorted(wav_files):
    stem = os.path.splitext(os.path.basename(f))[0]
    meta = descriptions.get(stem, {"name": stem, "lang": "Other", "gender": "Unknown", "desc": ""})
    with open(f, "rb") as audio_f:
        b64 = base64.b64encode(audio_f.read()).decode("utf-8")
    voices.append({
        "id": stem,
        "name": meta["name"],
        "lang": meta["lang"],
        "gender": meta["gender"],
        "desc": meta["desc"],
        "file_path": f.replace("\\", "/"),
        "b64": f"data:audio/wav;base64,{b64}"
    })

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Talla Nigerian Voice Audition Player</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 30px;
    }}
    h1 {{
      font-size: 26px;
      margin-bottom: 8px;
      color: #38bdf8;
    }}
    p.subtitle {{
      color: #94a3b8;
      margin-top: 0;
      margin-bottom: 24px;
      font-size: 15px;
    }}
    .filter-bar {{
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }}
    button.filter-btn {{
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.2s;
    }}
    button.filter-btn:hover, button.filter-btn.active {{
      background: #38bdf8;
      color: #0f172a;
      border-color: #38bdf8;
    }}
    .voice-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }}
    .voice-card {{
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s, border-color 0.15s;
    }}
    .voice-card:hover {{
      transform: translateY(-2px);
      border-color: #38bdf8;
    }}
    .card-top {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }}
    .voice-name {{
      font-size: 18px;
      font-weight: 700;
      color: #f1f5f9;
    }}
    .badge {{
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }}
    .badge-female {{ background: #f43f5e20; color: #fb7185; border: 1px solid #f43f5e50; }}
    .badge-male {{ background: #0284c720; color: #38bdf8; border: 1px solid #0284c750; }}
    .lang-tag {{
      display: inline-block;
      font-size: 12px;
      color: #a855f7;
      font-weight: 600;
      margin-bottom: 8px;
    }}
    .desc {{
      color: #94a3b8;
      font-size: 13.5px;
      line-height: 1.4;
      margin-bottom: 16px;
      min-height: 38px;
    }}
    audio {{
      width: 100%;
      height: 36px;
      border-radius: 6px;
      outline: none;
    }}
    .fav-banner {{
      background: #eab30815;
      border: 1px solid #eab30840;
      color: #fde047;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      margin-bottom: 10px;
      font-weight: 600;
    }}
  </style>
</head>
<body>
  <h1>Talla Nigerian Voice Audition Player</h1>
  <p class="subtitle">Listen to all 24 local Nigerian voices and select your favorite for each avatar.</p>
  
  <div class="filter-bar">
    <button class="filter-btn active" onclick="filterVoices('all')">All Voices (24)</button>
    <button class="filter-btn" onclick="filterVoices('English / Pidgin')">English / Pidgin (12)</button>
    <button class="filter-btn" onclick="filterVoices('Hausa')">Hausa (4)</button>
    <button class="filter-btn" onclick="filterVoices('Yoruba')">Yoruba (5)</button>
    <button class="filter-btn" onclick="filterVoices('Igbo')">Igbo (3)</button>
    <button class="filter-btn" onclick="filterVoices('Female')">Female Only</button>
    <button class="filter-btn" onclick="filterVoices('Male')">Male Only</button>
  </div>

  <div class="voice-grid" id="grid">
"""

for v in voices:
    gender_badge = f'<span class="badge badge-{"female" if v["gender"] == "Female" else "male"}">{v["gender"]}</span>'
    fav = ""
    if "original favorite" in v["desc"].lower():
        fav = '<div class="fav-banner">Original Favorite</div>'
    elif "recommended" in v["desc"].lower():
        fav = '<div class="fav-banner">Recommended Clean Voice</div>'
    elif "disliked" in v["desc"].lower():
        fav = '<div class="fav-banner" style="background:#ef444420;border-color:#ef444450;color:#fca5a5;">Previously Used (Flat/Robotic)</div>'

    html_content += f"""
    <div class="voice-card" data-lang="{v['lang']}" data-gender="{v['gender']}">
      <div>
        <div class="card-top">
          <span class="voice-name">{v['name']}</span>
          {gender_badge}
        </div>
        <div class="lang-tag">{v['lang']} &bull; <code>{v['id']}</code></div>
        {fav}
        <div class="desc">{v['desc']}</div>
      </div>
      <div>
        <audio controls preload="none">
          <source src="{v['b64']}" type="audio/wav">
        </audio>
      </div>
    </div>
"""

html_content += """
  </div>

  <script>
    function filterVoices(cat) {
      const cards = document.querySelectorAll('.voice-card');
      const btns = document.querySelectorAll('.filter-btn');
      btns.forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');

      cards.forEach(c => {
        const lang = c.getAttribute('data-lang');
        const gender = c.getAttribute('data-gender');
        if (cat === 'all') {
          c.style.display = 'flex';
        } else if (cat === 'Female' || cat === 'Male') {
          c.style.display = (gender === cat) ? 'flex' : 'none';
        } else {
          c.style.display = (lang === cat) ? 'flex' : 'none';
        }
      });
    }
  </script>
</body>
</html>
"""

out_player = r"C:\Users\DELL\Downloads\Talla\talla\data\voice_player.html"
with open(out_player, "w", encoding="utf-8") as f:
    f.write(html_content)

artifact_player = r"C:\Users\DELL\.gemini\antigravity\brain\8a87edc4-a568-47c4-90be-f94ebeee15e0\voice_player.html"
with open(artifact_player, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Generated standalone audio player HTML with embedded audio at:\n{out_player}")
