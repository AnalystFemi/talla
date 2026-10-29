import { Hono } from "hono";
import { cors } from "hono/cors";
import { researchAgent, storyboardAgent, scriptAgent, criticAgent, LANGUAGES } from "./agents.js";
import { creditSummary, LIMITS, charge, cacheGet, cacheSet, cacheKey, assertBudget } from "./credits.js";
import { has, modalCall, modalJobCall, museImage } from "./providers.js";
import { PERSONAS, DEFAULT_PERSONA_ID, getPersona, voiceRoute, H3_NATIVE_AUDIO_LANGS } from "./personas.js";

const app = new Hono();
app.use("*", cors());

// Storage: D1 on Cloudflare, in-memory locally. Same route code both ways.
const mem = { projects: new Map(), jobs: new Map() };
const id = () => Math.random().toString(36).slice(2, 10);

async function saveProject(env, p) {
  mem.projects.set(p.id, p);
  if (env?.DB) { try {
    await env.DB.prepare(`INSERT INTO projects (id,name,description,url,category,audience,language,research,storyboard,script,status)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(id) DO UPDATE SET research=excluded.research, storyboard=excluded.storyboard, script=excluded.script, status=excluded.status`)
      .bind(p.id, p.name, p.description, p.url, p.category, p.audience, p.language,
        JSON.stringify(p.research || null), JSON.stringify(p.storyboard || null), JSON.stringify(p.script || null), p.status).run();
  } catch {} }
  return p;
}
async function getProject(env, pid) {
  if (mem.projects.has(pid)) return mem.projects.get(pid);
  if (env?.DB) { try {
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id=?1").bind(pid).first();
    if (row) { for (const k of ["research", "storyboard", "script"]) { try { row[k] = JSON.parse(row[k]); } catch {} } mem.projects.set(pid, row); return row; }
  } catch {} }
  return null;
}

// Hackathon model map (brief §2): Meta Muse does the visible, verifiable
// work — brain, keyframes, critic. H3 renders picture; local open voice
// speaks the Nigerian languages. The Studio shows these as per-stage
// badges so judges can see exactly which model did what.
export const MODEL_MAP = {
  research: "Muse Spark Open (Baseten)",
  storyboard: "Muse Spark Open (Baseten)",
  script: "Muse Spark Open (Baseten)",
  keyframe: "Muse Image 1.0 (Meta)",
  voice: "YarnGPT2 / MMS (Modal, open)",
  video: { h3: "MiniMax H3 (Modal H100)", wan: "Wan 2.2 (Modal)", ltx: "LTX (Modal)" },
  critic: "Muse Spark Open (Baseten)",
  stitch: "ffmpeg composite (Modal)",
};

app.get("/api/health", (c) => c.json({ ok: true, service: "talla-api", languages: LANGUAGES, engines: ["h3", "wan", "ltx"], models: MODEL_MAP, personas: PERSONAS.map((p) => ({ id: p.id, label: p.label, gender: p.gender })),
  providers: { baseten: has(c.env, "BASETEN_API_KEY"), meta: has(c.env, "META_API_KEY"),
    firecrawl: has(c.env, "FIRECRAWL_API_KEY"), exa: has(c.env, "EXA_API_KEY"),
    modal_tts: has(c.env, "MODAL_TTS_ENDPOINT"), modal_yarn: has(c.env, "MODAL_YARN_ENDPOINT"),
    modal_wan: has(c.env, "MODAL_WAN_ENDPOINT"), modal_h3: has(c.env, "MODAL_H3_ENDPOINT"),
    modal_stitch: has(c.env, "MODAL_STITCH_ENDPOINT") } }));

app.get("/api/credits", (c) => c.json(creditSummary()));

app.post("/api/projects", async (c) => {
  const body = await c.req.json();
  if (!body.name && !body.category && !body.url) return c.json({ error: "Give a product name, a category, or a URL." }, 400);
  const p = await saveProject(c.env, { id: id(), status: "draft", language: "pidgin", persona: DEFAULT_PERSONA_ID, ...body });
  p.persona = getPersona(p.persona).id; // normalise whatever the client sent
  return c.json(p, 201);
});

app.get("/api/projects/:pid", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  return p ? c.json(p) : c.json({ error: "Project not found" }, 404);
});

