import { Hono } from "hono";
import { cors } from "hono/cors";
import { researchAgent, storyboardAgent, scriptAgent, criticAgent, exportAgent, LANGUAGES, SCRIPT_FORMATS, CRITIC_LABEL } from "./agents.js";
import { creditSummary, charge, cacheGet, cacheSet, cacheKey, contentHash, assertBudget, assertBudgetUsd, estimateCost, refreshTotals } from "./credits.js";
import { has, modalCall, modalPollOnce, modalCancel, modalFile, museImage, museTranscribe, samSegment, bytesToBase64, base64ToBytes, VOICE_TIMEOUT_MS } from "./providers.js";
import { PERSONAS, DEFAULT_PERSONA_ID, getPersona, voiceRoute } from "./personas.js";

const app = new Hono();

// ------------------------------------------------------------- access ---
// Contract §1. Public demo: anyone can browse/research/storyboard, but every
// PAID call needs the access code. Rather than sprinkling key checks over
// every route, an unauthorised request simply gets a "demo env" — a copy of
// the bindings with every paid key/endpoint removed — so all routes fall
// into their existing, clearly labelled demo paths ($0) by construction.
const PAID_ENV_KEYS = ["BASETEN_API_KEY", "META_API_KEY", "FIRECRAWL_API_KEY", "EXA_API_KEY"];

function safeEqual(a, b) {
  // Constant-time over the longer input: no early exit on first mismatch.
  const enc = new TextEncoder();
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] | 0) ^ (y[i] | 0);
  return diff === 0;
}

export function isAuthorized(env, header) {
  if (env?.TALLA_DEV_OPEN === "1") return true; // local dev only — never set on the deployed Worker
  const code = env?.TALLA_ACCESS_CODE;
  if (!code || !header) return false; // no code configured -> nobody is authorised
  return safeEqual(header, code);
}

function demoEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (PAID_ENV_KEYS.includes(k) || k.startsWith("MODAL_")) continue;
    out[k] = v; // DB / MEDIA / plain vars stay, so demo work still persists
  }
  return out;
}

const DEV_ORIGINS = ["http://localhost:5173"];
const allowedOrigins = (env) => [...DEV_ORIGINS,
  ...String(env?.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)];

app.use("*", cors({
  origin: (origin, c) => (allowedOrigins(c.env).includes(origin) ? origin : null),
  allowHeaders: ["Content-Type", "X-Talla-Access", "Range"],
  allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  exposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges"],
  maxAge: 600,
}));

app.use("/api/*", async (c, next) => {
  const raw = c.env || {};
  const authorized = isAuthorized(raw, c.req.header("X-Talla-Access"));
  c.set("raw_env", raw);
  c.set("authorized", authorized);
  c.env = authorized ? raw : demoEnv(raw);
  // Budget totals come from D1 per request (contract §6) — skip for media
  // reads, which never spend.
  if (!c.req.path.startsWith("/api/media/")) await refreshTotals(raw);
  await next();
});

const accessRequired = (c) => c.json({ error: "access_required", note: "This action spends paid credits and needs the access code (X-Talla-Access)." }, 401);

// Body parsing: invalid JSON is a 400, never a silent {} that then runs a
// paid stage with defaults. Empty body = {} (routes with optional bodies).
const BAD_JSON = Symbol("bad_json");
async function readJson(c, maxBytes = 256 * 1024) {
  const text = await c.req.text().catch(() => "");
  if (text.length > maxBytes) return BAD_JSON;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : BAD_JSON;
  } catch { return BAD_JSON; }
}
const badJson = (c) => c.json({ error: "invalid_json", note: "Body must be a JSON object." }, 400);

// Map an error to a client response without echoing provider bodies
// (providers.js only puts status codes in messages; bodies are logged).
function failure(c, name, e) {
  const msg = String(e?.message || e || "unknown error");
  if (msg.startsWith("BUDGET_EXHAUSTED")) return c.json({ error: msg, note: "Refused by the credit guard before any paid call." }, 402);
  console.error(`[${name}]`, e);
  return c.json({ error: `${name} failed: ${msg.slice(0, 160)}` }, 502);
}

// ------------------------------------------------------------ storage ---
// Storage: D1 on Cloudflare, in-memory locally. Same route code both ways.
// With D1 bound, D1 is the source of truth (several isolates may serve one
// client's polls), mem is only a fallback/cache.
const mem = { projects: new Map(), jobs: new Map(), locks: new Map() };
const JSON_COLS = ["research", "storyboard", "script", "keyframes", "segmentation"];

async function saveProject(env, p) {
  mem.projects.set(p.id, p);
  if (env?.DB) { try {
    // persona/keyframes/segmentation/format persist too, so a Workers cold
    // start never re-bills Muse Image or reverts the locked creator (audit #17).
    // keyframes hold only {scene, keyframe_key, source, image_hash} when R2
    // is bound (row-size safe); data URLs only in local/no-R2 setups.
    await env.DB.prepare(`INSERT INTO projects (id,name,description,url,category,audience,language,research,storyboard,script,status,persona,keyframes,segmentation,format)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15) ON CONFLICT(id) DO UPDATE SET research=excluded.research, storyboard=excluded.storyboard, script=excluded.script, status=excluded.status, persona=excluded.persona, keyframes=excluded.keyframes, segmentation=excluded.segmentation, format=excluded.format`)
      .bind(p.id, p.name ?? null, p.description ?? null, p.url ?? null, p.category ?? null, p.audience ?? null, p.language,
        JSON.stringify(p.research || null), JSON.stringify(p.storyboard || null), JSON.stringify(p.script || null), p.status,
        p.persona || null, JSON.stringify(p.keyframes || null), JSON.stringify(p.segmentation || null), p.format || null).run();
  } catch (e) { console.error("[d1] saveProject failed:", e?.message || e); } }
  return p;
}
async function getProject(env, pid) {
  if (env?.DB) { try {
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id=?1").bind(pid).first();
    if (row) {
      for (const k of JSON_COLS) { try { row[k] = JSON.parse(row[k]); } catch { row[k] = null; } }
      mem.projects.set(pid, row); return row;
    }
  } catch (e) { console.error("[d1] getProject failed:", e?.message || e); } }
  return mem.projects.get(pid) || null;
}

// Project JSON for clients: R2 keyframes are exposed as Worker URLs, raw
// keys/data stay internal.
function publicProject(p) {
  if (!p) return p;
  return { ...p, keyframes: Array.isArray(p.keyframes) ? p.keyframes.map((f) => ({
    scene: f.scene, source: f.source || "muse-image", image_hash: f.image_hash || null,
    keyframe_url: f.keyframe_key ? `/api/media/r2/${f.keyframe_key}` : (f.keyframe_url || null),
  })) : p.keyframes };
}

