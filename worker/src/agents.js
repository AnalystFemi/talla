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

// Engine duration caps (owner decision 2026-10-30; modal/wan_app.py — do
// not exceed, or stitch must clone-freeze the picture tail under the
// voice): Wan 2.2 renders 720x1280 @16 fps, at most 81 frames (~5.0 s); LTX
// 2.5 renders 8n+1 frames @24 fps, at most 257 (~10.6 s). The Worker sizes
// each clip to min(real voice duration, cap), so lines must be speakable
// inside the cap: roughly 10-11 spoken words for a 5 s Wan line.
const ENGINE_CAPS = `ENGINE CAPS (hard): each scene's spoken line must fit its seconds when spoken naturally (~2.2 words/second). Wan 2.2 motion caps at ~5s per scene and LTX 2.5 at ~10.6s, so keep scenes 4-6s and lines to about 9-12 words — never write a line that needs more seconds than its scene, or the picture freezes under the voice.`;

const OVERLAY_SCHEMA = `Each scene may carry an optional "overlay" for the proof cutaway: null (face-only A-roll) or {asset:"receipt-screenshot"|"screen-recording"|"before-after"|null, note:"what the editor should composite, max 12 words", seconds:2-6, style:"pip"|"fullscreen"}. Face-only hook/CTA scenes use null; Proof scenes SHOULD set an overlay.`;

function demoStoryboard(format, hooks) {
  const base = [
    { n: 1, purpose: "Hook", shot: "talking-head close-up", key_line: hooks[0], seconds: 5, visual: "Creator to camera, product in hand, natural window light", overlay: null },
    { n: 2, purpose: "Pain", shot: "POV demo", key_line: "Show the old frustrating way in 3 seconds", seconds: 5, visual: "Hands struggling with the old option", overlay: null },
    { n: 3, purpose: "Proof", shot: "product demo", key_line: "Show the product solving it, no filter", seconds: 5, visual: "Close-up proof moment, real environment", overlay: { asset: "screen-recording", note: "Real product screen solving it, fullscreen", seconds: 5, style: "fullscreen" } },
    { n: 4, purpose: "Testimonial", shot: "talking-head", key_line: "One honest sentence on why they switched", seconds: 5, visual: "Same creator, relaxed smile, nods", overlay: null },
    { n: 5, purpose: "CTA", shot: "talking-head + text overlay", key_line: "Tell them exactly what to do next", seconds: 5, visual: "Product centred, CTA text", overlay: null },
  ];
  if (format !== "confession") return base;
  return [
    { n: 1, purpose: "Hook-confession", shot: "talking-head close-up", key_line: hooks[0] || "I stopped using the old way, and this looks 100% real now — copy me", seconds: 5, visual: "Creator leans in, direct to camera, pattern-break energy", overlay: null },
    { n: 2, purpose: "Pain-agitation", shot: "talking-head", key_line: "Name what the old option cost: time, money, fake look", seconds: 5, visual: "Same creator, frustrated gist, quick hand gestures", overlay: null },
    { n: 3, purpose: "Switch", shot: "talking-head + product", key_line: "The new workflow in one sentence, product visible", seconds: 5, visual: "Creator holds product up, then back to face", overlay: null },
    { n: 4, purpose: "Proof-stack-1", shot: "product demo", key_line: "Live demo: watch it work, no filter", seconds: 5, visual: "Close-up proof moment, real environment", overlay: { asset: "screen-recording", note: "Real product screen working, fullscreen", seconds: 5, style: "fullscreen" } },
    { n: 5, purpose: "Proof-stack-2", shot: "before/after", key_line: "Before vs after, zoom on the detail", seconds: 5, visual: "Side-by-side comparison, zoom on texture/detail", overlay: { asset: "before-after", note: "Before/after stills, zoom on detail", seconds: 4, style: "pip" } },
    { n: 6, purpose: "Copy-me-CTA", shot: "talking-head + text overlay", key_line: "Copy me: exact next step in one sentence", seconds: 5, visual: "Product centred, CTA text", overlay: null },
  ];
}

