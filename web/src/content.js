// Copy + constants for the homepage and Studio. Keep claims honest:
// the critic is an advisory plan & script critic, verify checks the first voiced scene.
export const AGENTS = [
  { key: "researcher", name: "Researcher", img: "/agents/researcher-cut.webp", lg: "/agents/researcher-lg.webp", color: "Blue",
    job: "Analyses trends, competitors and what Nigerian buyers actually want",
    short: "studies your market and what Nigerian buyers actually want", status: "Found 3 pain points for rcpt" },
  { key: "scriptwriter", name: "Scriptwriter", img: "/agents/scriptwriter-cut.webp", lg: "/agents/scriptwriter-lg.webp", color: "Orange",
    job: "Writes hooks and scripts in Pidgin, Yoruba, Hausa, Igbo & Nigerian English",
    short: "writes hooks and scripts in your customers' language", status: "Wrote a 6-scene Pidgin script" },
  { key: "voice", name: "Voice", img: "/agents/voice-cut.webp", lg: "/agents/voice-lg.webp", color: "Pink",
    job: "Speaks your script with open Nigerian TTS — YarnGPT2 / MMS on Modal",
    short: "speaks every line with open Nigerian TTS", status: "Voiced scene 1 in Pidgin" },
  { key: "critic", name: "Critic", img: "/agents/critic-cut.webp", lg: "/agents/critic-lg.webp", color: "Green",
    job: "Plan & script critic (advisory) — Muse Spark scores each scene's plan and line and leaves notes; it never blocks a run",
    short: "leaves advisory notes on each scene's plan and line", status: "Left 1 advisory note" },
  { key: "editor", name: "Editor", img: "/agents/editor-cut.webp", lg: "/agents/editor-lg.webp", color: "Purple",
    job: "Stitches clips, burns captions, adds the AI-generated label, final polish",
    short: "stitches clips, burns captions and adds the AI label", status: "Stitching captions…" },
];

export const PIPELINE = [
  ["Research", "Pain points, hooks, formats · Muse Spark Open"], ["Storyboard", "You review the scenes before money moves · Muse Spark Open"],
  ["Script", "Local-language lines, one idea per scene · Muse Spark Open"], ["Keyframe", "Persona-locked photoreal stills · Muse Image 1.0"],
  ["Keyframe QC", "Advisory person + phone check on each still · SAM 3.1"], ["Voice", "Open Nigerian speech · YarnGPT2 / MMS"],
  ["Video", "Lip-synced to voice · InfiniteTalk (primary, any length) / Wan 2.2 (fallback, silent ~5s)"], ["Critic", "Plan & script critic (advisory) · Muse Spark Open"],
  ["Verify", "First voiced scene check — honest deferred (Meta 404, Whisper-on-Modal option) — never faked"], ["Film", "Captioned 9:16 film + AI-generated label · ffmpeg"],
  ["Export", "Caption + 5–8 hashtags, ready to paste · Muse Spark Open"],
];

// Fallbacks only — the live names come from /api/health `models`.
export const MODEL_BADGES = { research: "Muse Spark Open (Baseten)", storyboard: "Muse Spark Open (Baseten)",
  script: "Muse Spark Open (Baseten)", keyframe: "Muse Image 1.0 (Meta)", segment: "SAM 3.1 (Meta, keyframe QC)",
  voice: "YarnGPT2 / MMS (Modal)", video: "InfiniteTalk (Modal, lip-synced primary)", critic: "Muse Spark Open (Baseten)",
  stitch: "ffmpeg composite (Modal)", verify: "Verify — honest deferred (Meta 404)", export: "Muse Spark Open (Baseten)" };

export const STAGE_LABELS = { research: "Research", storyboard: "Storyboard", script: "Brain", keyframe: "Keyframe", segment: "QC",
  voice: "Voice", video: "Video", critic: "Critic (advisory)", stitch: "Stitch", verify: "Verify", export: "Export" };

export const ENGINES = [
  { id: "talk", label: "InfiniteTalk — lip-synced to your voice, any length (recommended)", short: "InfiniteTalk (recommended)", blurb: "Audio-driven lips, clip follows the line — any length" },
  { id: "wan", label: "Wan 2.2 — 720p vertical, ~5s per scene (fallback)", short: "Wan 2.2 (fallback)", blurb: "Silent motion 720p, ~5s per scene (fallback)" },
];
// LTX 2.5 parked — gated (FemiML 403, see docs/ltx-setup.md). kept in API for old jobs, hidden from Studio per WP-D decision.

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

// "Try a sample product" — rcpt is Talla's demo product (owner decision).
export const SAMPLE_PRODUCT = {
  name: "rcpt",
  description: "rcpt turns a sale into a clean, branded receipt in seconds from your phone — built for Nigerian small businesses who sell on WhatsApp and Instagram and want customers to trust them. Free to start, Pro plan for logos and unlimited receipts.",
  url: "",
  category: "business tools",
  audience: "WhatsApp & Instagram vendors in Lagos",
  language: "pidgin",
  persona: "female-creator",
  format: "confession",
  sceneLimit: "1",
};