async function saveJob(env, job, { create = false } = {}) {
  job.updated_at = new Date().toISOString();
  mem.jobs.set(job.id, job);
  if (!env?.DB) return true;
  try {
    await env.DB.prepare(`INSERT INTO jobs (id, project_id, stage, engine, status, progress, output_url, error, data, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET status=excluded.status, progress=excluded.progress,
      output_url=excluded.output_url, error=excluded.error, data=excluded.data, updated_at=excluded.updated_at`)
      .bind(job.id, job.project_id, job.stage, job.engine, job.status, job.progress, job.final_media_url || null,
        job.error || null, JSON.stringify(job), job.updated_at).run();
    return true;
  } catch (e) {
    console.error("[d1] saveJob failed:", e?.message || e);
    if (create) throw e; // the one-running-job unique index surfaces here
    return false;
  }
}
async function getJob(env, jid) {
  if (env?.DB) { try {
    const row = await env.DB.prepare("SELECT data FROM jobs WHERE id=?1").bind(jid).first();
    if (row?.data) { const job = JSON.parse(row.data); mem.jobs.set(jid, job); return job; }
  } catch (e) { console.error("[d1] getJob failed:", e?.message || e); } }
  return mem.jobs.get(jid) || null;
}
async function findRunningJob(env, pid) {
  if (env?.DB) { try {
    const row = await env.DB.prepare("SELECT id FROM jobs WHERE project_id=?1 AND stage='generate' AND status='running' ORDER BY created_at DESC LIMIT 1").bind(pid).first();
    return row?.id || null; // D1 is authoritative: a stale "running" copy in this isolate's mem must not 409
  } catch (e) { console.error("[d1] findRunningJob failed:", e?.message || e); } }
  for (const j of mem.jobs.values()) if (j.project_id === pid && j.stage === "generate" && j.status === "running") return j.id;
  return null;
}
async function latestJob(env, pid) {
  if (env?.DB) { try {
    const row = await env.DB.prepare("SELECT data FROM jobs WHERE project_id=?1 ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(pid).first();
    if (row?.data) return JSON.parse(row.data);
  } catch (e) { console.error("[d1] latestJob failed:", e?.message || e); } }
  return [...mem.jobs.values()].filter((j) => j.project_id === pid).pop() || null;
}

// Job lock (contract §3): at most one step runs per job at a time, across
// isolates, so concurrent client polls can never double-spawn a paid GPU
// call. The lock outlives the longest single step (voice 180 s + slack).
const JOB_LOCK_MS = 5 * 60 * 1000;
async function acquireLock(env, jid) {
  const now = Date.now();
  if (env?.DB) {
    try {
      const r = await env.DB.prepare("UPDATE jobs SET lock_until=?1 WHERE id=?2 AND (lock_until IS NULL OR lock_until < ?3)")
        .bind(now + JOB_LOCK_MS, jid, now).run();
      return (r?.meta?.changes ?? 0) === 1;
    } catch (e) { console.error("[d1] acquireLock failed:", e?.message || e); return false; } // fail closed: no step
  }
  if ((mem.locks.get(jid) || 0) > now) return false;
  mem.locks.set(jid, now + JOB_LOCK_MS);
  return true;
}
async function releaseLock(env, jid) {
  mem.locks.delete(jid);
  if (env?.DB) { try { await env.DB.prepare("UPDATE jobs SET lock_until=0 WHERE id=?1").bind(jid).run(); }
    catch (e) { console.error("[d1] releaseLock failed:", e?.message || e); } }
}

function publicJob(job) {
  if (!job) return job;
  const { state, ...rest } = job; // step-machine cursor + internal paths stay server-side
  return rest;
}

// --------------------------------------------------------------- media ---
// Contract §5. Worker-relative URLs so <video src> works with the API base.
const MEDIA_NAME = /^[A-Za-z0-9._-]+\.(mp4|wav|mp3|webp|png|jpg)$/;
const mediaUrl = (name) => (name && MEDIA_NAME.test(name) ? `/api/media/file/${name}` : null);
const volumeBasename = (u) => (u ? String(u).split("/").pop() : null);
const R2_KEY = /^keyframes\/[A-Za-z0-9-]+\/\d+-[A-Za-z0-9-]+\.webp$/;

// Store one keyframe still. With R2 bound the bytes live in R2 and D1 keeps
// only the key (a 1-2 MB data URL per scene would blow the D1 row limit).
async function storeKeyframe(env, p, sceneN, dataUrl, source) {
  const image_hash = contentHash(dataUrl);
  const frame = { scene: sceneN, source, image_hash };
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (env?.MEDIA && m) {
    const key = `keyframes/${p.id}/${sceneN}-${image_hash}.webp`;
    await env.MEDIA.put(key, base64ToBytes(m[2]), { httpMetadata: { contentType: m[1] } });
    frame.keyframe_key = key;
  } else frame.keyframe_url = dataUrl; // local dev: inline data URL (or a remote URL Muse returned)
  p.keyframes = [...(p.keyframes || []).filter((f) => f.scene !== sceneN), frame];
  return frame;
}

// Resolve any stored frame to a data URL (SAM input, Wan keyframe_b64).
// WP-H CPU note: base64 of a ~1-2 MB keyframe is a few ms of string work —
// far under the 10 ms free-plan budget per step. R2 reads are I/O (not CPU),
// and keyframes resolve once per scene (cached in the project afterwards),
// so nothing here needs moving to Modal or a paid Workers plan.
async function frameDataUrl(env, f) {
  if (!f) return null;
  if (f.keyframe_key) {
    if (!env?.MEDIA) return null;
    const obj = await env.MEDIA.get(f.keyframe_key);
    if (!obj) return null;
    const type = obj.httpMetadata?.contentType || "image/webp";
    return `data:${type};base64,${bytesToBase64(new Uint8Array(await obj.arrayBuffer()))}`;
  }
  const u = String(f.keyframe_url || "");
  if (u.startsWith("data:image")) return u;
  if (/^https?:/.test(u)) {
    const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    return `data:${res.headers.get("content-type") || "image/webp"};base64,${bytesToBase64(new Uint8Array(await res.arrayBuffer()))}`;
  }
  return null;
}
const frameFor = (p, n) => (p.keyframes || []).find((f) => f.scene === n && (f.keyframe_key || f.keyframe_url));

app.get("/api/media/file/:name", async (c) => {
  // Public read (names are collision-safe <prefix>_<unix>_<8hex>), but the
  // Modal file endpoint itself is token-gated, so use the RAW env here.
  const name = c.req.param("name");
  if (!MEDIA_NAME.test(name)) return c.json({ error: "bad_name" }, 400);
  const env = c.get("raw_env");
  if (!env?.MODAL_FILE_ENDPOINT) return c.json({ error: "media_unavailable", note: "MODAL_FILE_ENDPOINT not configured." }, 404);
  let res;
  try { res = await modalFile(env, name, { range: c.req.header("Range") }); }
  catch (e) { console.error("[media] file fetch failed:", e?.message || e); return c.json({ error: "media_unreachable" }, 502); }
  if (!res || (!res.ok && res.status !== 206)) {
    if (res) console.error(`[media] file endpoint HTTP ${res.status} for ${name}`);
    return c.json({ error: res?.status === 404 ? "not_found" : "media_error" }, res?.status === 404 ? 404 : 502);
  }
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = res.headers.get(h); if (v) headers.set(h, v);
  }
  headers.set("cache-control", "public, max-age=3600");
  return new Response(res.body, { status: res.status, headers });
});

app.get("/api/media/r2/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/api/media/r2/".length));
  if (!R2_KEY.test(key)) return c.json({ error: "bad_key" }, 400);
  const env = c.get("raw_env");
  if (!env?.MEDIA) return c.json({ error: "media_unavailable" }, 404);
  const obj = await env.MEDIA.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/webp",
    "cache-control": "public, max-age=86400, immutable" } }); // key embeds the content hash
});

// ------------------------------------------------------------- models ---
// Hackathon model map (brief §2), VERIFIED live 2026-10-29 against
// api.meta.ai/v1/models: muse-spark-1.3, muse-wonder-1.0, muse-image-1.0,
// muse-voice-transcribe-1.0 all exist. Operating plan:
//   Muse Spark Open (Baseten)  — the brain: research/storyboard/script/critic/export
//   Muse Image 1.0 (Meta API)   — persona keyframes, AUTOMATIC inside /generate
//   Muse Voice Transcribe (Meta)— VERIFY stage: transcribes the finished
//                                 audio and compares it with the script
// Video (Wan 2.2 / LTX silent motion) and Nigerian voices (YarnGPT2/MMS)
// are NOT Meta — they are the media engines Muse directs. Never claim
// otherwise. MiniMax H3 is PARKED (2026-10-29: both H100 and H200 runs
// failed the cost/speed bar) and is not submitted by any route until a
// verdict test passes. SAM 3.1 (Meta) is segmentation, NOT a video
// generator. Its role here is objective QC: person/phone presence in the
// keyframe before any paid render + mask source for later compositing.
export const MODEL_MAP = {
  research: "Muse Spark Open (Baseten)",
  storyboard: "Muse Spark Open (Baseten)",
  script: "Muse Spark Open (Baseten)",
  keyframe: "Muse Image 1.0 (Meta)",
  voice: "YarnGPT2 / MMS (Modal, open)",
  video: { h3: "MiniMax H3 (Modal H200, ON HOLD)", wan: "Wan 2.2 (Modal, primary)", ltx: "LTX 2.5 (Modal, fallback)" },
  critic: `Muse Spark Open (Baseten) — ${CRITIC_LABEL}`,
  stitch: "ffmpeg composite (Modal)",
  export: "Muse Spark Open (Baseten)",
  verify: "Muse Voice Transcribe 1.0 (Meta, verify stage)",
  segment: "SAM 3.1 (Meta, keyframe QC)",
};
const ENGINE_LABEL = { wan: "Wan 2.2", ltx: "LTX 2.5", talk: "InfiniteTalk" };
// Engine duration caps (owner decision 2026-10-30): Wan 720x1280 @16 fps,
// 81 frames max (~5.06 s) -> 5.0 s; LTX 8n+1 frames @24 fps, cap 257 -> 10.6 s;
// InfiniteTalk renders 25 fps up to 1000 frames (40 s) — the clip length is
// the VOICE length, so its cap is the upstream ceiling, not a freeze guard.
const ENGINE_CAP_S = { wan: 5.0, ltx: 10.6, talk: 40.0 };

function liveMode(env) {
  return has(env, "BASETEN_API_KEY") || has(env, "META_API_KEY") || has(env, "MODAL_WAN_ENDPOINT");
}

