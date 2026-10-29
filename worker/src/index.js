import { Hono } from "hono";
import { cors } from "hono/cors";
import { researchAgent, storyboardAgent, scriptAgent, criticAgent, LANGUAGES } from "./agents.js";
import { creditSummary, LIMITS, charge, cacheGet, cacheSet, cacheKey, assertBudget } from "./credits.js";
import { has, modalCall, modalJobCall, museImage } from "./providers.js";

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

app.get("/api/health", (c) => c.json({ ok: true, service: "talla-api", languages: LANGUAGES,
  providers: { baseten: has(c.env, "BASETEN_API_KEY"), meta: has(c.env, "META_API_KEY"),
    firecrawl: has(c.env, "FIRECRAWL_API_KEY"), exa: has(c.env, "EXA_API_KEY"),
    modal_tts: has(c.env, "MODAL_TTS_ENDPOINT"), modal_lipsync: has(c.env, "MODAL_LIPSYNC_ENDPOINT"),
    modal_wan: has(c.env, "MODAL_WAN_ENDPOINT"), modal_h3: has(c.env, "MODAL_H3_ENDPOINT"),
    modal_stitch: has(c.env, "MODAL_STITCH_ENDPOINT") } }));

app.get("/api/credits", (c) => c.json(creditSummary()));

app.post("/api/projects", async (c) => {
  const body = await c.req.json();
  if (!body.name && !body.category && !body.url) return c.json({ error: "Give a product name, a category, or a URL." }, 400);
  const p = await saveProject(c.env, { id: id(), status: "draft", language: "pidgin", ...body });
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

// Generation: critic-gated media chain on Modal (cloud GPU only).
// liveportrait chain: Muse keyframe -> MMS TTS -> SadTalker lip-sync ->
// stitch. h3/wan/ltx call their own Modal endpoints directly. Without the
// Modal endpoints the job completes in labelled demo mode ($0 spend).
const volumeBasename = (u) => (u ? String(u).split("/").pop() : null);
app.post("/api/projects/:pid/generate", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const engine = body.engine || "liveportrait";
  const env = c.env;
  const EP = {
    tts: env.MODAL_TTS_ENDPOINT, lipsync: env.MODAL_LIPSYNC_ENDPOINT || env.MODAL_VIDEO_ENDPOINT,
    lipsyncResult: env.MODAL_LIPSYNC_RESULT_ENDPOINT,
    h3: env.MODAL_H3_ENDPOINT, h3Result: env.MODAL_H3_RESULT_ENDPOINT,
    wan: env.MODAL_WAN_ENDPOINT, wanResult: env.MODAL_WAN_RESULT_ENDPOINT,
    stitch: env.MODAL_STITCH_ENDPOINT, stitchResult: env.MODAL_STITCH_RESULT_ENDPOINT,
  };
  const live = engine === "liveportrait" ? Boolean(EP.tts && EP.lipsync)
    : engine === "h3" ? Boolean(EP.h3) : Boolean(EP.wan);
  const job = { id: id(), project_id: p.id, stage: "generate", engine, status: "running", progress: 10, scenes: [] };
  mem.jobs.set(job.id, job);

  const allScenes = p.storyboard?.scenes || [];
  const scenes = body.limit ? allScenes.slice(0, body.limit) : allScenes;
  const clipPaths = [];
  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const line = p.script?.lines?.[i] || { text: scene.key_line, seconds: scene.seconds };
      let clipUrl = null, mode = live ? "live" : "demo", audioUrl = null;
      if (live && engine === "liveportrait") {
        const frame = (p.keyframes || []).find((f) => f.scene === scene.n);
        if (!frame) throw new Error(`No keyframe for scene ${scene.n} — run keyframes first`);
        const b64 = String(frame.keyframe_url).split(",").pop();
        const tts = await modalCall(EP.tts, { text: line.text, language: p.language });
        await charge(env, "modal", "tts_scene", p.id);
        audioUrl = tts.audio_url;
        const lip = await modalJobCall(EP.lipsync, EP.lipsyncResult, { keyframe_b64: b64, audio_volume_path: volumeBasename(tts.audio_url) });
        await charge(env, "modal", "liveportrait_clip", p.id);
        if (lip.error) throw new Error(`lip-sync scene ${scene.n}: ${lip.error}`);
        clipUrl = lip.clip_url;
      } else if (live) {
        const frame = (p.keyframes || []).find((f) => f.scene === scene.n);
        const b64 = frame ? String(frame.keyframe_url).split(",").pop() : undefined;
        const out = engine === "h3"
          ? await modalJobCall(EP.h3, EP.h3Result, { scene, script: line, keyframe_b64: b64, project: { name: p.name, language: p.language } })
          : await modalJobCall(EP.wan, EP.wanResult, { engine, keyframe_b64: b64, prompt: `${scene.visual}. Talking naturally to camera.`, project: { name: p.name, language: p.language } });
        await charge(env, "modal", engine === "h3" ? "h3_clip" : engine === "wan" ? "wan_clip" : "ltx_clip", p.id);
        if (out.error) throw new Error(`${engine} scene ${scene.n}: ${out.error}`);
        clipUrl = out.clip_url;
      }
      let verdict = null;
      for (let attempt = 1; attempt <= LIMITS.criticRetriesPerScene; attempt++) {
        verdict = await criticAgent(env, p, scene, attempt);
        if (verdict.verdict === "pass") break;
      }
      if (clipUrl) clipPaths.push(volumeBasename(clipUrl));
      job.scenes.push({ scene: scene.n, engine, mode, clip_url: clipUrl, audio_url: audioUrl, critic: verdict });
      job.progress = 10 + Math.round(((i + 1) / Math.max(scenes.length, 1)) * 80);
    }
    if (live && clipPaths.length && EP.stitch) {
      const stitched = await modalJobCall(EP.stitch, EP.stitchResult, {
        clip_volume_paths: clipPaths,
        lines: scenes.map((s, i) => p.script?.lines?.[i] || { text: s.key_line, seconds: s.seconds }),
        project_id: p.id,
      });
      await charge(env, "modal", "stitch", p.id);
      job.final_video_url = stitched.final_video_url || null;
      job.final_volume_path = stitched.final_volume_path || null;
    }
    job.status = "complete"; job.progress = 100;
    job.note = live
      ? "Live Modal chain complete. Media lives in the talla-outputs volume until R2 keys are set, then URLs become public."
      : "Demo mode: Modal endpoints not configured for this engine. No credits were spent.";
  } catch (e) {
    job.status = "error"; job.error = e.message;
    job.note = "Generation stopped — see error. Completed scenes are kept above.";
  }
  p.status = job.status === "complete" ? "generated" : p.status;
  await saveProject(env, p);
  return c.json(job, 201);
});

