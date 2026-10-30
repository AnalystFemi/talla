// Copy + constants for the homepage and Studio. Keep claims honest:
// the critic is an advisory plan & script critic, verify checks the first voiced scene.
export const AGENTS = [
  { key: "researcher", name: "Researcher", img: "/agents/researcher.webp", color: "Blue", job: "Analyses trends, competitors and what Nigerian buyers actually want" },
  { key: "scriptwriter", name: "Scriptwriter", img: "/agents/scriptwriter.webp", color: "Orange", job: "Writes hooks and scripts in Pidgin, Yoruba, Hausa, Igbo & Nigerian English" },
  { key: "voice", name: "Voice", img: "/agents/voice.webp", color: "Pink", job: "Speaks your script with open Nigerian TTS — YarnGPT2 / MMS on Modal" },
  { key: "critic", name: "Critic", img: "/agents/critic.webp", color: "Green", job: "Plan & script critic (advisory) — Muse Spark scores each scene's plan and line and leaves notes; it never blocks a run" },
  { key: "editor", name: "Editor", img: "/agents/editor.webp", color: "Purple", job: "Stitches clips, burns captions, adds the AI-generated label, final polish" },
];

export const PIPELINE = [
  ["Research", "Pain points, hooks, formats · Muse Spark Open"], ["Storyboard", "You review the scenes before money moves · Muse Spark Open"],
  ["Script", "Local-language lines, one idea per scene · Muse Spark Open"], ["Keyframe", "Persona-locked photoreal stills · Muse Image 1.0"],
  ["Keyframe QC", "Advisory person + phone check on each still · SAM 3.1"], ["Voice", "Open Nigerian speech · YarnGPT2 / MMS"],
  ["Video", "Silent motion, voice muxed at stitch · Wan 2.2 (primary) / LTX 2.5 (fallback)"], ["Critic", "Plan & script critic (advisory) · Muse Spark Open"],
  ["Verify", "First voiced scene transcribed and checked vs script · Muse Voice Transcribe"], ["Film", "Captioned 9:16 film + AI-generated label · ffmpeg"],
  ["Export", "Caption + 5–8 hashtags, ready to paste · Muse Spark Open"],
];

// Fallbacks only — the live names come from /api/health `models`.
export const MODEL_BADGES = { research: "Muse Spark Open (Baseten)", storyboard: "Muse Spark Open (Baseten)",
  script: "Muse Spark Open (Baseten)", keyframe: "Muse Image 1.0 (Meta)", segment: "SAM 3.1 (Meta, keyframe QC)",
  voice: "YarnGPT2 / MMS (Modal)", video: "Wan 2.2 (Modal, primary)", critic: "Muse Spark Open (Baseten)",
  stitch: "ffmpeg composite (Modal)", verify: "Muse Voice Transcribe 1.0 (Meta)", export: "Muse Spark Open (Baseten)" };

export const STAGE_LABELS = { research: "Research", storyboard: "Storyboard", script: "Brain", keyframe: "Keyframe", segment: "QC",
  voice: "Voice", video: "Video", critic: "Critic (advisory)", stitch: "Stitch", verify: "Verify", export: "Export" };

export const ENGINES = [
  { id: "wan", label: "Wan 2.2 — 720p vertical, ~5s per scene (primary)", short: "Wan 2.2 (Modal)" },
  { id: "ltx", label: "LTX 2.5 — fallback, up to ~10s", short: "LTX 2.5 (Modal)" },
];

export const LANGS = ["pidgin", "yoruba", "hausa", "igbo", "nigerian-english"];
export const LANG_LABELS = { pidgin: "Pidgin", yoruba: "Yoruba", hausa: "Hausa", igbo: "Igbo", "nigerian-english": "Nigerian English" };

export const FORMATS = [
  { id: "standard", label: "Standard UGC", blurb: "Hook → pain → proof → testimonial → CTA (5 scenes)" },
  { id: "confession", label: "Confession — winning format", blurb: "“I stopped using X…” → pain → switch → proof-stack → copy-me CTA (6 scenes + proof overlays)" },
];

export const PERSONAS = [
  { id: "female-creator", label: "Female creator (Aisha)", blurb: "Woman, late 20s, braids — voice: Idera (YarnGPT2)" },
  { id: "female-creator-2", label: "Female creator 2 (Funmi) — locked", blurb: "Light-skinned Nigerian woman, black knotless braids, upscale Lagos flat — Yoruba calibration, voice: yoruba_female2" },
  { id: "male-creator", label: "Male creator", blurb: "Man, early 30s, fade + beard — voice: Jude (YarnGPT2)" },
  { id: "male-creator-dark", label: "Male creator — dark skin (Ebuka)", blurb: "Dark-skinned man, early 30s, fade + neat beard — voice: Jude (YarnGPT2) · avatar pending approval" },
  { id: "male-creator-light", label: "Male creator — light skin (Tunde)", blurb: "Light-skinned man, late 20s, short waves — voice: Jude (YarnGPT2) · avatar pending approval" },
];

export const EMPTY_FORM = { name: "", description: "", url: "", category: "", audience: "", language: "pidgin", persona: "female-creator", format: "confession", sceneLimit: "0" };

// "Try a sample product" — a realistic (fictional) Lagos brand for judges.
export const SAMPLE_PRODUCT = {
  name: "Ori Glow — whipped shea butter body cream",
  description: "Unrefined Grade-A shea butter from Kwara, whipped in small batches in Yaba, Lagos with coconut oil and cocoa butter. Made for dry, ashy skin in harmattan — soaks in fast, no greasy shine, no bleaching agents, safe for kids and sensitive skin. 250g jar for ₦6,500, ordered on WhatsApp with same-day delivery across Lagos.",
  url: "",
  category: "skincare",
  audience: "Lagos women 22–40 who buy skincare from Instagram and WhatsApp vendors and are tired of fake or bleaching creams",
  language: "pidgin",
  persona: "female-creator",
  format: "confession",
  sceneLimit: "1",
};