app.get("/api/health", (c) => {
  const authorized = Boolean(c.get("authorized"));
  return c.json({ ok: true, service: "talla-api", languages: LANGUAGES, engines: ["wan", "ltx", "talk"], h3_status: "parked", models: MODEL_MAP,
    personas: PERSONAS.map((p) => ({ id: p.id, label: p.label, gender: p.gender })),
    access: { required: true, authorized },
    mode: authorized && liveMode(c.env) ? "live" : "demo",
    // Flags reflect THIS request's effective env (demo env when unauthorised).
    providers: { baseten: has(c.env, "BASETEN_API_KEY"), meta: has(c.env, "META_API_KEY"),
      firecrawl: has(c.env, "FIRECRAWL_API_KEY"), exa: has(c.env, "EXA_API_KEY"),
      modal_tts: has(c.env, "MODAL_TTS_ENDPOINT"), modal_yarn: has(c.env, "MODAL_YARN_ENDPOINT"),
      modal_wan: has(c.env, "MODAL_WAN_ENDPOINT"), modal_wan_result: has(c.env, "MODAL_WAN_RESULT_ENDPOINT"),
      modal_talk: has(c.env, "MODAL_TALK_ENDPOINT"), modal_talk_result: has(c.env, "MODAL_TALK_RESULT_ENDPOINT"),
      modal_h3: false, modal_h3_parked: true,
      modal_stitch: has(c.env, "MODAL_STITCH_ENDPOINT"), modal_stitch_result: has(c.env, "MODAL_STITCH_RESULT_ENDPOINT"),
      modal_file: has(c.env, "MODAL_FILE_ENDPOINT"), modal_token: has(c.env, "MODAL_ENDPOINT_TOKEN"),
      r2: Boolean(c.env?.MEDIA), d1: Boolean(c.env?.DB) } });
});

app.post("/api/access/check", (c) => {
  const authorized = Boolean(c.get("authorized"));
  return c.json({ authorized }, authorized ? 200 : 401);
});

app.get("/api/credits", (c) => c.json(creditSummary()));

// ----------------------------------------------------------- projects ---
const FIELD_MAX = 2000;
const str = (v, max = FIELD_MAX) => (v == null ? null : String(v).slice(0, max).trim() || null);

app.post("/api/projects", async (c) => {
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  // Whitelist: the client can no longer set id/status/research/keyframes etc.
  const name = str(body.name), description = str(body.description), category = str(body.category),
    audience = str(body.audience);
  let url = str(body.url);
  if (url) {
    try { const u = new URL(url); if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme"); url = u.toString(); }
    catch { return c.json({ error: "url must be an http(s) URL" }, 400); }
  }
  if (!name && !category && !url) return c.json({ error: "Give a product name, a category, or a URL." }, 400);
  const language = LANGUAGES.includes(String(body.language || "").toLowerCase()) ? String(body.language).toLowerCase() : "pidgin";
  const format = SCRIPT_FORMATS.includes(body.format) ? body.format : "standard";
  const p = { id: crypto.randomUUID(), status: "draft", name, description, url, category, audience, language, format,
    persona: getPersona(body.persona || DEFAULT_PERSONA_ID).id }; // normalised BEFORE save
  await saveProject(c.env, p);
  return c.json(publicProject(p), 201);
});

app.get("/api/projects/:pid", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  return p ? c.json(publicProject(p)) : c.json({ error: "Project not found" }, 404);
});

// A changed scene invalidates the still + QC for that scene only, so a
// regenerated still is re-checked by SAM instead of inheriting the old
// frame's verdict (audit #8). MUST diff against the OLD storyboard — the
// previous code assigned the new one first and so compared it to itself.
async function invalidateChangedScenes(env, p, oldBoard, newBoard) {
  const before = new Map((oldBoard?.scenes || []).map((s) => [s.n, String(s.visual || "")]));
  const after = new Map((newBoard?.scenes || []).map((s) => [s.n, String(s.visual || "")]));
  const changed = new Set();
  for (const [n, v] of after) if (before.get(n) !== v) changed.add(n);
  for (const n of before.keys()) if (!after.has(n)) changed.add(n);
  if (!changed.size) return [];
  const dropped = (p.keyframes || []).filter((f) => changed.has(f.scene));
  p.keyframes = (p.keyframes || []).filter((f) => !changed.has(f.scene));
  p.segmentation = (p.segmentation || []).filter((r) => !changed.has(r.scene));
  if (env?.MEDIA) for (const f of dropped) if (f.keyframe_key) {
    try { await env.MEDIA.delete(f.keyframe_key); } catch (e) { console.error("[r2] delete failed:", e?.message || e); }
  }
  return [...changed];
}

function sanitizeOverlay(o) {
  if (!o || typeof o !== "object") return null;
  const style = o.style === "fullscreen" ? "fullscreen" : "pip";
  return { asset: str(o.asset, 60), note: str(o.note, 200), seconds: Math.min(Math.max(Number(o.seconds) || 4, 1), 15), style };
}
function sanitizeStoryboard(sb) {
  if (!sb || typeof sb !== "object" || !Array.isArray(sb.scenes) || !sb.scenes.length || sb.scenes.length > 12) return null;
  const scenes = sb.scenes.map((s, i) => {
    const o = s && typeof s === "object" ? s : {};
    const n = Number.isInteger(Number(o.n)) && Number(o.n) > 0 ? Number(o.n) : i + 1;
    return { n, purpose: str(o.purpose, 200), shot: str(o.shot, 300), key_line: str(o.key_line), visual: str(o.visual),
      seconds: Math.min(Math.max(Number(o.seconds) || 6, 1), 15), overlay: sanitizeOverlay(o.overlay) };
  });
  if (new Set(scenes.map((s) => s.n)).size !== scenes.length) return null; // duplicate scene numbers
  return { mode: sb.mode === "live" ? "live" : sb.mode === "demo" ? "demo" : "edited", format: SCRIPT_FORMATS.includes(sb.format) ? sb.format : undefined, scenes };
}

// Save-only storyboard edit (contract §2): free, no agent call, no access
// code. /script then writes from exactly this saved board.
app.put("/api/projects/:pid/storyboard", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  const board = sanitizeStoryboard(body.storyboard);
  if (!board) return c.json({ error: "Body must be { storyboard: { scenes: [1-12 scenes with unique n] }, format? }" }, 400);
  if (SCRIPT_FORMATS.includes(body.format)) p.format = body.format;
  board.format = board.format || p.format || "standard";
  board.edited = true;
  const invalidated = await invalidateChangedScenes(c.env, p, p.storyboard, board); // OLD vs NEW, before assigning
  p.storyboard = board;
  p.status = "storyboarded";
  await saveProject(c.env, p);
  return c.json({ ...publicProject(p), invalidated_scenes: invalidated });
});

async function stage(c, name, fn, status) {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (name === "storyboard" && !p.research) return c.json({ error: "Run research first" }, 400);
  if (name === "script" && !p.storyboard) return c.json({ error: "Run storyboard first" }, 400);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  // POST /storyboard = REGENERATE via the agent. Edits go through PUT, so
  // this route no longer accepts a storyboard body that the agent would
  // then silently overwrite.
  if (name === "storyboard" && SCRIPT_FORMATS.includes(body.format)) p.format = body.format;
  const old = p[name];
  let out;
  try { out = await fn(c.env, p); }
  catch (e) { return failure(c, name, e); }
  if (name === "storyboard") await invalidateChangedScenes(c.env, p, old, out);
  p[name] = out;
  p.status = status;
  await saveProject(c.env, p);
  return c.json(publicProject(p));
}
app.post("/api/projects/:pid/research", (c) => stage(c, "research", researchAgent, "researched"));
app.post("/api/projects/:pid/storyboard", (c) => stage(c, "storyboard", storyboardAgent, "storyboarded"));
app.post("/api/projects/:pid/script", (c) => stage(c, "script", scriptAgent, "scripted"));