const UGC_STYLE = `Photoreal UGC rules: raw iPhone selfie, visible pores, natural light, everyday Nigerian setting. NEVER: plastic skin, airbrushed, CGI, beauty filter.`;

function demoResearch(p) {
  const name = p.name || p.category || "this product";
  return {
    mode: "demo",
    pain_points: [`${name} customers waste time and money on options that disappoint`, "Trust is low — buyers fear paying for what they will not get", "Sellers struggle to explain value in short videos"],
    desires: ["Proof it works before paying", "A price that feels fair in this economy", "Fast, friendly response on WhatsApp/DM"],
    // Hooks sell the user's product — the old first hook ("Stop wasting money
    // on <product> that no work") disparaged it in every demo run.
    hooks: [`"I stopped wasting money on things that no work — ${name} na the one"`, `"Na this one finally solve am"`, `"Watch till the end — see the proof"`],
    formats: ["talking-head testimonial", "before/after demo", "POV unboxing/reveal"],
    recommended_language: p.language || "pidgin",
    tone_notes: "Warm, direct, friend-to-friend. Short sentences. One clear proof moment per video.",
    visual_notes: UGC_STYLE,
  };
}

export async function researchAgent(env, project) {
  // Demo output is NEVER cached: the cache is shared by every request in an
  // isolate, so a cached demo answer (from an unauthorised visitor) would
  // otherwise be served to a later paid run with the same inputs.
  if (!has(env, "BASETEN_API_KEY")) return demoResearch(project);
  const key = cacheKey("research", project.name, project.description, project.url, project.category, project.language);
  const hit = cacheGet(key);
  if (hit) { await charge(env, "baseten", "research", project.id, { cached: true }); return { ...hit, cached: true }; }

  let enrichment = "";
  // Enrichment is optional: a budget refusal or provider failure just
  // skips it (logged), the research itself still runs.
  if (project.url && has(env, "FIRECRAWL_API_KEY")) {
    try { assertBudget("firecrawl", "scrape"); enrichment = await firecrawlScrape(env, project.url); await charge(env, "firecrawl", "scrape", project.id); }
    catch (e) { console.error("[research] firecrawl skipped:", e.message); }
  }
  if (has(env, "EXA_API_KEY")) {
    try {
      assertBudget("exa", "search");
      const results = await exaSearch(env, `${project.name || project.category} Nigeria customer reviews problems UGC video hooks`);
      enrichment += "\n" + results.map((r) => `${r.title}: ${r.text}`).join("\n");
      await charge(env, "exa", "search", project.id);
    } catch (e) { console.error("[research] exa skipped:", e.message); }
  }
  assertBudget("baseten", "research");
  const out = await basetenChat(env, [
    { role: "system", content: "You are Talla's Researcher for Nigerian markets. Return ONLY JSON: {pain_points[], desires[], hooks[3], formats[], recommended_language, tone_notes, visual_notes}. Ground hooks in Nigerian buying behaviour; suggest Pidgin/Yoruba/Hausa/Igbo/Nigerian English where natural." },
    { role: "user", content: `Product: ${project.name}
Description: ${project.description}
URL: ${project.url}
Category: ${project.category}
Audience: ${project.audience}
Language: ${project.language}
Web enrichment:
${enrichment}` },
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
  assertBudget("baseten", "storyboard");
  const formatBrief = format === "confession"
    ? `FORMAT: confession (winning-UGC recreation). 4-7 scenes, total 20-40s, each 4-6s. ${CONFESSION_BEATS} ${OVERLAY_SCHEMA} ${ENGINE_CAPS}`
    : `FORMAT: standard. 3-7 scenes, total 20-40s, each 4-6s. Talking-head primary. ${OVERLAY_SCHEMA} ${ENGINE_CAPS}`;
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
      // Scene 1's key_line already carries the research hook; using it
      // directly keeps Studio storyboard edits in the demo script.
      scene: s.n, text: s.key_line || project.research?.hooks?.[0] || "", seconds: s.seconds,
    }))};
  }
  assertBudget("baseten", "script");
  const formatBrief = format === "confession" ? CONFESSION_BEATS : "Standard UGC: hook, pain, proof, testimonial, CTA. One idea per scene.";
  const out = await basetenChat(env, [
    { role: "system", content: `You are Talla's Scriptwriter. Write in ${lang} exactly as a Nigerian creator would speak it. Return ONLY JSON {language, lines:[{scene,text,english,seconds}]} — "english" is a plain English translation of "text" (shown as the subtitle underneath; empty string if text is already English). Short spoken lines, one idea per scene. You may write [pause] inside text for a deliberate beat. ${formatBrief} ${ENGINE_CAPS}` },
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
      checklist: ["Copy the caption + hashtags", "Post manually on TikTok / Reels / Shorts", "Turn on the platform AI-content label when posting"],
      note: "Demo export — connect Baseten for a Muse Spark caption in your language." };
  }
  assertBudget("baseten", "export");
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
    checklist: ["Copy the caption + hashtags", "Post manually on TikTok / Reels / Shorts", "Turn on the platform AI-content label when posting"] };
}