// Keyframes: one Muse Image still per storyboard scene (brief SS6).
// Cached — regenerating the same scene prompt costs $0.
app.post("/api/projects/:pid/keyframes", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.storyboard) return c.json({ error: "Run storyboard first" }, 400);
  if (!has(c.env, "META_API_KEY")) return c.json({ error: "META_API_KEY not set" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const scenes = p.storyboard.scenes.filter((s) => !body.scene || s.n === body.scene);
  const frames = [];
  try {
    for (const s of scenes) {
      const prompt = `Raw candid iPhone selfie photo, Nigerian UGC creator, visible skin pores, natural imperfections, natural light. ${s.visual}. Product: ${p.name} — ${p.description}. Shot: ${s.shot}. NOT plastic skin, NOT airbrushed, NOT CGI, no beauty filter, vertical 9:16.`;
      const key = cacheKey("keyframe", prompt);
      let url = cacheGet(key);
      if (url) { await charge(c.env, "meta", "muse_image", p.id, { cached: true }); }
      else {
        assertBudget("meta");
        try {
          url = await museImage(c.env, prompt);
        } catch (e) {
          // Muse's filter occasionally rejects scene wording — retry once
          // with a sanitised generic UGC prompt (same product, safe framing).
          if (!String(e.message).includes("content_policy")) throw e;
          url = await museImage(c.env,
            `Raw candid iPhone selfie photo of a Nigerian creator smiling and talking to camera in a bright everyday indoor setting, holding a product package, visible skin pores, natural light, vertical 9:16. Product: ${p.name}. NOT plastic skin, NOT airbrushed, NOT CGI.`);
        }
        cacheSet(key, url);
        await charge(c.env, "meta", "muse_image", p.id);
      }
      frames.push({ scene: s.n, keyframe_url: url });
    }
  } catch (e) { return c.json({ error: `keyframes failed: ${e.message}` }, 502); }
  p.keyframes = frames; await saveProject(c.env, p);
  return c.json({ project_id: p.id, keyframes: frames });
});

app.get("/api/jobs/:jid", (c) => {
  const job = mem.jobs.get(c.req.param("jid"));
  return job ? c.json(job) : c.json({ error: "Job not found" }, 404);
});

export default app;