// --------------------------------------------------------- generation ---
// Generation (open-source-first — user decision 2026-10-29; H3 PARKED
// after H100 + H200 both failed the cost/speed bar):
//   storyboard scenes -> persona keyframe -> SAM QC -> per scene: local
//   Nigerian voice FIRST (its real duration_s sizes the clip) -> Wan 2.2 /
//   LTX silent motion -> stitch muxes voice onto picture -> verify -> export.
// Persona is locked on the project: keyframe, motion prompt and TTS voice
// all derive from it (worker/src/personas.js).
//
// STATELESS STEP MACHINE (contract §3, Workers free plan): POST /generate
// only validates + creates the job (202). Each GET /api/jobs/:jid performs
// at most ONE external call (one Muse Image, one SAM frame, one voice, one
// Modal spawn or one non-blocking result check) under a D1 lock, persists
// and returns. Free/demo steps chain within one poll, so a demo job
// completes in a poll or two. Without Modal endpoints the job completes in
// labelled demo mode ($0).
function endpoints(env) {
  // Bindings may be undefined in in-process/test contexts — degrade to demo
  // mode instead of throwing a bare TypeError on property access.
  const e = env || {};
  return {
    tts: e.MODAL_TTS_ENDPOINT, yarn: e.MODAL_YARN_ENDPOINT,
    wan: e.MODAL_WAN_ENDPOINT, wanResult: e.MODAL_WAN_RESULT_ENDPOINT,
    talk: e.MODAL_TALK_ENDPOINT, talkResult: e.MODAL_TALK_RESULT_ENDPOINT,
    stitch: e.MODAL_STITCH_ENDPOINT, stitchResult: e.MODAL_STITCH_RESULT_ENDPOINT,
  };
}

async function speakLocal(env, EP, { text, language, persona }) {
  // Returns {audio_url, audio_volume_path, duration_s, engine, voice, warning?}
  // WP-F: tone-marked Yoruba (diacritics) produced broken 1.1s audio while
  // plain spelling gave a correct 5.03s. If duration_s is far below ~0.35s
  // per word, retry once with diacritics stripped and flag it.
  const route = voiceRoute(language, persona);
  if (route.source === "yarn") {
    if (!EP.yarn) throw new Error("MODAL_YARN_ENDPOINT not set (YarnGPT voice app)");
    const words = String(text || "").split(/\s+/).filter(Boolean).length;
    const plain = stripDiacritics(text);
    const attempt = async (t) => {
      const out = await modalCall(env, EP.yarn, { text: t, language, voice: route.voice, gender: persona.gender }, { timeoutMs: VOICE_TIMEOUT_MS });
      if (out.error) throw new Error(`voice: ${String(out.error).slice(0, 200)}`);
      return out;
    };
    let out = await attempt(text);
    let warning = route.warning;
    const expected = words * 0.35;
    if (plain !== text && Number(out.duration_s) < expected * 0.5) {
      const out2 = await attempt(plain);
      if (Number(out2.duration_s) > Number(out.duration_s)) {
        out = out2;
        warning = [warning, `Yoruba diacritics broke the first take (${out.duration_s || "?"}s) — retried with plain spelling (${out2.duration_s || "?"}s).`].filter(Boolean).join(" ");
      }
    }
    return { ...out, warning };
  }
  if (!EP.tts) throw new Error("MODAL_TTS_ENDPOINT not set (MMS voice app)");
  const out = await modalCall(env, EP.tts, { text, language }, { timeoutMs: VOICE_TIMEOUT_MS });
  if (out.error) throw new Error(`voice: ${String(out.error).slice(0, 200)}`);
  return { ...out, warning: route.warning };
}

// Strip combining diacritical marks (Yoruba tone marks) for the WP-F retry.
function stripDiacritics(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// One Muse Image still for one scene (persona-locked; cached so the same
// scene prompt is never paid for twice). Shared by /keyframes and by the
// generate step machine, which auto-creates any missing still so a live run
// can never silently bypass Muse Image.
async function keyframeForScene(env, p, persona, scene) {
  const look = scene.visual || persona.look_default || persona.look_yoruba || "";
  const prompt = `Raw candid iPhone selfie photo of ${persona.keyframe_prompt}, visible skin pores, natural imperfections, natural light. ${look}. Product: ${p.name} — ${p.description}. Shot: ${scene.shot}. NOT plastic skin, NOT airbrushed, NOT CGI, no beauty filter, vertical 9:16.`;
  const key = cacheKey("keyframe", prompt);
  const hit = cacheGet(key);
  if (hit) {
    await charge(env, "meta", "muse_image", p.id, { cached: true });
    return { frame: await storeKeyframe(env, p, scene.n, hit.url, hit.source), cached: true };
  }
  assertBudget("meta", "muse_image");
  let url, source = "muse-image";
  try {
    url = await museImage(env, prompt);
  } catch (e) {
    // Muse's filter occasionally rejects scene wording — retry once with a
    // sanitised setting but the SAME persona description (so the fallback
    // still draws the locked creator, not a random face), marked "fallback".
    if (e.code !== "content_policy") throw e;
    await charge(env, "meta", "muse_image", p.id); // the rejected attempt is billed conservatively
    assertBudget("meta", "muse_image");
    url = await museImage(env,
      `Raw candid iPhone selfie photo of ${persona.keyframe_prompt}, smiling and talking to camera in a bright everyday indoor setting, holding a product package, visible skin pores, natural light, vertical 9:16. Product: ${p.name}. NOT plastic skin, NOT airbrushed, NOT CGI.`);
    source = "fallback";
  }
  await charge(env, "meta", "muse_image", p.id);
  if (!url) throw new Error("Muse Image returned no image");
  cacheSet(key, { url, source });
  return { frame: await storeKeyframe(env, p, scene.n, url, source), cached: false };
}

// SAM 3.1 QC (Meta, segmentation — NOT a video generator) for ONE frame:
// one noun phrase per call ("person", "phone") so a broken/empty still is
// caught BEFORE a paid Wan/LTX render. Advisory: recorded on p.segmentation;
// a failure or zero-person frame warns but never blocks generation. Keyed
// by image CONTENT hash (audit #8). Returns {result, called, error}.
async function segmentFrame(env, p, f, { force = false } = {}) {
  const digest = f.image_hash || contentHash(f.keyframe_url || f.keyframe_key);
  const prior = (p.segmentation || []).find((r) => r.scene === f.scene);
  if (!force && prior?.image_hash === digest) return { result: prior, called: false, error: null };
  const url = await frameDataUrl(env, f);
  if (!url) return { result: null, called: false, error: `scene ${f.scene}: keyframe image not readable — SAM QC skipped` };
  const detections = {}; let called = false, error = null;
  for (const phrase of ["person", "phone"]) {
    const key = cacheKey("sam", phrase, digest);
    let hit = cacheGet(key);
    if (!hit) {
      try {
        assertBudget("meta", "sam_segment");
        called = true;
        hit = await samSegment(env, url, phrase);
        cacheSet(key, hit);
        await charge(env, "meta", "sam_segment", p.id);
      } catch (e) { error = `SAM QC deferred: ${String(e.message).slice(0, 160)}`; hit = { phrase, detections: null, boxes: [] }; }
    } else { await charge(env, "meta", "sam_segment", p.id, { cached: true }); }
    detections[phrase] = hit.detections;
  }
  const result = { scene: f.scene, image_hash: digest, detections,
    person_ok: detections.person == null ? null : detections.person > 0,
    note: detections.person === 0 ? "No person detected in this keyframe — check the still before filming." : null };
  p.segmentation = [...(p.segmentation || []).filter((r) => r.scene !== f.scene), result];
  return { result, called, error };
}

function scenePlan(p, sceneLimit) {
  const all = p.storyboard?.scenes || [];
  const scenes = sceneLimit ? all.slice(0, sceneLimit) : all;
  const lines = p.script?.lines || [];
  return scenes.map((s, i) => {
    // Script lines are matched by scene NUMBER (an edited/reordered board
    // must not pair scene 3's picture with scene 2's words); index is only
    // the fallback for scripts that omit `scene`.
    const line = lines.find((l) => Number(l.scene) === s.n) || lines[i] || { text: s.key_line, seconds: s.seconds };
    return { n: s.n, purpose: s.purpose, shot: s.shot, visual: s.visual, key_line: s.key_line, seconds: s.seconds,
      overlay: s.overlay || null, line: { scene: s.n, text: String(line.text || s.key_line || ""), seconds: Number(line.seconds) || Number(s.seconds) || 6 } };
  });
}

function estimateJobUsd(engine, plan) {
  // talk keeps the voice-first order: the clip is driven BY the voice WAV, so
  // its cost is talk_clip + tts_scene per scene (same shape as wan/ltx).
  const clipOp = engine === "ltx" ? "ltx_clip" : engine === "talk" ? "talk_clip" : "wan_clip";
  return +(plan.length * (estimateCost("modal", clipOp) + estimateCost("modal", "tts_scene")) + (plan.length ? estimateCost("modal", "stitch") : 0)).toFixed(2);
}

app.post("/api/projects/:pid/generate", async (c) => {
  // No access gate: an unauthorised caller already has the demo env (no
  // Modal endpoints), so its job is a labelled $0 demo film.
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first" }, 400);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  const requestedEngine = String(body.engine || "wan").toLowerCase();
  // talk (InfiniteTalk) is selectable only when its Modal endpoints are
  // wired; otherwise it falls back to wan so a job can never request an
  // engine with no spawn endpoint. H3 is parked server-side, never submitted.
  const engine = requestedEngine === "ltx" ? "ltx" : requestedEngine === "talk" ? "talk" : "wan";
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  const env = c.env;
  const EP = endpoints(env);
  // Live only when the chosen engine's spawn + result endpoints are both
  // wired; otherwise the job stays in clearly labelled demo mode and spends $0.
  const live = Boolean(EP.wan && EP.wanResult) && (engine === "talk" ? Boolean(EP.talk && EP.talkResult) : true);
  const allScenes = p.storyboard?.scenes || [];
  const requestedLimit = Number(body.limit);
  const sceneLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 0), allScenes.length) : 0;
  const plan = scenePlan(p, sceneLimit);
  if (!plan.length) return c.json({ error: "Storyboard has no scenes" }, 400);

  // Idempotency: one running generate job per project. A second click
  // resumes the existing job instead of paying for a parallel render.
  const running = await findRunningJob(env, p.id);
  if (running) return c.json({ error: "job_running", job_id: running, note: "A generation job is already running for this project — poll it instead." }, 409);

  // Money gate (audit #4): the WHOLE estimated job must fit the remaining
  // budget before the first spawn; per-call checks still run at each step.
  const estimate = live ? estimateJobUsd(engine, plan) : 0;
  if (live) {
    try { assertBudgetUsd("modal", estimate, `${plan.length}-scene ${ENGINE_LABEL[engine]} job`); }
    catch (e) { return c.json({ error: e.message, estimated_usd: estimate, note: "Generation refused by the credit guard before any Modal submit — try a smaller scene limit." }, 402); }
  }
  p.persona = persona.id;
  await saveProject(env, p);

  const job = { id: crypto.randomUUID(), project_id: p.id, stage: "generate", engine, persona: persona.id, requested_engine: requestedEngine,
    status: "running", progress: 1, step: "Queued", mode: live ? "live" : "demo",
    audio_plan: "local-voice", scene_limit: sceneLimit, estimated_usd: estimate,
    scenes: [], models: {}, created_at: new Date().toISOString(),
    note: live ? "Queued — poll GET /api/jobs/:id every ~5 s; each poll advances one step."
      : "Demo mode: Wan/LTX Modal endpoints are not configured. No media credits will be spent on this job.",
    state: { live, phase: live ? "keyframes" : "voice", i: 0, language: p.language, plan,
      work: plan.map(() => ({})), clipPaths: [], audioPaths: [], overlays: [], lines: [],
      kf: { created: [], reused: [], failed: [], fallback: [], error: null }, qc: { checked: 0, called: 0, errors: [] },
      voiceTried: 0, voiceOk: 0, budgetStop: null } };
  try { await saveJob(env, job, { create: true }); }
  catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) {
      const again = await findRunningJob(env, p.id);
      return c.json({ error: "job_running", job_id: again, note: "A generation job is already running for this project." }, 409);
    }
    return failure(c, "generate", e);
  }
  return c.json({ ...publicJob(job), poll_url: `/api/jobs/${job.id}` }, 202);
});