export const CRITIC_LABEL = "plan/script critic (advisory)";

export async function criticAgent(env, project, scene, attempt) {
  // Plan/script critic (ADVISORY). It reads the scene plan + spoken line as
  // TEXT only — it never sees a frame or a clip, so it must not claim any
  // visual verdict (skin realism, face consistency, lip-sync). Those checks
  // need a frame-aware critic (roadmap). Verdicts are shown per scene and
  // never block or discard a paid clip.
  const line = String(scene.line?.text || scene.key_line || "");
  const seconds = Number(scene.line?.seconds || scene.seconds) || 6;
  const words = line.split(/\s+/).filter(Boolean).length;
  const fits = words / 2.2 <= seconds + 0.5; // ~2.2 spoken words/second
  if (!has(env, "BASETEN_API_KEY")) {
    // Demo: only a deterministic, honest check (line length vs scene time).
    return { mode: "demo", label: CRITIC_LABEL, scene: scene.n ?? scene.scene, attempt,
      verdict: fits ? "pass" : "reject", score: null,
      checks: { line_fits_seconds: fits ? "pass" : "fail", product_accuracy: "not checked (demo)", language_naturalness: "not checked (demo)" },
      note: `Demo critic — deterministic line-length check only (${words} words / ${seconds}s). Connect Baseten for a live Muse Spark plan/script critique. No visual checks are made.` };
  }
  assertBudget("baseten", "critic");
  const out = await basetenChat(env, [
    { role: "system", content: "You are Talla's plan/script critic. You judge ONLY the scene plan and the spoken line as text — you cannot see any image or video, so never comment on skin, faces, lip-sync or visual realism. Return ONLY JSON {verdict:pass|reject, score:1-10, checks:{product_accuracy,language_naturalness,shot_feasibility,line_fits_seconds}, note}. Reject a wrong/misdescribed product, unnatural Nigerian speech, a line too long to speak in the scene's seconds (~2.2 words/s), or a shot the silent Wan/LTX talking-head motion cannot perform." },
    { role: "user", content: `Scene: ${JSON.stringify({ n: scene.n, purpose: scene.purpose, shot: scene.shot, visual: scene.visual, seconds, line })}
Expected product: ${project.name} — ${project.description}
Language: ${project.language}` },
  ]);
  await charge(env, "baseten", "critic", project.id);
  // Whitelist the fields so a model that ignores the brief cannot smuggle
  // visual-realism claims back into the job record.
  const c = out.checks || {};
  return { mode: "live", label: CRITIC_LABEL, scene: scene.n ?? scene.scene, attempt,
    verdict: out.verdict === "reject" ? "reject" : "pass", score: Number(out.score) || null,
    checks: { product_accuracy: c.product_accuracy ?? null, language_naturalness: c.language_naturalness ?? null,
      shot_feasibility: c.shot_feasibility ?? null, line_fits_seconds: c.line_fits_seconds ?? (fits ? "pass" : "fail") },
    note: String(out.note || "").slice(0, 500) };
}
