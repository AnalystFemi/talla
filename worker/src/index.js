import { Hono } from "hono";
import { cors } from "hono/cors";
import { researchAgent, storyboardAgent, scriptAgent, criticAgent, LANGUAGES } from "./agents.js";
import { creditSummary, LIMITS, charge, cacheGet, cacheSet, cacheKey, assertBudget } from "./credits.js";
import { has, modalCall, museImage } from "./providers.js";

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
    modal_tts: has(c.env, "MODAL_TTS_ENDPOINT"), modal_video: has(c.env, "MODAL_VIDEO_ENDPOINT") } }));

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

// Generation: creates a job, runs the critic-gated plan. Media itself runs on
// Modal (cloud GPU). Without Modal endpoints the job completes in demo mode
// with the full scene plan + critic verdicts so the flow is judge-visible.
app.post("/api/projects/:pid/generate", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const engine = body.engine || "h3"; // h3 primary; liveportrait | wan | ltx secondary
  const job = { id: id(), project_id: p.id, stage: "generate", engine, status: "running", progress: 10, scenes: [] };
  mem.jobs.set(job.id, job);

  const scenes = p.storyboard?.scenes || [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    let verdict = null;
    for (let attempt = 1; attempt <= LIMITS.criticRetriesPerScene; attempt++) {
      verdict = await criticAgent(c.env, p, scene, attempt);
      if (verdict.verdict === "pass") break;
    }
    let clipUrl = null, mode = "demo";
    if (has(c.env, "MODAL_VIDEO_ENDPOINT")) {
      const out = await modalCall(c.env.MODAL_VIDEO_ENDPOINT, { engine, scene, script: p.script?.lines?.[i], project: { name: p.name, language: p.language } });
      clipUrl = out.clip_url; mode = "live";
    }
    job.scenes.push({ scene: scene.n, engine, mode, clip_url: clipUrl, critic: verdict });
    job.progress = 10 + Math.round(((i + 1) / Math.max(scenes.length, 1)) * 80);
  }
  job.status = "complete"; job.progress = 100;
  job.final_video_url = null; // set by Modal stitch endpoint in live mode
  job.note = has(c.env, "MODAL_VIDEO_ENDPOINT")
    ? "Clips generated on Modal. Stitch via MODAL_STITCH_ENDPOINT for the final 25-40s video."
    : "Demo mode: connect MODAL_VIDEO_ENDPOINT (H3 primary) to render real clips. No credits were spent.";
  p.status = "generated"; await saveProject(c.env, p);
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
        url = await museImage(c.env, prompt);
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