function setStep(job, text, progress) {
  job.step = text;
  if (progress != null) job.progress = Math.max(job.progress || 0, Math.min(99, Math.round(progress)));
}
const isBudget = (e) => String(e?.message || "").startsWith("BUDGET_EXHAUSTED");

// Runs ONE step. Returns true when an external (possibly paid) call was
// made, so the runner stops and persists; free steps chain.
async function runStep(env, job, p) {
  const st = job.state, EP = endpoints(env), N = st.plan.length;
  const persona = getPersona(job.persona);
  const label = ENGINE_LABEL[job.engine];
  // talk renders FROM the voice WAV (audio-driven lips, no separate voice
  // request at clip time), so its per-scene op is talk_clip; wan/ltx keep
  // their silent-motion ops. Every op is budget-guarded at spawn (WP-C rule 5).
  const clipOp = job.engine === "ltx" ? "ltx_clip" : job.engine === "talk" ? "talk_clip" : "wan_clip";
  const s = st.plan[st.i], w = st.work[st.i];
  const sceneProgress = (frac) => 20 + ((st.i + frac) / Math.max(N, 1)) * 65;

  switch (st.phase) {
    case "keyframes": { // 0) Muse Image stills (Meta must be visibly in every live run)
      if (!s) { st.phase = "qc"; st.i = 0; return false; }
      setStep(job, `Drawing keyframe ${st.i + 1} of ${N} (Muse Image)`, 2 + (st.i / N) * 13);
      if (frameFor(p, s.n)) { st.kf.reused.push(s.n); st.i++; return false; }
      if (!has(env, "META_API_KEY")) { st.kf.failed.push(s.n); st.kf.error = "META_API_KEY not set — Muse Image keyframes skipped."; st.i++; return false; }
      try {
        const { frame, cached } = await keyframeForScene(env, p, persona, s);
        (cached ? st.kf.reused : st.kf.created).push(s.n);
        if (frame.source === "fallback") st.kf.fallback.push(s.n);
        st.i++; return !cached;
      } catch (e) {
        st.kf.failed.push(s.n);
        st.kf.error = `Muse Image keyframe failed for scene ${s.n} (${String(e.message).slice(0, 120)}) — that scene will be skipped in the film.`;
        st.i++; return !isBudget(e);
      }
    }
    case "qc": { // 0b) SAM 3.1 QC gate (advisory), one frame per step
      if (!s) { st.phase = "voice"; st.i = 0; return false; }
      setStep(job, `Checking keyframe ${st.i + 1} of ${N} (SAM 3.1 QC)`, 15 + (st.i / N) * 5);
      const f = frameFor(p, s.n);
      st.i++;
      if (!f || !has(env, "META_API_KEY")) return false;
      const r = await segmentFrame(env, p, f);
      st.qc.checked++; if (r.called) st.qc.called++;
      if (r.error) st.qc.errors.push(r.error);
      return r.called;
    }
    case "voice": { // 1) local voice FIRST: its real duration sizes the clip
      if (!s) { st.phase = "stitch_spawn"; return false; }
      if (!st.live) { st.phase = "critic"; return false; } // demo: no voice, no video
      setStep(job, `Recording voice for scene ${st.i + 1} of ${N}`, sceneProgress(0));
      if (st.budgetStop) { w.failed = `skipped — ${st.budgetStop}`; st.phase = "critic"; return false; }
      // No still -> skip BEFORE paying for its voice (audit #9).
      if (!frameFor(p, s.n)) { w.failed = `no Muse Image keyframe for scene ${s.n} — scene skipped (see keyframe_status)`; st.phase = "critic"; return false; }
      st.voiceTried++;
      try {
        assertBudget("modal", "tts_scene");
        const out = await speakLocal(env, EP, { text: s.line.text, language: st.language, persona });
        await charge(env, "modal", "tts_scene", job.project_id);
        st.voiceOk++;
        w.audio_volume_path = out.audio_volume_path || volumeBasename(out.audio_url);
        w.duration_s = Number(out.duration_s) || null;
        w.voice = { engine: out.engine || "local", voice: out.voice || null, warning: out.warning || null, duration_s: w.duration_s };
      } catch (e) {
        if (e.ambiguous) await charge(env, "modal", "tts_scene", job.project_id); // may have run on the GPU
        if (isBudget(e)) { st.budgetStop = e.message; w.failed = `skipped — ${e.message}`; st.phase = "critic"; return false; }
        // A missing voice degrades to "voice pending" — it must never kill
        // an otherwise-working video job.
        w.voice = { engine: "voice-pending", voice: null, warning: `Local voice unavailable (${String(e.message).slice(0, 120)}) — clip rendered silent for this scene.` };
      }
      st.phase = "video_spawn";
      return true;
    }
    case "video_spawn": { // 2) one clip spawn — charged AT SPAWN, never lost
      setStep(job, `Rendering scene ${st.i + 1} of ${N} (${label})`, sceneProgress(0.2));
      const cap = ENGINE_CAP_S[job.engine];
      const seconds = +Math.max(2, Math.min(w.duration_s || s.line.seconds || 5, cap)).toFixed(2);
      w.seconds = seconds;
      try {
        assertBudget("modal", clipOp);
        const frame = frameFor(p, s.n);
        const dataUrl = await frameDataUrl(env, frame);
        if (!dataUrl) throw new Error(`keyframe for scene ${s.n} is not readable`);
        let out;
        try {
          // Talk is audio-driven: keyframe + the voice WAV from the voice
          // phase (already on the volume). It MUST have a voice — a talk
          // clip with no audio is a silent failure, so skip before spending.
          const spawnEp = job.engine === "talk" ? EP.talk : EP.wan;
          const payload = job.engine === "talk"
            ? (() => { if (!w.audio_volume_path) throw new Error(`scene ${s.n}: talk engine needs its voice WAV first — voice phase produced none`); return { keyframe_b64: dataUrl.split(",").pop(), audio_volume_path: w.audio_volume_path, prompt: `${persona.h3_description}. ${s.visual || ""}.` }; })()
            : { engine: job.engine, keyframe_b64: dataUrl.split(",").pop(),
              prompt: `${persona.h3_description}. ${s.visual || ""}. Natural talking-head UGC motion, looking into camera, relaxed gestures, no text, no logo.`,
              seconds, project: { name: p.name, language: st.language } };
          out = await modalCall(env, spawnEp, payload, { timeoutMs: 60000 });
        } catch (e) { if (e.ambiguous) await charge(env, "modal", clipOp, job.project_id); throw e; }
        await charge(env, "modal", clipOp, job.project_id);
        if (out.error) throw new Error(`${job.engine} scene ${s.n}: ${String(out.error).slice(0, 160)}`);
        if (out.call_id) { w.call_id = out.call_id; w.spawned_at = Date.now(); st.phase = "video_poll"; }
        else { acceptClip(st, s, w, out); st.phase = "critic"; } // sync-style endpoint already returned the clip
      } catch (e) {
        if (isBudget(e)) st.budgetStop = e.message;
        w.failed = String(e.message).slice(0, 200);
        st.phase = "critic";
        return !isBudget(e);
      }
      return true;
    }
    case "video_poll": { // non-blocking single result check
      const elapsed = Math.round((Date.now() - (w.spawned_at || Date.now())) / 1000);
      setStep(job, `Rendering scene ${st.i + 1} of ${N} (${label}) — ${elapsed}s`, sceneProgress(0.2 + Math.min(elapsed / 600, 1) * 0.7));
      // Talk has its own result endpoint; wan/ltx share theirs.
      // WP-H: a missing result endpoint or a poll throw must never kill the
      // job — the scene is marked failed with the reason and the run moves on.
      let r;
      try {
        r = await modalPollOnce(env, job.engine === "talk" ? EP.talkResult : EP.wanResult, w.call_id);
      } catch (e) { w.failed = `${job.engine} scene ${s.n}: result check failed (${String(e.message).slice(0, 120)})`; st.phase = "critic"; return true; }
      if (r.status === "complete") {
        if (r.error) w.failed = `${job.engine} scene ${s.n}: ${String(r.error).slice(0, 160)}`;
        else acceptClip(st, s, w, r);
        st.phase = "critic";
      } else if (r.status === "error") {
        w.failed = `${job.engine} scene ${s.n}: ${String(r.error || "Modal job failed").slice(0, 160)}`; st.phase = "critic";
      } else if (Date.now() - w.spawned_at > 25 * 60 * 1000) {
        // WP-H: the GPU call is abandoned — cancel it so it stops billing,
        // then record the timeout and move on. The cancel is fire-and-forget.
        await modalCancel(env, job.engine === "talk" ? EP.talk : EP.wan, w.call_id);
        w.failed = `${job.engine} scene ${s.n}: timed out after 25 min (call ${w.call_id})`; st.phase = "critic";
      }
      return true;
    }
    case "critic": { // 3) plan/script critic — advisory, can never kill paid clips
      setStep(job, `Reviewing scene ${st.i + 1} of ${N} (${CRITIC_LABEL})`, sceneProgress(0.95));
      let verdict;
      try { verdict = await criticAgent(env, p, s, 1); }
      catch (e) {
        console.error("[critic]", e?.message || e);
        verdict = { mode: "unavailable", label: CRITIC_LABEL, scene: s.n, verdict: "unavailable", note: isBudget(e) ? e.message : "Critic unavailable — clip kept." };
      }
      job.scenes.push({ scene: s.n, engine: job.engine,
        mode: !st.live ? "demo" : w.clip_volume_path ? "live" : "failed",
        clip_url: w.clip_url || null, audio_url: mediaUrl(w.audio_volume_path) || null,
        seconds: w.seconds || null, overlay: s.overlay || null,
        overlay_status: s.overlay ? "intent recorded — a real uploaded proof asset is required before stitch can composite it" : null,
        voice: w.voice || { engine: st.live ? "voice-pending" : "demo", voice: null, warning: null },
        critic: verdict, error: w.failed || null });
      if (w.failed) (job.failed_scenes = job.failed_scenes || []).push({ scene: s.n, error: w.failed });
      st.i++;
      st.phase = st.i < N ? "voice" : "stitch_spawn";
      return verdict.mode === "live";
    }
    case "stitch_spawn": {
      if (!st.live || !st.clipPaths.length) { st.phase = "verify"; return false; }
      if (!EP.stitch) { job.stitch_error = "MODAL_STITCH_ENDPOINT not set — clips rendered but not stitched."; st.phase = "verify"; return false; }
      setStep(job, "Stitching the film (voice + captions + AI label)", 86);
      try {
        assertBudget("modal", "stitch");
        let out;
        try {
          out = await modalCall(env, EP.stitch, { clip_volume_paths: st.clipPaths, audio_volume_paths: st.audioPaths,
            overlays: st.overlays, lines: st.lines, project_id: job.project_id }, { timeoutMs: 60000 });
        } catch (e) { if (e.ambiguous) await charge(env, "modal", "stitch", job.project_id); throw e; }
        await charge(env, "modal", "stitch", job.project_id);
        if (out.error) throw new Error(`stitch: ${String(out.error).slice(0, 160)}`);
        if (out.call_id) {
          if (!EP.stitchResult) throw new Error("MODAL_STITCH_RESULT_ENDPOINT not set — cannot collect the stitched film");
          st.stitch = { call_id: out.call_id, spawned_at: Date.now() }; st.phase = "stitch_poll";
        } else { acceptFinal(job, out); st.phase = "verify"; }
      } catch (e) { job.stitch_error = String(e.message).slice(0, 200); st.phase = "verify"; return !isBudget(e); } // rendered scenes survive a stitch failure
      return true;
    }
    case "stitch_poll": {
      setStep(job, "Stitching the film (voice + captions + AI label)", 90);
      const r = await modalPollOnce(env, EP.stitchResult, st.stitch.call_id);      if (r.status === "complete") { if (r.error) job.stitch_error = String(r.error).slice(0, 200); else acceptFinal(job, r); st.phase = "verify"; }
      else if (r.status === "error") { job.stitch_error = String(r.error || "stitch failed").slice(0, 200); st.phase = "verify"; }
      else if (Date.now() - st.stitch.spawned_at > 12 * 60 * 1000) {
        // WP-H: cancel the abandoned stitch so the CPU/GPU stops billing.
        await modalCancel(env, EP.stitch, st.stitch.call_id);
        job.stitch_error = "stitch timed out after 12 min"; st.phase = "verify";
      } // stitch app itself times out at 600 s
      return true;
    }
    case "verify": {
      if (st.live && st.clipPaths.length === 0) { finishJob(job, p, "error"); return false; }
      // Verify: transcribe the FIRST shipped voice track against ITS OWN
      // script line (audit #7 — one scene's audio vs the whole script would
      // understate similarity on every multi-scene job).
      setStep(job, "Verifying the spoken words (Muse Voice Transcribe)", 95);
      const idx = st.work.findIndex((x) => x.audio_volume_path && x.clip_volume_path);
      const ref = idx >= 0 ? st.work[idx].audio_volume_path : null;
      job.verification = await verifySpoken(env, p, ref, idx >= 0 ? st.plan[idx].line.text : (st.plan[0]?.line.text || ""), st.language);
      // Honest scope label: later scenes are never checked, so the UI (and
      // any owner decision about Whisper-on-Modal) sees exactly what ran.
      job.verification.scope = idx >= 0 ? `scene ${st.plan[idx].n} vs its script line` : "no shipped voice";
      st.phase = "export";
      return job.verification.status === "complete" || job.verification.status === "deferred";
    }
    case "export": {
      // Ready-to-post package — best-effort, a caption failure must never
      // fail a completed film.
      setStep(job, "Preparing the posting package", 98);
      try { job.posting_package = await exportAgent(env, p, job); }
      catch (e) { console.error("[export]", e?.message || e); job.posting_package = null; job.export_error = isBudget(e) ? e.message : "export unavailable"; }
      finishJob(job, p, "complete");
      return job.posting_package?.mode === "live";
    }
    default:
      finishJob(job, p, job.status === "running" ? "error" : job.status);
      return false;
  }
}

