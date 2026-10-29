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
    label: "Female creator (Aisha)",
    name: "Aisha",
    gender: "female",
    keyframe_prompt:
      "Nigerian woman in her late 20s, braids, natural makeup, warm expressive face",
    h3_description:
      "a Nigerian woman in her late 20s with braids, speaking in a warm female voice with a Nigerian accent",
    yarn_voice: { english: "idera", yoruba: "yoruba_female2", igbo: "igbo_female2", hausa: "hausa_female2" },
  },
  {
    id: "female-creator-2",
    label: "Female creator 2 (Funmi)",
    name: "Funmi",
    gender: "female",
    // STATUS: ACCEPTED + LOCKED by user 2026-10-29 (Funmi v4 keyframe).
    // User direction: LIGHT-SKINNED woman, different style + nicer home.
    // v3 failed (brown wavy wig read European); v4 = black knotless braids
    // + West African features — accepted. Do not regenerate without asking.
    keyframe_prompt:
      "light-skinned Nigerian Yoruba woman in her late 20s, fair caramel skin, distinctly West African facial features, full lips, long black knotless braids falling over one shoulder, natural glam makeup, glossy lips, small gold hoop earrings, warm confident smile, elegant cream satin blouse",
    h3_description:
      "Funmi, a light-skinned Nigerian Yoruba woman in her late 20s with long black knotless braids, speaks in a clear warm female voice with a Yoruba Nigerian accent",
    yarn_voice: { english: "idera", yoruba: "yoruba_female2", igbo: "igbo_female2", hausa: "hausa_female2" },
    // UGC Forge: Avatar (who) vs Look (setup). Funmi's LOCKED look — upscale
    // Lagos apartment; the background must sell the lifestyle. This is
    // look_default (read by keyframeForScene); look_yoruba is kept as an
    // alias because older project data references the name.
    look_default: "Funmi filming a UGC video in a bright upscale Lagos apartment living room, modern grey sofa with mustard cushions behind her, marble side table with a small vase of flowers, framed abstract wall art, sheer curtains with soft daylight streaming in, a vanity mirror with warm bulbs softly blurred at the side, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, calm warm confident delivery",
    look_yoruba: "Funmi filming a UGC video in a bright upscale Lagos apartment living room, modern grey sofa with mustard cushions behind her, marble side table with a small vase of flowers, framed abstract wall art, sheer curtains with soft daylight streaming in, a vanity mirror with warm bulbs softly blurred at the side, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, calm warm confident delivery",
  },
  {
    id: "male-creator",
    label: "Male creator",
    gender: "male",
    keyframe_prompt:
      "Nigerian man in his early 30s, short fade haircut, neat beard, friendly expressive face",
    h3_description:
      "a Nigerian man in his early 30s with a short fade haircut, speaking in a clear male voice with a Nigerian accent",
    yarn_voice: { english: "jude", yoruba: "yoruba_male1", igbo: "igbo_male1", hausa: "hausa_male1" },
  },
  {
    // USER REQUEST 2026-10-29: two male avatars — one dark-skinned, one
    // light-skinned. Keyframes pending user approval (UGC Forge gate).
    id: "male-creator-dark",
    label: "Male creator — dark skin (Ebuka)",
    name: "Ebuka",
    gender: "male",
    keyframe_prompt:
      "dark-skinned Nigerian MAN in his early 30s, deep rich brown skin, masculine face, strong jawline, broad shoulders, athletic build, short fade haircut, neat short beard, confident warm smile, plain fitted crew-neck tee, gold wristwatch, adult male, not female, not feminine",
    h3_description:
      "Ebuka, a dark-skinned Nigerian man in his early 30s with a short fade and neat beard, speaks in a clear confident male voice with a Nigerian accent",
    yarn_voice: { english: "jude", yoruba: "yoruba_male1", igbo: "igbo_male1", hausa: "hausa_male1" },
    look_default: "Ebuka filming a UGC video inside a tidy modern Lagos apartment, plain light-grey wall and a bookshelf softly blurred behind him, bright window daylight from the side, holding a plain phone at chest height with the back of the phone to camera, looking directly into the lens, relaxed confident delivery",
  },
  {
    id: "male-creator-light",
    label: "Male creator — light skin (Tunde)",
    name: "Tunde",
    gender: "male",
    keyframe_prompt:
      "light-skinned Nigerian man in his late 20s, fair caramel skin, distinctly West African facial features, short waves haircut, clean-shaven, friendly confident smile, crisp white shirt",
    h3_description:
      "Tunde, a light-skinned Nigerian man in his late 20s with short waves, speaks in a clear warm male voice with a Nigerian accent",
    yarn_voice: { english: "jude", yoruba: "yoruba_male1", igbo: "igbo_male1", hausa: "hausa_male1" },
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

// Languages YarnGPT2 serves (Pidgin deliberately absent — MMS serves it).
export const YARN_LANGS = { "nigerian-english": "english", english: "english", yoruba: "yoruba", igbo: "igbo", hausa: "hausa" };

/**
 * Decide, for one scene, where the spoken track comes from.
 * Returns { source: "yarn"|"mms", voice, warning? }. H3 is parked, so even
 * English ships local-voice: YarnGPT2 wav generated first, stitch muxes
 * it onto the silent Wan/LTX picture. MMS covers Pidgin (single speaker).
 */
export function voiceRoute(language, persona) {
  const lang = (language || "pidgin").toLowerCase();
  const yarnLang = YARN_LANGS[lang];
  if (yarnLang) {
    return { source: "yarn", voice: persona.yarn_voice[yarnLang],
             note: "YarnGPT2 local voice first; stitch muxes it onto the silent Wan/LTX picture." };
  }
  // pidgin (and anything unmapped) -> MMS, single fixed speaker.
  return { source: "mms", voice: null,
           warning: "Pidgin voice is MMS single-speaker with no gender choice yet — check it matches the chosen creator; a gendered Pidgin voice (9jaLingo/Wazobia trial) is the planned upgrade." };
}
