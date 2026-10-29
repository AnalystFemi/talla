// Talla agent brain — Researcher, Storyboard, Scriptwriter, Critic.
// All run on Baseten Muse Spark Open when a key exists. Without a key they
// return deterministic, clearly-labelled demo output so the full product
// flow can be built and judged end-to-end before credits are spent.

import { basetenChat, firecrawlScrape, exaSearch, has } from "./providers.js";
import { charge, cacheGet, cacheSet, cacheKey, assertBudget } from "./credits.js";

export const LANGUAGES = ["pidgin", "yoruba", "hausa", "igbo", "nigerian-english"];

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
  if (!has(env, "BASETEN_API_KEY")) {
    const hooks = project.research?.hooks || ["See why everybody dey talk about this"];
    return { mode: "demo", scenes: [
      { n: 1, purpose: "Hook", shot: "talking-head close-up", key_line: hooks[0], seconds: 6, visual: "Creator to camera, product in hand, natural window light" },
      { n: 2, purpose: "Pain", shot: "POV demo", key_line: "Show the old frustrating way in 3 seconds", seconds: 7, visual: "Hands struggling with the old option" },
      { n: 3, purpose: "Proof", shot: "product demo", key_line: "Show the product solving it, no filter", seconds: 9, visual: "Close-up proof moment, real environment" },
      { n: 4, purpose: "Testimonial", shot: "talking-head", key_line: "One honest sentence on why they switched", seconds: 8, visual: "Same creator, relaxed smile, nods" },
      { n: 5, purpose: "CTA", shot: "talking-head + text overlay", key_line: "Tell them exactly what to do next", seconds: 6, visual: "Product centred, CTA text, AI-generated label visible" },
    ]};
  }
  assertBudget("baseten");
  const out = await basetenChat(env, [
    { role: "system", content: "You are Talla's Storyboard agent. Return ONLY JSON {scenes:[{n,purpose,shot,key_line,seconds,visual}]}. 3-7 scenes, total 25-40s, each 5-15s. Talking-head primary." },
    { role: "user", content: `Product: ${project.name} (${project.description})\nResearch: ${JSON.stringify(project.research)}` },
  ]);
  await charge(env, "baseten", "storyboard", project.id);
  return { mode: "live", ...out };
}

export async function scriptAgent(env, project) {
  const lang = project.language || project.research?.recommended_language || "pidgin";
  if (!has(env, "BASETEN_API_KEY")) {
    return { mode: "demo", language: lang, lines: (project.storyboard?.scenes || []).map((s) => ({
      scene: s.n, text: s.n === 1 ? (project.research?.hooks?.[0] || s.key_line) : s.key_line, seconds: s.seconds,
    }))};
  }
  assertBudget("baseten");
  const out = await basetenChat(env, [
    { role: "system", content: `You are Talla's Scriptwriter. Write in ${lang} exactly as a Nigerian creator would speak it. Return ONLY JSON {language, lines:[{scene,text,seconds}]}. Short spoken lines, one idea per scene.` },
    { role: "user", content: `Storyboard: ${JSON.stringify(project.storyboard)}\nResearch: ${JSON.stringify(project.research)}` },
  ]);
  await charge(env, "baseten", "script", project.id);
  return { mode: "live", ...out };
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
      checks: { lip_sync: "pass", skin_realism: "pass", product_accuracy: "pass", language_naturalness: "pass" },
      note: "Demo critic — connect Baseten for live Muse Spark criticism." };
  }
  assertBudget("baseten");
  const out = await basetenChat(env, [
    { role: "system", content: "You are Talla's Critic. Return ONLY JSON {verdict:pass|reject, score:1-10, checks:{lip_sync,skin_realism,product_accuracy,language_naturalness}, note}. Reject plastic skin, bad lip-sync, wrong product, unnatural Nigerian speech." },
    { role: "user", content: `Scene: ${JSON.stringify(scene)}\nExpected product: ${project.name} — ${project.description}\nLanguage: ${project.language}` },
  ]);
  await charge(env, "baseten", "critic", project.id);
  return { mode: "live", scene: scene.n ?? scene.scene, attempt, ...out };
}