function acceptClip(st, s, w, out) {
  // WP-H: accept EITHER clip_volume_path (Modal volume) OR clip_url (https) —
  // never fail a rendered scene on a naming technicality. A scene counts as
  // rendered when the engine gave us anything playable or volume-addressable.
  const name = out.clip_volume_path || volumeBasename(out.clip_url);
  const url = /^https?:/.test(out.clip_url || "") ? out.clip_url : null;
  if (!name && !url) { w.failed = `scene ${s.n}: engine returned no clip path`; return; }
  w.clip_volume_path = name || null;
  w.clip_url = mediaUrl(volumeBasename(name)) || url;
  // Talk clips already carry the voice (muxed at render): stitch must NOT
  // receive the WAV again or the film would double the voice. Silent-engine
  // clips still need their voice WAV muxed at stitch.
  const talkAudio = out.has_audio === true || out.engine === "infinitetalk";
  if (talkAudio) w.voice = { ...(w.voice || {}), engine: "infinitetalk", muxed: true };
  st.clipPaths.push(name);
  st.audioPaths.push(talkAudio ? null : (w.audio_volume_path || null));
  st.overlays.push(s.overlay || null);
  st.lines.push(s.line);
}
function acceptFinal(job, out) {
  job.final_video_url = out.final_video_url || null;
  job.final_volume_path = out.final_volume_path || null;
  job.final_media_url = mediaUrl(volumeBasename(out.final_volume_path || out.final_video_url));
  job.overlays_applied = out.overlays_applied ?? null;
}