async function stage(c, name, fn, status) {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (name === "storyboard" && !p.research) return c.json({ error: "Run research first" }, 400);
  if (name === "script" && !p.storyboard) return c.json({ error: "Run storyboard first" }, 400);
  const body = name === "storyboard" ? await c.req.json().catch(() => ({})) : {};
  if (body.storyboard) p.storyboard = body.storyboard; // user edits from the studio
  try { p[name] = await fn(c.env, p); }
  catch (e) { console.error(`[${name}]`, e); return c.json({ error: `${name} failed: ${e.message}` }, 502); }
  p.status = status;
  await saveProject(c.env, p);
  return c.json(p);
}
app.post("/api/projects/:pid/research", (c) => stage(c, "research", researchAgent, "researched"));
app.post("/api/projects/:pid/storyboard", (c) => stage(c, "storyboard", storyboardAgent, "storyboarded"));
app.post("/api/projects/:pid/script", (c) => stage(c, "script", scriptAgent, "scripted"));

// Generation (H3-MAX hybrid — user decision 2026-10-29, replaces the
// SadTalker lip-sync chain which paired faces with mismatched voices):
//   storyboard scenes -> persona keyframe -> H3 (video + native audio)
//   - Nigerian English : keep H3's native dialogue (stable, best sync)
//   - Pidgin/Yoruba/Hausa/Igbo : local voice FIRST (YarnGPT2, or MMS for
//     Pidgin), its duration sizes the H3 clip, stitch swaps H3's track
//     for the local voice so the spoken words are exactly our script.
//   Persona is locked on the project: keyframe, H3 speaker description
//   and TTS voice all derive from it (worker/src/personas.js).
// Wan/LTX remain as fallback engines (silent I2V + local voice at stitch).
// Without Modal endpoints the job completes in labelled demo mode ($0).
const volumeBasename = (u) => (u ? String(u).split("/").pop() : null);

function endpoints(env) {
  return {
    tts: env.MODAL_TTS_ENDPOINT, yarn: env.MODAL_YARN_ENDPOINT,
    h3: env.MODAL_H3_ENDPOINT, h3Result: env.MODAL_H3_RESULT_ENDPOINT,
    wan: env.MODAL_WAN_ENDPOINT, wanResult: env.MODAL_WAN_RESULT_ENDPOINT,
    stitch: env.MODAL_STITCH_ENDPOINT, stitchResult: env.MODAL_STITCH_RESULT_ENDPOINT,
  };
}

async function speakLocal(env, EP, { text, language, persona }) {
  // Returns {audio_url, audio_volume_path, engine, voice, warning?}
  const route = voiceRoute(language, persona);
  if (route.source === "yarn") {
    if (!EP.yarn) throw new Error("MODAL_YARN_ENDPOINT not set (YarnGPT voice app)");
    const out = await modalCall(EP.yarn, { text, language, voice: route.voice, gender: persona.gender });
    if (out.error) throw new Error(`voice: ${out.error}`);
    return { ...out, warning: route.warning };
  }
  if (route.source === "mms") {
    if (!EP.tts) throw new Error("MODAL_TTS_ENDPOINT not set (MMS voice app)");
    const out = await modalCall(EP.tts, { text, language });
    if (out.error) throw new Error(`voice: ${out.error}`);
    return { ...out, warning: route.warning };
  }
  return null; // h3-native: no local track needed
}

// One Muse Image still for one scene (persona-locked; cached so the same
// scene prompt is never paid for twice). Shared by /keyframes and by
// /generate, which auto-creates any missing still so a live run can never
// silently bypass Muse Image (hackathon: Meta must be visibly in the flow).
async function keyframeForScene(env, p, persona, scene) {
  const prompt = `Raw candid iPhone selfie photo of ${persona.keyframe_prompt}, visible skin pores, natural imperfections, natural light. ${scene.visual}. Product: ${p.name} — ${p.description}. Shot: ${scene.shot}. NOT plastic skin, NOT airbrushed, NOT CGI, no beauty filter, vertical 9:16.`;
  const key = cacheKey("keyframe", prompt);
  let url = cacheGet(key);
  if (url) { await charge(env, "meta", "muse_image", p.id, { cached: true }); return { url, cached: true }; }
  assertBudget("meta");
  try {
    url = await museImage(env, prompt);
  } catch (e) {
    // Muse's filter occasionally rejects scene wording — retry once
    // with a sanitised generic UGC prompt (same product, safe framing).
    if (!String(e.message).includes("content_policy")) throw e;
    url = await museImage(env,
      `Raw candid iPhone selfie photo of a Nigerian creator smiling and talking to camera in a bright everyday indoor setting, holding a product package, visible skin pores, natural light, vertical 9:16. Product: ${p.name}. NOT plastic skin, NOT airbrushed, NOT CGI.`);
  }
  cacheSet(key, url);
  await charge(env, "meta", "muse_image", p.id);
  return { url, cached: false };
}

