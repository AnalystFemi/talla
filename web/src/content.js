// Copy + constants for the homepage and Studio.
export const AGENTS = [
  { key: "researcher", name: "Researcher", img: "/agents/researcher-cut.webp", lg: "/agents/researcher-lg.webp", color: "Blue",
    job: "Analyses market trends, customer pain points and what Nigerian buyers respond to",
    short: "studies your market and customer desires", status: "Found 3 pain points for rcpt" },
  { key: "scriptwriter", name: "Scriptwriter", img: "/agents/scriptwriter-cut.webp", lg: "/agents/scriptwriter-lg.webp", color: "Orange",
    job: "Writes high-converting hooks and scripts in Pidgin, Yoruba, Hausa, Igbo & Nigerian English",
    short: "writes hooks and scripts in your customers' language", status: "Wrote a 6-scene Pidgin script" },
  { key: "voice", name: "Voice", img: "/agents/voice-cut.webp", lg: "/agents/voice-lg.webp", color: "Pink",
    job: "Voices your script with authentic, expressive West African accents",
    short: "voices every line with natural local speech", status: "Voiced scene 1 in Pidgin" },
  { key: "critic", name: "Critic", img: "/agents/critic-cut.webp", lg: "/agents/critic-lg.webp", color: "Green",
    job: "Plan & script reviewer — evaluates each scene's pacing and hook strength",
    short: "advises on scene flow and spoken hooks", status: "Reviewed storyboard" },
  { key: "editor", name: "Editor", img: "/agents/editor-cut.webp", lg: "/agents/editor-lg.webp", color: "Purple",
    job: "Films scenes, composites proof overlays, burns dual captions and polishes the final cut",
    short: "stitches clips, burns captions and polishes the video", status: "Stitching captions…" },
];

export const PIPELINE = [
  ["Research", "Pain points, hooks and buyer psychology"],
  ["Storyboard", "Full scene-by-scene shot plan you can review and edit"],
  ["Script", "Authentic local-language lines tailored to your audience"],
  ["Visuals", "Photorealistic portrait stills locked to your creator"],
  ["Visual QC", "Framing and quality check for face and phone visibility"],
  ["Voice", "Native West African voices with natural cadence"],
  ["Video", "Audio-driven lip-sync matching the spoken line"],
  ["Pacing Critic", "Advisory pacing review for high retention"],
  ["Audio QA", "Script alignment check on voiced lines"],
  ["Film", "Captioned 9:16 vertical video with product proof overlays"],
  ["Export", "Video, caption and hashtags ready to post"],
];

export const MODEL_BADGES = {
  research: "Research", storyboard: "Storyboard", script: "Script",
  keyframe: "Visuals", segment: "QC", voice: "Voice",
  video: "Video", critic: "Critic", stitch: "Stitch",
  verify: "Verify", export: "Export"
};

export const STAGE_LABELS = {
  research: "Research", storyboard: "Storyboard", script: "Script",
  keyframe: "Visuals", segment: "Quality Check", voice: "Voice",
  video: "Video", critic: "Critic (advisory)", stitch: "Stitch",
  verify: "Audio QA", export: "Export"
};

export const ENGINES = [
  { id: "talk", label: "Lip-synced video (recommended)", short: "Lip-synced", blurb: "Creator's lips follow the voice naturally — any duration" },
  { id: "wan", label: "Cinematic vertical video", short: "Cinematic", blurb: "Vertical 9:16 cinematic motion" },
];

export const LANGS = ["pidgin", "yoruba", "hausa", "igbo", "nigerian-english"];
export const LANG_LABELS = {
  pidgin: "Pidgin",
  yoruba: "Yoruba",
  hausa: "Hausa",
  igbo: "Igbo",
  "nigerian-english": "Nigerian English"
};

export const FORMATS = [
  { id: "standard", label: "Standard UGC", blurb: "Hook → pain → proof → testimonial → CTA (5 scenes)" },
  { id: "confession", label: "Confession — winning format", blurb: "“I stopped using X…” → pain → switch → proof-stack → copy-me CTA (6 scenes + proof overlays)" },
];

export const PERSONAS = [
  { id: "female-creator-2", label: "Funmi", blurb: "Warm lifestyle creator · Lagos", img: "/avatars/funmi.webp" },
  { id: "female-creator", label: "Aisha", blurb: "Trusted everyday creator · Abuja", img: "/avatars/aisha.webp" },
  { id: "male-creator-dark", label: "Ebuka", blurb: "Dynamic business creator · Lagos", img: "/avatars/ebuka.webp" },
  { id: "male-creator-light", label: "Tunde", blurb: "Relatable storyteller · Lagos", img: "/avatars/tunde.webp" },
];

export const CATEGORY_PRESETS = [
  "Business & FinTech",
  "Skincare & Glow",
  "Fashion & Thrift",
  "Hair & Wigs",
  "Food & Pastries",
  "Phones & Gadgets",
  "Logistics & Delivery"
];

export const AUDIENCE_PRESETS = [
  "WhatsApp & Instagram vendors in Lagos",
  "Lekki & Abuja working professionals",
  "Campus students & Gen-Z shoppers",
  "Busy mums wanting fast delivery",
  "Small business owners across Nigeria"
];

export const PRODUCT_PRESETS = [
  {
    name: "rcpt",
    label: "rcpt (Business receipts)",
    description: "rcpt turns a sale into a clean, branded receipt in seconds from your phone — built for Nigerian small businesses who sell on WhatsApp and Instagram and want customers to trust them. Free to start, Pro plan for logos and unlimited receipts.",
    url: "https://rcpt.me",
    category: "Business & FinTech",
    audience: "WhatsApp & Instagram vendors in Lagos",
    language: "pidgin",
    persona: "female-creator",
    format: "confession",
    sceneLimit: "1",
  },
  {
    name: "Ori Glow",
    label: "Ori Glow (Skincare)",
    description: "Ori Glow is 100% whipped organic shea butter and turmeric oil for radiant, dark skin glow without bleaching or harsh chemicals. Fast delivery across Nigeria.",
    url: "",
    category: "Skincare & Glow",
    audience: "Lekki & Abuja women looking for natural skin glow",
    language: "pidgin",
    persona: "female-creator-2",
    format: "confession",
    sceneLimit: "1",
  },
  {
    name: "Lagos Thrift King",
    label: "Lagos Thrift (Fashion)",
    description: "Lagos Thrift King curates Grade-A vintage streetwear, oversized tees, and cargo pants straight from the bale at prices that won't break your pocket.",
    url: "",
    category: "Fashion & Thrift",
    audience: "Campus students & Gen-Z shoppers in Lagos",
    language: "pidgin",
    persona: "male-creator-dark",
    format: "confession",
    sceneLimit: "1",
  }
];

export const EMPTY_FORM = {
  name: "", description: "", url: "", category: "", audience: "",
  language: "pidgin", persona: "female-creator-2", format: "confession", sceneLimit: "0"
};

export const SAMPLE_PRODUCT = PRODUCT_PRESETS[0];