// job.models lists ONLY stages that actually ran: {model, used, detail}.
function buildModels(job, p) {
  const st = job.state, m = {};
  for (const k of ["research", "storyboard", "script"]) {
    const mode = p[k]?.mode;
    if (p[k]) m[k] = { model: MODEL_MAP[k], used: mode === "live", detail: mode === "live" ? undefined : `${mode || "edited"} output (no live model call)` };
  }
  if (st.live) {
    m.keyframe = { model: MODEL_MAP.keyframe, used: st.kf.created.length > 0,
      detail: `created [${st.kf.created}] reused [${st.kf.reused}] failed [${st.kf.failed}]${st.kf.fallback.length ? ` fallback-prompt [${st.kf.fallback}]` : ""}` };
    if (st.qc.checked) m.segment = { model: MODEL_MAP.segment, used: st.qc.called > 0, detail: `${st.qc.checked} frame(s) checked, ${st.qc.called} live` };
    if (st.voiceTried) m.voice = { model: MODEL_MAP.voice, used: st.voiceOk > 0, detail: `${st.voiceOk}/${st.voiceTried} scene voice(s) recorded` };
    m.video = { model: MODEL_MAP.video[job.engine], used: st.clipPaths.length > 0, detail: `${st.clipPaths.length}/${st.plan.length} scene(s) rendered` };
    if (st.stitch || job.final_volume_path || job.stitch_error) m.stitch = { model: MODEL_MAP.stitch, used: Boolean(job.final_volume_path), detail: job.stitch_error || undefined };
  }
  const liveCritic = job.scenes.some((x) => x.critic?.mode === "live");
  m.critic = { model: MODEL_MAP.critic, used: liveCritic, detail: liveCritic ? "judges plan + script text only, never frames" : "deterministic demo check (line length vs seconds)" };
  if (job.verification && job.verification.status !== "skipped") m.verify = { model: MODEL_MAP.verify, used: job.verification.status === "complete", detail: job.verification.note || undefined };
  if (job.posting_package) m.export = { model: MODEL_MAP.export, used: job.posting_package.mode === "live" };
  return m;
}

function finishJob(job, p, status) {
  const st = job.state, N = st.plan.length, rendered = st.clipPaths.length;
  job.status = status;
  job.progress = status === "complete" ? 100 : Math.max(job.progress || 0, 90);
  job.step = status === "complete" ? "Complete" : "Stopped";
  job.keyframe_status = st.live ? { ...st.kf } : null;
  job.segment_status = st.live ? { checked: st.qc.checked, errors: st.qc.errors } : null;
  if (status === "error" && !job.error) job.error = st.budgetStop || "No scene rendered — see failed_scenes.";
  const failed = job.failed_scenes || [];
  job.note = !st.live
    ? "Demo mode: Wan/LTX Modal endpoints are not configured. No media credits were spent on this job — scenes are labelled demo and carry no clips."
    : status === "error" ? "Generation stopped — no scene rendered. See failed_scenes / error. Charges for any spawned calls are recorded."
    : failed.length
      ? `Partial film: ${rendered}/${N} scenes rendered; scenes ${failed.map((f) => f.scene).join(", ")} failed and were left out rather than killing the whole run.`
      : `${ENGINE_LABEL[job.engine]} picture (silent motion) + local Nigerian voice muxed at stitch — the winning-UGC voiceover format.`;
  job.models = buildModels(job, p);
  p.status = status === "complete" ? "generated" : "generate_error";
}

// Advance a running job: free steps chain, the first external call ends
// this poll (so one request never does two paid things).
async function advanceJob(env, job) {
  const p = await getProject(env, job.project_id);
  if (!p) { job.status = "error"; job.error = "Project not found"; return; }
  try {
    for (let n = 0; n < 60 && job.status === "running"; n++) {
      if (await runStep(env, job, p)) break;
    }
  } catch (e) {
    // Unexpected bug in a step: stop the job but keep everything rendered.
    console.error("[job]", job.id, e);
    job.error = `step ${job.state?.phase} failed: ${String(e?.message || e).slice(0, 160)}`;
    finishJob(job, p, "error");
  }
  if (job.status === "running") job.models = buildModels(job, p);
  await saveProject(env, p);
}

app.get("/api/jobs/:jid", async (c) => {
  // Steps run with the RAW env: the job was authorised and budget-gated at
  // creation, so an anonymous poll may advance it but never widen it. A demo
  // job (e.g. started by a public visitor) is always stepped with the demo
  // env, so polling it can never reach a paid provider.
  const raw = c.get("raw_env");
  const peek = await getJob(raw, c.req.param("jid"));
  const env = peek?.mode === "live" ? raw : demoEnv(raw);
  const jid = c.req.param("jid");
  let job = await getJob(env, jid);
  if (!job) return c.json({ error: "Job not found" }, 404);
  if (job.status === "running" && job.state && await acquireLock(env, jid)) {
    try {
      job = (await getJob(env, jid)) || job; // re-read under the lock: another poll may have just stepped
      if (job.status === "running") { await advanceJob(env, job); await saveJob(env, job); }
    } finally { await releaseLock(env, jid); }
  }
  return c.json(publicJob(job));
});

// Verify (Muse Voice Transcribe): transcribe the SPOKEN audio that will
// actually ship and compare it against the script, so "the video says our
// exact words" is checked, not assumed. SCOPE: the FIRST voiced scene only
// (the first scene with both a voice track and a rendered clip); the UI
// labels it "first voiced scene" because later scenes are never checked.
// The voice lives in the Modal volume; it is fetched through the token-gated
// file endpoint. NEVER throws: a verify failure must not fail a completed film.
async function verifySpoken(env, p, audioRef, expectedText, language) {
  const out = { status: "skipped", expected: expectedText || "", heard: null, similarity: null, words: null, note: null };
  if (!has(env, "META_API_KEY")) { out.note = "META_API_KEY not set — verify skipped."; return out; }
  if (!audioRef) { out.note = "No local voice track was produced for this job, so transcription verify has nothing to compare against the script."; return out; }
  try {
    let b64 = null;
    const name = volumeBasename(audioRef);
    if (String(audioRef).startsWith("data:audio")) b64 = String(audioRef).split(",").pop();
    else if (MEDIA_NAME.test(name || "") && env.MODAL_FILE_ENDPOINT) {
      const res = await modalFile(env, name);
      if (!res?.ok) throw new Error(`voice file fetch ${res?.status}`);
      b64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
    }
    if (!b64) { out.status = "deferred"; out.note = `Voice lives in the Modal volume (${name}) and MODAL_FILE_ENDPOINT is not set — deferred, not faked.`; return out; }
    assertBudget("meta", "muse_transcribe");
    const { text, words } = await museTranscribe(env, b64, { language });
    await charge(env, "meta", "muse_transcribe", p.id);
    out.heard = text; out.words = words;
    // crude word-overlap similarity (cheap honesty signal, not a metric claim)
    const norm = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9à-ÿ\s]/g, " ").split(/\s+/).filter(Boolean));
    const a = norm(out.expected), b = norm(text);
    if (a.size) { let hit = 0; for (const w of a) if (b.has(w)) hit++; out.similarity = Math.round((hit / a.size) * 100) / 100; }
    out.status = "complete";
    out.note = words?.length ? `Transcribed with word-level timestamps (${words.length} words).` : "Transcribed (no word timestamps returned by this model response).";
  } catch (e) { out.status = "deferred"; out.note = `Verify deferred: ${String(e.message).slice(0, 160)} — generation is unaffected.`; }
  return out;
}

