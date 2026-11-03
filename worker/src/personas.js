// Persona lock — THE fix for "beautiful keyframe, man's voice".
//
// One persona per project, chosen before any media is generated. The same
// persona object drives all three layers, so they can never disagree:
//   1. keyframe_prompt -> Muse Image draws this exact person
//   2. voice_prompt    -> Wan/LTX motion prompt describes this exact speaker
//   3. yarn_voice      -> local TTS speaks with this gender's voice
//
// H3 is PARKED (2026-10-29: both H100 and H200 failed the cost/speed bar).
// `h3_description` remains as the generic on-camera description reused by
// the silent Wan/LTX motion prompt; no route submits H3 anymore, so every
// language ships the same way: Wan/LTX silent motion + local Nigerian
// voice muxed at stitch (YarnGPT2; MMS for Pidgin). MMS has NO voice
// choice — if the fixed MMS speaker clashes with the persona we say so
// (warning), we never silently pair the wrong-gender voice with the face.

export const PERSONAS = [
  {
    id: "female-creator",
    label: "Aisha",
    name: "Aisha",
    seed: 2007, // Z-Image seed of the approved portrait (web/public/avatars) — keeps the face
    gender: "female",
    // USER REQUEST 2026-11-01: four NAMED creators (2F/2M); Aisha is made
    // distinct from Funmi (headscarf, deep brown skin). Same prompt as
    // scripts/gen_avatars.mjs; portrait pending user approval.
    keyframe_prompt:
      "Nigerian Hausa woman in her late 20s, deep rich brown skin, elegant emerald silk headscarf neatly wrapped, small gold stud earrings, natural glam makeup, graceful warm expression, modest cream kaftan top",
    h3_description:
      "Aisha, a Nigerian Hausa woman in her late 20s with an emerald headscarf, speaks in a soft, smooth female voice with a Nigerian accent",
    // Soft cast: zainab measured bright/sharp, so joke (smoothest English female).
    voice_anchor: "zainab",
    voice_ref: "english_zainab.wav",
    yarn_voice: { english: "zainab", yoruba: "yoruba_female1", igbo: "igbo_female1", hausa: "hausa_female1" },
    look_default: "Aisha filming a UGC video in a bright modern Abuja apartment, beige sofa and green plants softly blurred behind her, soft daylight, looking directly into the lens, calm warm confident delivery",
  },
  {
    id: "female-creator-2",
    label: "Female creator 2 (Funmi)",
    name: "Funmi",
    seed: 1421, // Z-Image seed of the approved portrait (web/public/avatars) — keeps the face
    gender: "female",
    // STATUS: user picked the NEW Z-Image portrait 2026-11-02 (scripts/
    // gen_avatars.mjs, seed 1421) over the old v4/v5 lock. Complexion leads the
    // prompt: Z-Image runs guidance 0, so later skin-tone cues are ignored.
    keyframe_prompt:
      "light-skinned fair complexion, pale golden-beige skin. Funmi, a mixed-race woman of Yoruba Nigerian heritage in her late 20s, light caramel skin, distinctly West African facial features, full lips, long black knotless braids falling over one shoulder, natural glam makeup, glossy lips, small gold hoop earrings, warm confident smile, elegant cream satin blouse, adult woman",
    h3_description:
      "Funmi, a light-skinned Nigerian Yoruba woman in her late 20s with long black knotless braids, speaks in a soft, warm female voice with a Yoruba Nigerian accent",
    // Cast 2026-11-02 by measured pitch/brightness (data/voice_census): soft, warm, smooth.
    voice_anchor: "chinenye",
    voice_ref: "english_chinenye.wav",
    yarn_voice: { english: "chinenye", yoruba: "yoruba_female2", igbo: "igbo_female2", hausa: "hausa_female1" },
    // UGC Forge: Avatar (who) vs Look (setup). Funmi's LOCKED look — upscale
    // Lagos apartment; the background must sell the lifestyle. This is
    // look_default (read by keyframeForScene); look_yoruba is kept as an
    // alias because older project data references the name.
    look_default: "Funmi filming a UGC video in a bright upscale Lagos apartment living room, modern grey sofa with mustard cushions behind her, marble side table with a small vase of flowers, framed abstract wall art, sheer curtains with soft daylight streaming in, a vanity mirror with warm bulbs softly blurred at the side, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, calm warm confident delivery",
    look_yoruba: "Funmi filming a UGC video in a bright upscale Lagos apartment living room, modern grey sofa with mustard cushions behind her, marble side table with a small vase of flowers, framed abstract wall art, sheer curtains with soft daylight streaming in, a vanity mirror with warm bulbs softly blurred at the side, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, calm warm confident delivery",
  },
  {
    // USER REQUEST 2026-10-29: two male avatars — one dark-skinned, one
    // light-skinned. Keyframes pending user approval (UGC Forge gate).
    id: "male-creator-dark",
    label: "Male creator — dark skin (Ebuka)",
    name: "Ebuka",
    seed: 1007, // Z-Image seed of the approved portrait (web/public/avatars) — keeps the face
    gender: "male",
    keyframe_prompt:
      "dark-skinned Nigerian MAN in his early 30s, deep rich brown skin, masculine face, strong jawline, broad shoulders, athletic build, short fade haircut, neat short beard, confident warm smile, plain fitted crew-neck tee, gold wristwatch, adult male, not female, not feminine",
    h3_description:
      "Ebuka, a dark-skinned Nigerian man in his early 30s with a short fade and neat beard, speaks in a lighter, tenor male voice with a Nigerian accent",
    // Tenor cast: the lighter, higher male voices (user picked osagie 2026-11-02).
    // yoruba_male1/3 clip ~1 s on 2-3 of 3 test lines (2026-11-02); only
    // yoruba_male2 is reliable, so Ebuka shares it with Tunde (as for Igbo).
    voice_anchor: "tayo",
    voice_ref: "english_tayo.wav",
    yarn_voice: { english: "tayo", yoruba: "yoruba_male2", igbo: "igbo_male2", hausa: "hausa_male2" },
    look_default: "Ebuka filming a UGC video inside a tidy modern Lagos apartment, plain light-grey wall and a bookshelf softly blurred behind him, bright window daylight from the side, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, relaxed confident delivery",
  },
  {
    id: "male-creator-light",
    label: "Male creator — light skin (Tunde)",
    name: "Tunde",
    seed: 3421, // Z-Image seed of the approved portrait (web/public/avatars) — keeps the face
    gender: "male",
    keyframe_prompt:
      // v1 portrait rendered a WOMAN (user caught it 2026-11-01) — male cues
      // are now explicit, matching scripts/gen_avatars.mjs.
      "light-skinned fair complexion, pale golden-beige skin. Tunde, a mixed-race MAN of Yoruba Nigerian heritage in his late 20s, light caramel skin, masculine face, defined jawline, short black waves haircut, light stubble beard, friendly confident smile, crisp white open-collar shirt, adult male, not female, not feminine, no braids, no long hair",
    h3_description:
      "Tunde, a light-skinned Nigerian man in his late 20s with short waves, speaks in a deep, low male voice with a Nigerian accent",
    // igbo_male2 is YarnGPT's only Igbo male voice, so Tunde shares it with
    // Ebuka for Igbo scripts only; every other language is unique per avatar.
    // Deep cast: lowest-pitched, darkest voice in each language (user picked umar 2026-11-02).
    voice_anchor: "umar",
    voice_ref: "english_umar.wav",
    yarn_voice: { english: "umar", yoruba: "yoruba_male2", igbo: "igbo_male2", hausa: "hausa_male1" },
    look_default: "Tunde filming a UGC video in a bright modern Lagos apartment, cream sofa and framed wall art softly blurred behind him, soft daylight through sheer curtains, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, relaxed friendly delivery",
  },
];