// Ensures every scene in `scenes` has a Muse Image still on the project.
// Returns { created:number[], reused:number[], error:string|null }.
// A failure never throws — /generate records it and H3 falls back to its
// anchor frame, with the gap honestly flagged on the job.
async function ensureKeyframes(env, p, persona, scenes) {
  const out = { created: [], reused: [], error: null };
  if (!has(env, "META_API_KEY")) { out.error = "META_API_KEY not set — Muse Image keyframes skipped (H3 anchor frame used)."; return out; }
  try {
    const frames = [...(p.keyframes || [])];
    for (const s of scenes) {
      if (frames.some((f) => f.scene === s.n)) { out.reused.push(s.n); continue; }
      const { url } = await keyframeForScene(env, p, persona, s);
      frames.push({ scene: s.n, keyframe_url: url });
      out.created.push(s.n);
    }
    p.keyframes = frames;
    await saveProject(env, p);
  } catch (e) { out.error = `Muse Image keyframes failed (${e.message}) — H3 anchor frame used for affected scenes.`; }
  return out;
}

app.post("/api/projects/:pid/generate", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const engine = body.engine || "h3"; // h3 max; wan | ltx fallbacks
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  p.persona = persona.id;
  const env = c.env;
  const EP = endpoints(env);
  const live = engine === "h3" ? Boolean(EP.h3) : Boolean(EP.wan);
  const nativeAudio = H3_NATIVE_AUDIO_LANGS.has((p.language || "").toLowerCase());
  const job = { id: id(), project_id: p.id, stage: "generate", engine, persona: persona.id,
    models: { research: MODEL_MAP.research, storyboard: MODEL_MAP.storyboard, script: MODEL_MAP.script,
      keyframe: MODEL_MAP.keyframe, voice: nativeAudio && engine === "h3" ? "MiniMax H3 native dialogue" : MODEL_MAP.voice,
      video: MODEL_MAP.video[engine] || MODEL_MAP.video.h3, critic: MODEL_MAP.critic, stitch: MODEL_MAP.stitch },
    audio_plan: nativeAudio && engine === "h3" ? "h3-native" : "local-voice",
    status: "running", progress: 10, scenes: [] };
  mem.jobs.set(job.id, job);

  const allScenes = p.storyboard?.scenes || [];
  const scenes = body.limit ? allScenes.slice(0, body.limit) : allScenes;
  const clipPaths = [], audioPaths = [];
  try {
    // 0) Muse Image keyframes first: every live run must show Meta in the
    //    flow, so missing stills are created here even if the user never
    //    pressed "Generate keyframes" in the Studio.
    job.models.keyframe_status = live ? await ensureKeyframes(env, p, persona, scenes) : { created: [], reused: [], error: null };
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const line = p.script?.lines?.[i] || { text: scene.key_line, seconds: scene.seconds };
      let clipUrl = null, mode = live ? "live" : "demo", audioUrl = null, voiceInfo = null;

      // 1) Local voice FIRST for NG languages (never for h3-native English):
      //    its real duration sizes the video clip, and stitch will swap it in.
      //    A missing voice endpoint degrades to "voice pending" (H3 track is
      //    kept) — it must never kill an otherwise-working video job.
      let localAudio = null;
      if (live && !(engine === "h3" && nativeAudio)) {
        try {
          localAudio = await speakLocal(env, EP, { text: line.text, language: p.language, persona });
        } catch (e) {
          voiceInfo = { engine: "voice-pending", voice: null, warning: `Local voice unavailable (${e.message}) — H3 track kept for this scene.` };
        }
        if (localAudio) {
          await charge(env, "modal", "tts_scene", p.id);
          audioUrl = localAudio.audio_url; voiceInfo = localAudio;
        }
      }

      // 2) Video clip per storyboard scene.
      if (live) {
        const frame = (p.keyframes || []).find((f) => f.scene === scene.n);
        const b64 = frame ? String(frame.keyframe_url).split(",").pop() : undefined;
        const seconds = Math.min(Math.max(Number(line.seconds) || 6, 5), 15);
        const out = engine === "h3"
          ? await modalJobCall(EP.h3, EP.h3Result, {
              scene, script: { text: line.text, seconds }, keyframe_b64: b64,
              persona: { h3_description: persona.h3_description },
              project: { name: p.name, language: p.language } })
          : await modalJobCall(EP.wan, EP.wanResult, { engine, keyframe_b64: b64,
              prompt: `${persona.h3_description}. ${scene.visual}. Talking naturally to camera, natural mouth movement while speaking.`,
              project: { name: p.name, language: p.language } });
        await charge(env, "modal", engine === "h3" ? "h3_clip" : engine === "wan" ? "wan_clip" : "ltx_clip", p.id);
        if (out.error) throw new Error(`${engine} scene ${scene.n}: ${out.error}`);
        clipUrl = out.clip_url;
        clipPaths.push(out.clip_volume_path || volumeBasename(clipUrl));
        audioPaths.push(localAudio?.audio_volume_path || null);
      }

      // 3) Critic gate (advisory until frame-aware critic lands — verdicts
      //    are shown per scene; generation is not silently blocked).
      let verdict = null;
      for (let attempt = 1; attempt <= LIMITS.criticRetriesPerScene; attempt++) {
        verdict = await criticAgent(env, p, scene, attempt);
        if (verdict.verdict === "pass") break;
      }
      job.scenes.push({ scene: scene.n, engine, mode, clip_url: clipUrl, audio_url: audioUrl,
        voice: voiceInfo ? { engine: voiceInfo.engine, voice: voiceInfo.voice, warning: voiceInfo.warning || null } : { engine: "h3-native" },
        critic: verdict });
      job.progress = 10 + Math.round(((i + 1) / Math.max(scenes.length, 1)) * 80);
    }
    if (live && clipPaths.length && EP.stitch) {
      const stitched = await modalJobCall(EP.stitch, EP.stitchResult, {
        clip_volume_paths: clipPaths,
        audio_volume_paths: audioPaths,
        lines: scenes.map((s, i) => p.script?.lines?.[i] || { text: s.key_line, seconds: s.seconds }),
        project_id: p.id,
      });
      await charge(env, "modal", "stitch", p.id);
      job.final_video_url = stitched.final_video_url || null;
      job.final_volume_path = stitched.final_volume_path || null;
    }
    job.status = "complete"; job.progress = 100;
    job.note = live
      ? (engine === "h3" && nativeAudio
          ? "H3 generated picture + native voice. Media lives in the talla-outputs volume until R2 keys are set, then URLs become public."
          : "H3 picture + local Nigerian voice swapped in at stitch. Media lives in the talla-outputs volume until R2 keys are set.")
      : "Demo mode: Modal endpoints not configured for this engine. No credits were spent.";
  } catch (e) {
    job.status = "error"; job.error = e.message;
    job.note = "Generation stopped — see error. Completed scenes are kept above.";
  }
  p.status = job.status === "complete" ? "generated" : p.status;
  await saveProject(env, p);
  return c.json(job, 201);
});

