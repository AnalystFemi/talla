// Persona lock — THE fix for "beautiful keyframe, man's voice".
//
// One persona per project, chosen before any media is generated. The same
// persona object drives all three renderers, so they can never disagree:
//   1. keyframe_prompt   -> Muse Image draws this exact person
//   2. h3_description    -> H3 is told this person is speaking (its native
//                           voice is generated to match the described speaker)
//   3. yarn_voice / route -> local TTS speaks with this gender's voice
//
// Voice routing (hybrid, language-aware — user decision 2026-10-29):
//   nigerian-english / english : H3 native audio is primary (best sync).
//                                YarnGPT2 named voice is the local track /
//                                preview (female: idera…, male: jude…).
//   yoruba / hausa / igbo      : YarnGPT2 local voice replaces H3's track
//                                at stitch (H3 dialogue there is unstable).
//   pidgin                     : MMS single-speaker replaces H3's track.
//                                MMS has NO voice choice — if persona gender
//                                mismatches the fixed MMS speaker we say so
//                                (persona_warning), we never silently pair
//                                the wrong-gender voice with the face again.

export const PERSONAS = [
  {
    id: "female-creator",
    label: "Female creator",
    gender: "female",
    keyframe_prompt:
      "Nigerian woman in her late 20s, braids, natural makeup, warm expressive face",
    h3_description:
      "a Nigerian woman in her late 20s with braids, speaking in a warm female voice with a Nigerian accent",
    yarn_voice: { english: "idera", yoruba: "yoruba_female2", igbo: "igbo_female2", hausa: "hausa_female2" },
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
];

export const DEFAULT_PERSONA_ID = "female-creator";

export function getPersona(id) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID);
}

// Languages where H3's own dialogue is stable enough to keep (model card:
// 11 stable languages incl. English; NG local languages excluded).
export const H3_NATIVE_AUDIO_LANGS = new Set(["nigerian-english", "english"]);

// Languages YarnGPT2 serves (Pidgin deliberately absent — MMS serves it).
export const YARN_LANGS = { "nigerian-english": "english", english: "english", yoruba: "yoruba", igbo: "igbo", hausa: "hausa" };

/**
 * Decide, for one scene, where the spoken track comes from.
 * Returns { source: "h3"|"yarn"|"mms", voice, warning? }.
 * - h3:   keep H3's native soundtrack (no stitch replacement)
 * - yarn: generate YarnGPT2 wav, stitch replaces H3 audio with it
 * - mms:  generate MMS wav, stitch replaces H3 audio with it
 */
export function voiceRoute(language, persona) {
  const lang = (language || "pidgin").toLowerCase();
  if (H3_NATIVE_AUDIO_LANGS.has(lang)) {
    const yarnLang = YARN_LANGS[lang];
    return { source: "h3", voice: persona.yarn_voice[yarnLang] || null,
             note: "H3 native dialogue kept; YarnGPT voice available as preview/fallback." };
  }
  const yarnLang = YARN_LANGS[lang];
  if (yarnLang) {
    return { source: "yarn", voice: persona.yarn_voice[yarnLang],
             note: "H3 picture + local YarnGPT2 voice (stitch swaps the track)." };
  }
  // pidgin (and anything unmapped) -> MMS, single fixed speaker.
  return { source: "mms", voice: null,
           warning: "Pidgin voice is MMS single-speaker with no gender choice yet — check it matches the chosen creator; a gendered Pidgin voice (9jaLingo/Wazobia trial) is the planned upgrade." };
}
