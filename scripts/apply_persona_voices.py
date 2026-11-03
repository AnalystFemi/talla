path = r"C:\Users\DELL\Downloads\Talla\talla\worker\src\personas.js"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# 1. Aisha -> zainab, hausa_female1
old_aisha = '    yarn_voice: { english: "joke", yoruba: "yoruba_female1", igbo: "igbo_female1", hausa: "hausa_female2" },'
new_aisha = '    voice_anchor: "zainab",\n    voice_ref: "english_zainab.wav",\n    yarn_voice: { english: "zainab", yoruba: "yoruba_female1", igbo: "igbo_female1", hausa: "hausa_female1" },'
assert old_aisha in c, "old_aisha pattern not found in personas.js"
c = c.replace(old_aisha, new_aisha)

# 2. Funmi -> chinenye
old_funmi = '    yarn_voice: { english: "chinenye", yoruba: "yoruba_female2", igbo: "igbo_female2", hausa: "hausa_female1" },'
new_funmi = '    voice_anchor: "chinenye",\n    voice_ref: "english_chinenye.wav",\n    yarn_voice: { english: "chinenye", yoruba: "yoruba_female2", igbo: "igbo_female2", hausa: "hausa_female1" },'
assert old_funmi in c, "old_funmi pattern not found in personas.js"
c = c.replace(old_funmi, new_funmi)

# 3. Ebuka -> tayo
old_ebuka = '    yarn_voice: { english: "osagie", yoruba: "yoruba_male2", igbo: "igbo_male2", hausa: "hausa_male2" },'
new_ebuka = '    voice_anchor: "tayo",\n    voice_ref: "english_tayo.wav",\n    yarn_voice: { english: "tayo", yoruba: "yoruba_male2", igbo: "igbo_male2", hausa: "hausa_male2" },'
assert old_ebuka in c, "old_ebuka pattern not found in personas.js"
c = c.replace(old_ebuka, new_ebuka)

# 4. Tunde -> umar
old_tunde = '    yarn_voice: { english: "umar", yoruba: "yoruba_male2", igbo: "igbo_male2", hausa: "hausa_male1" },'
new_tunde = '    voice_anchor: "umar",\n    voice_ref: "english_umar.wav",\n    yarn_voice: { english: "umar", yoruba: "yoruba_male2", igbo: "igbo_male2", hausa: "hausa_male1" },'
assert old_tunde in c, "old_tunde pattern not found in personas.js"
c = c.replace(old_tunde, new_tunde)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("personas.js successfully updated with user voice anchors!")
