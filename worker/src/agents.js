// Talla agent brain — Researcher, Storyboard, Scriptwriter, Critic.
// All run on Baseten Muse Spark Open when a key exists. Without a key they
// return deterministic, clearly-labelled demo output so the full product
// flow can be built and judged end-to-end before credits are spent.

import { basetenChat, firecrawlScrape, exaSearch, has } from "./providers.js";
import { charge, cacheGet, cacheSet, cacheKey, assertBudget } from "./credits.js";

export const LANGUAGES = ["pidgin", "yoruba", "hausa", "igbo", "nigerian-english"];

// Script formats — "standard" is the original generic UGC; "confession" is
// the winning-UGC recreation format ("I stopped using X and now ... copy
// me"): continuous voiceover + proof cutaways. Chosen per project via
// project.format (persisted by the stage route from body.format).
export const SCRIPT_FORMATS = ["standard", "confession"];

const CONFESSION_BEATS = `Confession-format beats (in order): 1 Hook-confession ("I stopped using X..."), 2 Pain-agitation (what the old option cost them), 3 Switch (the new workflow/product in one sentence), 4 Proof-stack (live demo, before/after, zoom on the detail — one proof per scene), 5 Copy-me CTA (permission + exact next step). Every line must sound like a friend gisting, not a TV presenter. One idea per scene, short spoken sentences.`;

const OVERLAY_SCHEMA = `Each scene may carry an optional "overlay" for the proof cutaway: null (face-only A-roll) or {asset:"receipt-screenshot"|"screen-recording"|"before-after"|null, note:"what the editor should composite, max 12 words", seconds:2-6, style:"pip"|"fullscreen"}. Face-only hook/CTA scenes use null; Proof scenes SHOULD set an overlay.`;

function demoStoryboard(format, hooks) {
  const base = [
    { n: 1, purpose: "Hook", shot: "talking-head close-up", key_line: hooks[0], seconds: 6, visual: "Creator to camera, product in hand, natural window light", overlay: null },
    { n: 2, purpose: "Pain", shot: "POV demo", key_line: "Show the old frustrating way in 3 seconds", seconds: 7, visual: "Hands struggling with the old option", overlay: null },
    { n: 3, purpose: "Proof", shot: "product demo", key_line: "Show the product solving it, no filter", seconds: 9, visual: "Close-up proof moment, real environment", overlay: { asset: "screen-recording", note: "Real product screen solving it, fullscreen", seconds: 5, style: "fullscreen" } },
    { n: 4, purpose: "Testimonial", shot: "talking-head", key_line: "One honest sentence on why they switched", seconds: 8, visual: "Same creator, relaxed smile, nods", overlay: null },
    { n: 5, purpose: "CTA", shot: "talking-head + text overlay", key_line: "Tell them exactly what to do next", seconds: 6, visual: "Product centred, CTA text, AI-generated label visible", overlay: null },
  ];
  if (format !== "confession") return base;
  return [
    { n: 1, purpose: "Hook-confession", shot: "talking-head close-up", key_line: hooks[0] || "I stopped using the old way, and this looks 100% real now — copy me", seconds: 6, visual: "Creator leans in, direct to camera, pattern-break energy", overlay: null },
    { n: 2, purpose: "Pain-agitation", shot: "talking-head", key_line: "Name what the old option cost: time, money, fake look", seconds: 7, visual: "Same creator, frustrated gist, quick hand gestures", overlay: null },
    { n: 3, purpose: "Switch", shot: "talking-head + product", key_line: "The new workflow in one sentence, product visible", seconds: 6, visual: "Creator holds product up, then back to face", overlay: null },
    { n: 4, purpose: "Proof-stack-1", shot: "product demo", key_line: "Live demo: watch it work, no filter", seconds: 9, visual: "Close-up proof moment, real environment", overlay: { asset: "screen-recording", note: "Real product screen working, fullscreen", seconds: 5, style: "fullscreen" } },
    { n: 5, purpose: "Proof-stack-2", shot: "before/after", key_line: "Before vs after, zoom on the detail", seconds: 8, visual: "Side-by-side comparison, zoom on texture/detail", overlay: { asset: "before-after", note: "Before/after stills, zoom on detail", seconds: 4, style: "pip" } },
    { n: 6, purpose: "Copy-me-CTA", shot: "talking-head + text overlay", key_line: "Copy me: exact next step in one sentence", seconds: 6, visual: "Product centred, CTA text, AI-generated label visible", overlay: null },
  ];
}

const UGC_STYLE = `Photoreal UGC rules: raw iPhone selfie, visible pores, natural light, everyday Nigerian setting. NEVER: plastic skin, airbrushed, CGI, beauty filter.`;