export const DEFAULT_PERSONA_ID = "female-creator";

export function getPersona(id) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID);
}

// H3 is parked, but this set still marks where its dialogue WOULD have
// been stable. Kept for the day a verdict test re-opens H3; today every
// language ships local-voice (see voiceRoute).
export const H3_NATIVE_AUDIO_LANGS = new Set(["nigerian-english", "english"]);

// Languages YarnGPT2 serves. Pidgin rides the avatar's English voice:
// MMS-pcm has one ungendered speaker, which broke the voice-matches-face rule.
export const YARN_LANGS = { "nigerian-english": "english", english: "english", pidgin: "english", yoruba: "yoruba", igbo: "igbo", hausa: "hausa" };

/**
 * Decide, for one scene, where the spoken track comes from.
 * Returns { source: "yarn"|"mms", voice, fallback?, warning? }. H3 is parked,
 * so even English ships local-voice: YarnGPT2 wav generated first, stitch
 * muxes it onto the silent Wan/LTX picture. MMS covers Pidgin (single speaker).
 *
 * YORUBA GUARD (WP-F): when the persona has no Yoruba voice mapped, we fall
 * back to English EXPLICITLY (fallback: "english", warning set) instead of
 * silently sending `voice: undefined` to YarnGPT. Callers surface the warning
 * in the Studio voice panel so the owner hears the mismatch coming.
 */
export function voiceRoute(language, persona) {
  const lang = (language || "pidgin").toLowerCase();
  const yarnLang = YARN_LANGS[lang];
  if (yarnLang) {
    const voice = persona.yarn_voice[yarnLang];
    if (voice) {
      return { source: "yarn", voice, lang: yarnLang,
               note: "YarnGPT2 local voice first; stitch muxes it onto the silent Wan/LTX picture." };
    }
    // Guard: persona lacks this language's voice — fall back to its English
    // voice and SAY SO rather than submitting an undefined voice.
    return { source: "yarn", voice: persona.yarn_voice.english, lang: "english", fallback: "english",
             warning: `No ${yarnLang} voice mapped for ${persona.label} — falling back to the English voice (${persona.yarn_voice.english}). Pick a creator with a ${yarnLang} voice for a native read.` };
  }
  // anything unmapped -> MMS, single fixed speaker.
  return { source: "mms", voice: null,
           warning: "Pidgin voice is MMS single-speaker with no gender choice yet — check it matches the chosen creator; a gendered Pidgin voice (9jaLingo/Wazobia trial) is the planned upgrade." };
}