// Voice preview: hear the persona's local voice on one line BEFORE filming,
// so a face/voice mismatch is caught in the Studio, not in the final video.
app.post("/api/projects/:pid/voice-preview", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  const text = body.text || p.script?.lines?.[0]?.text || p.storyboard?.scenes?.[0]?.key_line
    || "Na this one finally solve am, no wahala again.";
  const EP = endpoints(c.env);
  const route = voiceRoute(p.language, persona);
  if (route.source === "h3") {
    // English: preview the local twin of the H3 voice persona.
    if (!EP.yarn) return c.json({ error: "MODAL_YARN_ENDPOINT not set" }, 400);
    const out = await modalCall(EP.yarn, { text, language: p.language, voice: route.voice, gender: persona.gender });
    if (out.error) return c.json({ error: out.error }, 502);
    await charge(c.env, "modal", "tts_scene", p.id);
    return c.json({ ...out, persona: persona.id, plan: "h3-native (preview uses YarnGPT twin voice)" });
  }
  try {
    const out = await speakLocal(c.env, EP, { text, language: p.language, persona });
    await charge(c.env, "modal", "tts_scene", p.id);
    return c.json({ ...out, persona: persona.id, plan: route.source });
  } catch (e) { return c.json({ error: e.message }, 502); }
});

// Keyframes: one Muse Image still per storyboard scene (brief §6).
// Cached — regenerating the same scene prompt costs $0. This endpoint lets
// the user preview stills before filming; /generate also calls
// ensureKeyframes itself, so previewing is optional, never required.
app.post("/api/projects/:pid/keyframes", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.storyboard) return c.json({ error: "Run storyboard first" }, 400);
  if (!has(c.env, "META_API_KEY")) return c.json({ error: "META_API_KEY not set" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  p.persona = persona.id;
  const wanted = body.scene ? p.storyboard.scenes.filter((s) => s.n === body.scene) : p.storyboard.scenes;
  const status = await ensureKeyframes(c.env, p, persona, wanted);
  if (status.error) return c.json({ error: status.error }, 502);
  return c.json({ project_id: p.id, keyframes: p.keyframes });
});

app.get("/api/jobs/:jid", (c) => {
  const job = mem.jobs.get(c.req.param("jid"));
  return job ? c.json(job) : c.json({ error: "Job not found" }, 404);
});

export default app;