function demoResearch(p) {
  const name = p.name || p.category || "this product";
  return {
    mode: "demo",
    pain_points: [`${name} customers waste time and money on options that disappoint`, "Trust is low — buyers fear paying for what they will not get", "Sellers struggle to explain value in short videos"],
    desires: ["Proof it works before paying", "A price that feels fair in this economy", "Fast, friendly response on WhatsApp/DM"],
    hooks: [`"Stop wasting money on ${name} that no work"`, `"Na this one finally solve am"`, `"Watch till the end — see the proof"`],
    formats: ["talking-head testimonial", "before/after demo", "POV unboxing/reveal"],
    recommended_language: p.language || "pidgin",
    tone_notes: "Warm, direct, friend-to-friend. Short sentences. One clear proof moment per video.",
    visual_notes: UGC_STYLE,
  };
}

export async function researchAgent(env, project) {
  const key = cacheKey("research", project.name, project.description, project.url, project.category, project.language);
  const hit = cacheGet(key);
  if (hit) { await charge(env, "baseten", "research", project.id, { cached: true }); return { ...hit, cached: true }; }

  let enrichment = "";
  if (project.url && has(env, "FIRECRAWL_API_KEY")) {
    try { enrichment = await firecrawlScrape(env, project.url); await charge(env, "firecrawl", "scrape", project.id); } catch {}
  }
  if (has(env, "EXA_API_KEY")) {
    try {
      const results = await exaSearch(env, `${project.name || project.category} Nigeria customer reviews problems UGC video hooks`);
      enrichment += "\n" + results.map((r) => `${r.title}: ${r.text}`).join("\n");
      await charge(env, "exa", "search", project.id);
    } catch {}
  }
  if (!has(env, "BASETEN_API_KEY")) return cacheSet(key, demoResearch(project));
  assertBudget("baseten");
  const out = await basetenChat(env, [
    { role: "system", content: "You are Talla's Researcher for Nigerian markets. Return ONLY JSON: {pain_points[], desires[], hooks[3], formats[], recommended_language, tone_notes, visual_notes}. Ground hooks in Nigerian buying behaviour; suggest Pidgin/Yoruba/Hausa/Igbo/Nigerian English where natural." },
    { role: "user", content: `Product: ${project.name}\nDescription: ${project.description}\nURL: ${project.url}\nCategory: ${project.category}\nAudience: ${project.audience}\nLanguage: ${project.language}\nWeb enrichment:\n${enrichment}` },
  ]);
  await charge(env, "baseten", "research", project.id);
  return cacheSet(key, { mode: "live", ...out });
}

export async function storyboardAgent(env, project) {
  const format = project.format === "confession" ? "confession" : "standard";
  if (!has(env, "BASETEN_API_KEY")) {
    const hooks = project.research?.hooks || ["See why everybody dey talk about this"];
    return { mode: "demo", format, scenes: demoStoryboard(format, hooks) };
  }
  assertBudget("baseten");
  const formatBrief = format === "confession"
    ? `FORMAT: confession (winning-UGC recreation). 4-7 scenes, total 25-45s, each 5-15s. ${CONFESSION_BEATS} ${OVERLAY_SCHEMA}`
    : `FORMAT: standard. 3-7 scenes, total 25-40s, each 5-15s. Talking-head primary. ${OVERLAY_SCHEMA}`;
  const out = await basetenChat(env, [
    { role: "system", content: `You are Talla's Storyboard agent. Return ONLY JSON {scenes:[{n,purpose,shot,key_line,seconds,visual,overlay}]}. ${formatBrief}` },
    { role: "user", content: `Product: ${project.name} (${project.description})\nResearch: ${JSON.stringify(project.research)}` },
  ]);
  await charge(env, "baseten", "storyboard", project.id);
  const scenes = (out.scenes || []).map((s) => ({ overlay: null, ...s }));
  return { mode: "live", format, scenes };
}

export async function scriptAgent(env, project) {
  const lang = project.language || project.research?.recommended_language || "pidgin";
  const format = project.format === "confession" ? "confession" : "standard";
  if (!has(env, "BASETEN_API_KEY")) {
    return { mode: "demo", language: lang, format, lines: (project.storyboard?.scenes || []).map((s) => ({
      scene: s.n, text: s.n === 1 ? (project.research?.hooks?.[0] || s.key_line) : s.key_line, seconds: s.seconds,
    }))};
  }
  assertBudget("baseten");
  const formatBrief = format === "confession" ? CONFESSION_BEATS : "Standard UGC: hook, pain, proof, testimonial, CTA. One idea per scene.";
  const out = await basetenChat(env, [
    { role: "system", content: `You are Talla's Scriptwriter. Write in ${lang} exactly as a Nigerian creator would speak it. Return ONLY JSON {language, lines:[{scene,text,seconds}]}. Short spoken lines, one idea per scene. ${formatBrief}` },
    { role: "user", content: `Storyboard: ${JSON.stringify(project.storyboard)}\nResearch: ${JSON.stringify(project.research)}` },
  ]);
  await charge(env, "baseten", "script", project.id);
  return { mode: "live", format, ...out };
}