// Export for Posting (standalone, optional): build/refresh the posting
// package for the latest job without regenerating any media. Works in demo
// mode too — the user copies and posts manually (no social APIs).
app.post("/api/projects/:pid/export", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first — the export caption is written from your script." }, 400);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  const rawEnv = c.get("raw_env");
  let job = null;
  if (body.job_id) {
    job = await getJob(rawEnv, String(body.job_id));
    // A job id from ANOTHER project must not leak that project's media refs.
    if (!job || job.project_id !== p.id) return c.json({ error: "Job not found for this project" }, 404);
  } else job = await latestJob(rawEnv, p.id);
  try {
    const pkg = await exportAgent(c.env, p, job);
    if (job && job.status !== "running") { job.posting_package = pkg; await saveJob(rawEnv, job); }
    return c.json({ project_id: p.id, job_id: job?.id || null, posting_package: pkg });
  } catch (e) { return failure(c, "export", e); }
});

// Voice preview: hear the persona's local voice on one line BEFORE filming,
// so a face/voice mismatch is caught in the Studio, not in the final video.
app.post("/api/projects/:pid/voice-preview", async (c) => {
  if (!c.get("authorized")) return accessRequired(c);
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  const text = String(body.text || p.script?.lines?.[0]?.text || p.storyboard?.scenes?.[0]?.key_line
    || "Na this one finally solve am, no wahala again.").slice(0, 300); // one line, not a free TTS service
  const EP = endpoints(c.env);
  const route = voiceRoute(p.language, persona);
  try {
    assertBudget("modal", "tts_scene");
    let out;
    try { out = await speakLocal(c.env, EP, { text, language: p.language, persona }); }
    catch (e) { if (e.ambiguous) await charge(c.env, "modal", "tts_scene", p.id); throw e; }
    await charge(c.env, "modal", "tts_scene", p.id);
    const name = out.audio_volume_path || volumeBasename(out.audio_url);
    return c.json({ ...out, audio_media_url: mediaUrl(name), persona: persona.id, plan: route.source });
  } catch (e) { return failure(c, "voice-preview", e); }
});

// Keyframes: one Muse Image still per storyboard scene (brief §6).
// Cached — regenerating the same scene prompt costs $0. Lets the user
// preview stills before filming; generate creates missing stills itself.
app.post("/api/projects/:pid/keyframes", async (c) => {
  if (!c.get("authorized")) return accessRequired(c);
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.storyboard) return c.json({ error: "Run storyboard first" }, 400);
  if (!has(c.env, "META_API_KEY")) return c.json({ error: "META_API_KEY not set" }, 400);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  p.persona = persona.id;
  const wanted = body.scene ? p.storyboard.scenes.filter((s) => s.n === Number(body.scene)) : p.storyboard.scenes;
  const failed = [];
  for (const s of wanted) {
    if (frameFor(p, s.n)) continue;
    try { await keyframeForScene(c.env, p, persona, s); }
    catch (e) { failed.push(s.n); if (isBudget(e)) { await saveProject(c.env, p); return failure(c, "keyframes", e); } console.error("[keyframes]", s.n, e?.message || e); }
  }
  await saveProject(c.env, p);
  if (failed.length && failed.length === wanted.length) return c.json({ error: `Muse Image keyframes failed for scene(s) ${failed.join(", ")}` }, 502);
  return c.json({ project_id: p.id, keyframes: publicProject(p).keyframes, failed_scenes: failed });
});

// Seed a keyframe: attach an EXISTING still (e.g. a user-approved, LOCKED
// persona keyframe) to a scene without re-paying Muse Image — regenerating
// would also risk a different face. Body: { scene, keyframe_url: data:image/... }.
app.post("/api/projects/:pid/keyframes/seed", async (c) => {
  if (!c.get("authorized")) return accessRequired(c);
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  const body = await readJson(c, 8 * 1024 * 1024);
  if (body === BAD_JSON) return badJson(c);
  const scene = Number(body.scene);
  const url = String(body.keyframe_url || "");
  if (!Number.isInteger(scene) || scene < 1 || !/^data:image\/[a-z+.-]+;base64,/i.test(url)) return c.json({ error: "Body must be { scene: number, keyframe_url: data:image/... }" }, 400);
  try { await storeKeyframe(c.env, p, scene, url, "seeded"); } catch (e) { return failure(c, "seed", e); }
  p.segmentation = (p.segmentation || []).filter((r) => r.scene !== scene); // new still -> fresh QC
  await saveProject(c.env, p);
  return c.json({ project_id: p.id, seeded: scene, keyframes: publicProject(p).keyframes.map((f) => ({ scene: f.scene, source: f.source, keyframe_url: f.keyframe_url?.startsWith("/api/") ? f.keyframe_url : undefined })) });
});

// Proof overlay upload (WP-G): attach a REAL asset (rcpt screen recording or
// before/after image) to a scene. Stored in R2 under the project; the R2 key
// is recorded on the scene overlay so stitch composites the real card —
// never an AI-drawn placeholder. Body: { scene, asset: data:video|image/... }.
// Size-limited (8 MB); storyboard PUT keeps the overlay intent, the R2 key is
// the proof it exists. Free to attach; compositing happens at paid stitch.
app.post("/api/projects/:pid/overlays", async (c) => {
  if (!c.get("authorized")) return accessRequired(c);
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.storyboard) return c.json({ error: "Run storyboard first" }, 400);
  const body = await readJson(c, 8 * 1024 * 1024);
  if (body === BAD_JSON) return badJson(c);
  const scene = Number(body.scene);
  const m = String(body.asset || "").match(/^data:(video\/mp4|video\/webm|image\/png|image\/jpe?g|image\/webp);base64,(.+)$/i);
  if (!Number.isInteger(scene) || scene < 1 || !m) return c.json({ error: "Body must be { scene: number, asset: data:video/mp4|webm|image/...;base64,… } (max 8 MB)" }, 400);
  const sc = p.storyboard.scenes.find((s) => s.n === scene);
  if (!sc) return c.json({ error: `Scene ${scene} is not in this storyboard` }, 404);
  const ext = m[1].startsWith("video/") ? (m[1].endsWith("webm") ? "webm" : "mp4") : (m[1].endsWith("png") ? "png" : m[1].endsWith("webp") ? "webp" : "jpg");
  const key = `proof/${p.id}/scene-${scene}.${ext}`;
  // R2 when bound (deployed); local dev without R2 keeps the data URL inline
  // on the project (8 MB cap keeps the D1 row safe), same as keyframe seeding.
  if (c.env?.MEDIA) {
    try { await c.env.MEDIA.put(key, base64ToBytes(m[2]), { httpMetadata: { contentType: m[1].toLowerCase() } }); }
    catch (e) { return failure(c, "overlays", e); }
    sc.overlay = { ...(typeof sc.overlay === "object" ? sc.overlay : {}), asset: `/api/media/r2/${key}`, style: sc.overlay?.style || "pip", real: true };
  } else {
    sc.overlay = { ...(typeof sc.overlay === "object" ? sc.overlay : {}), asset: `data:${m[1].toLowerCase()};base64,${m[2]}`, style: sc.overlay?.style || "pip", real: true };
  }
  await saveProject(c.env, p);
  return c.json({ project_id: p.id, scene, overlay: sc.overlay }, 201);
});

// SAM 3.1 QC on the project's keyframes (advisory — never blocks filming).
// Body: { scene?: number, force?: bool }.
app.post("/api/projects/:pid/qc", async (c) => {
  if (!c.get("authorized")) return accessRequired(c);
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!(p.keyframes || []).length) return c.json({ error: "Generate keyframes first" }, 400);
  const body = await readJson(c);
  if (body === BAD_JSON) return badJson(c);
  const out = { checked: 0, results: [], error: null };
  const frames = (p.keyframes || []).filter((f) => !body.scene || f.scene === Number(body.scene));
  if (!has(c.env, "META_API_KEY")) out.error = "META_API_KEY not set — SAM QC skipped.";
  else for (const f of frames) {
    const r = await segmentFrame(c.env, p, f, { force: !!body.force });
    if (r.result) { out.results.push(r.result); out.checked++; }
    if (r.error) out.error = r.error;
  }
  await saveProject(c.env, p);
  return c.json({ project_id: p.id, segmentation: p.segmentation, qc: out });
});

export default app;
