with open('talla/web/src/Home.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update THREAD
old_thread = '''  { who: "voice", text: "Scene 1 voiced in Pidgin with open Nigerian TTS. Handing it to the Editor." },
  { who: "critic", label: "Critic · advisory", text: "Note on the plan: scene 3's line is long for a ~5 second clip — trim it so the voice doesn't rush." },
  { who: "editor", text: "Filming scene 1 with Wan 2.2 (720p, ~5s), then stitching the captions." },'''

new_thread = '''  { who: "voice", text: "Scene 1 voiced in Nigerian Pidgin. Handing it to the Editor." },
  { who: "critic", label: "Critic · advisory", text: "Note on the plan: scene 3's line is long for a ~5 second clip — trim it so the voice doesn't rush." },
  { who: "editor", text: "Filming scene 1 (portrait 9:16), then stitching the captions." },'''

assert old_thread in text, "old_thread not found"
text = text.replace(old_thread, new_thread)

# 2. Update HANDOFF
old_handoff = '''  ["Voices in Pidgin, Yoruba, Hausa & Igbo", "voice", "Open Nigerian TTS speaks every line. The first voiced scene is transcribed and checked against your script."],
  ["Filming without a shoot", "editor", "Persona-locked stills from Z-Image, lip-synced to the voice by InfiniteTalk, with LTX 2.5 B-roll cutaways."],'''

new_handoff = '''  ["Voices in Pidgin, Yoruba, Hausa & Igbo", "voice", "Natural West African voices speak every line in Pidgin, Yoruba, Hausa, or Igbo. The first voiced scene is verified against your script."],
  ["Filming without a shoot", "editor", "Persona-locked creator portraits, lip-synced to the voice with realistic product cutaways."],'''

assert old_handoff in text, "old_handoff not found"
text = text.replace(old_handoff, new_handoff)

# 3. Update Under the hood
old_hood = 'Under the hood: Muse Spark Open plans and critiques, Z-Image shoots the stills, OWLv2 checks them, open Nigerian TTS speaks, InfiniteTalk lip-syncs each scene and Meta MMS verifies the words.'
new_hood = 'Under the hood: AI creative intelligence plans and critiques, photorealistic portrait engines shoot the stills, vision checks verify them, natural West African voices speak, high-fidelity lip sync brings the creator to life and audio QA verifies the words.'

assert old_hood in text, "old_hood not found"
text = text.replace(old_hood, new_hood)

# 4. Update spec line
old_spec = 'Pidgin, Yoruba, Hausa, Igbo or Nigerian English — then voiced by open Nigerian TTS.'
new_spec = 'Pidgin, Yoruba, Hausa, Igbo or Nigerian English — spoken with authentic local cadence.'

assert old_spec in text, "old_spec not found"
text = text.replace(old_spec, new_spec)

with open('talla/web/src/Home.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Home.jsx successfully patched!")