export async function exportAgent(env, project, job) {
  // Export for Posting (final lightweight step, optional): after stitch +
  // AI label, prepare a ready-to-post package — caption in the video's own
  // language + 5–8 hashtags (local + general mix). NO social APIs, no
  // auto-posting: the user copies and posts manually. Demo fallback keeps
  // the flow testable with zero credits.
  const lang = project.language || project.script?.language || "pidgin";
  const hook = project.research?.hooks?.[0] || project.storyboard?.scenes?.[0]?.key_line || project.name;
  const lines = (project.script?.lines || []).map((l) => l.text);
  if (!has(env, "BASETEN_API_KEY")) {
    const caption = `${hook}\n\n${(lines[lines.length - 1] || project.name || "")}\n#NaijaBusiness #SmallBusinessNigeria #UGC`;
    return { mode: "demo", language: lang,
      caption,
      hashtags: ["#NaijaBusiness", "#SmallBusinessNigeria", "#UGC", "#Nigeria", "#SupportSmallBusiness", "#EntrepreneurNigeria"],
      video_url: job?.final_video_url || null, video_volume_path: job?.final_volume_path || null,
      checklist: ["Video carries the AI-generated label", "Copy the caption + hashtags", "Post manually on TikTok / Reels / Shorts", "Turn on the platform AI-content label when posting"],
      note: "Demo export — connect Baseten for a Muse Spark caption in your language." };
  }
  assertBudget("baseten");
  const out = await basetenChat(env, [
    { role: "system", content: `You are Talla's Export assistant. Write a ready-to-post social caption for a Nigerian UGC video. Return ONLY JSON {caption, hashtags:[5-8 strings starting with #]}. The caption MUST be written in ${lang} exactly as a Nigerian creator would write it (same language as the spoken script). Caption: short hook first line, 1-2 value lines, one clear call to action, 0-2 natural emojis, line breaks allowed. Hashtags: mix Nigerian/local audience tags with general UGC/small-business tags, relevant to the product and category, no spam, no fake claims, no invented prices or discounts.` },
    { role: "user", content: `Product: ${project.name} — ${project.description}\nCategory: ${project.category}\nAudience: ${project.audience}\nLanguage: ${lang}\nSpoken script lines: ${lines.join(" | ")}\nTop hook: ${hook}` },
  ]);
  await charge(env, "baseten", "export", project.id);
  const hashtags = (out.hashtags || []).filter((h) => String(h).startsWith("#")).slice(0, 8);
  return { mode: "live", language: lang,
    caption: out.caption || hook,
    hashtags: hashtags.length ? hashtags : ["#NaijaBusiness", "#SmallBusinessNigeria", "#UGC"],
    video_url: job?.final_video_url || null, video_volume_path: job?.final_volume_path || null,
    checklist: ["Video carries the AI-generated label", "Copy the caption + hashtags", "Post manually on TikTok / Reels / Shorts", "Turn on the platform AI-content label when posting"] };
}

export async function criticAgent(env, project, scene, attempt) {
  // Critic gate (brief §5/§6): reject plastic skin, bad lip-sync, wrong
  // product, unnatural local speech. Max retries enforced by LIMITS.
  if (!has(env, "BASETEN_API_KEY")) {
    return { mode: "demo", scene: scene.n ?? scene.scene, attempt, verdict: "pass", score: 8,
      checks: { face_consistency: "pass", skin_realism: "pass", product_accuracy: "pass", language_naturalness: "pass" },
      note: "Demo critic — connect Baseten for live Muse Spark criticism." };
  }
  assertBudget("baseten");
  const out = await basetenChat(env, [
    { role: "system", content: "You are Talla's Critic. Return ONLY JSON {verdict:pass|reject, score:1-10, checks:{face_consistency,skin_realism,product_accuracy,language_naturalness}, note}. Reject plastic skin, wrong product, unnatural Nigerian speech, or a scene framing the chosen Wan/LTX shot cannot perform (Wan/LTX silent motion + local voice; calling-head close-ups are judged leniently until the open-source lipsync bake-off lands). NOTE: you judge the scene plan and script text only (frame-aware video scoring is roadmap) — say so honestly in the note if relevant." },
    { role: "user", content: `Scene: ${JSON.stringify(scene)}\nExpected product: ${project.name} — ${project.description}\nLanguage: ${project.language}` },
  ]);
  await charge(env, "baseten", "critic", project.id);
  return { mode: "live", scene: scene.n ?? scene.scene, attempt, ...out };
}
