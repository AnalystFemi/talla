import { Hono } from "hono";
import { cors } from "hono/cors";
import { researchAgent, storyboardAgent, scriptAgent, criticAgent, exportAgent, LANGUAGES } from "./agents.js";
import { creditSummary, LIMITS, charge, cacheGet, cacheSet, cacheKey, contentHash, assertBudget } from "./credits.js";
import { has, modalCall, modalJobCall, museImage, museTranscribe, samSegment } from "./providers.js";
import { PERSONAS, DEFAULT_PERSONA_ID, getPersona, voiceRoute } from "./personas.js";

const app = new Hono();
app.use("*", cors());

// Storage: D1 on Cloudflare, in-memory locally. Same route code both ways.
const mem = { projects: new Map(), jobs: new Map() };
const id = () => Math.random().toString(36).slice(2, 10);

async function saveProject(env, p) {
  mem.projects.set(p.id, p);
  if (env?.DB) { try {
    // persona/keyframes/segmentation persist too, so a Workers cold start
    // never re-bills Muse Image or reverts the locked creator (audit #17).
    await env.DB.prepare(`INSERT INTO projects (id,name,description,url,category,audience,language,research,storyboard,script,status,persona,keyframes,segmentation)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(id) DO UPDATE SET research=excluded.research, storyboard=excluded.storyboard, script=excluded.script, status=excluded.status, persona=excluded.persona, keyframes=excluded.keyframes, segmentation=excluded.segmentation`)
      .bind(p.id, p.name, p.description, p.url, p.category, p.audience, p.language,
        JSON.stringify(p.research || null), JSON.stringify(p.storyboard || null), JSON.stringify(p.script || null), p.status,
        p.persona || null, JSON.stringify(p.keyframes || null), JSON.stringify(p.segmentation || null)).run();
  } catch {} }
  return p;
}
async function getProject(env, pid) {
  if (mem.projects.has(pid)) return mem.projects.get(pid);
  if (env?.DB) { try {
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id=?1").bind(pid).first();
    if (row) { for (const k of ["research", "storyboard", "script", "keyframes", "segmentation"]) { try { row[k] = JSON.parse(row[k]); } catch {} } mem.projects.set(pid, row); return row; }
  } catch {} }
  return null;
}

// Hackathon model map (brief §2), VERIFIED live 2026-10-29 against
// api.meta.ai/v1/models: muse-spark-1.3, muse-wonder-1.0, muse-image-1.0,
// muse-voice-transcribe-1.0 all exist. Operating plan:
//   Muse Spark Open (Baseten)  — the brain: research/storyboard/script/critic/export
//   Muse Image 1.0 (Meta API)   — persona keyframes, AUTOMATIC inside /generate
//   Muse Spark 1.3 (Meta API)   — the QUALITY FINAL: caption polish + critic
//                                 second opinion on flagged/high-stakes scenes
//   Muse Voice Transcribe (Meta)— VERIFY stage: transcribes the finished
//                                 audio, Muse Spark compares it with the
//                                 script (word-level honesty check)
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
  video: { h3: "MiniMax H3 (Modal H200, ON HOLD)", wan: "Wan 2.2 (Modal, primary)", ltx: "LTX 2.5 (Modal, cheapest)" },
  critic: "Muse Spark Open (Baseten)",
  stitch: "ffmpeg composite (Modal)",
  export: "Muse Spark Open (Baseten)",
  verify: "Muse Voice Transcribe 1.0 (Meta, verify stage)",
  segment: "SAM 3.1 (Meta, keyframe QC)",
};

app.get("/api/health", (c) => c.json({ ok: true, service: "talla-api", languages: LANGUAGES, engines: ["wan", "ltx"], h3_status: "parked", models: MODEL_MAP, personas: PERSONAS.map((p) => ({ id: p.id, label: p.label, gender: p.gender })),
  providers: { baseten: has(c.env, "BASETEN_API_KEY"), meta: has(c.env, "META_API_KEY"),
    firecrawl: has(c.env, "FIRECRAWL_API_KEY"), exa: has(c.env, "EXA_API_KEY"),
    modal_tts: has(c.env, "MODAL_TTS_ENDPOINT"), modal_yarn: has(c.env, "MODAL_YARN_ENDPOINT"),
    modal_wan: has(c.env, "MODAL_WAN_ENDPOINT"), modal_wan_result: has(c.env, "MODAL_WAN_RESULT_ENDPOINT"),
    modal_h3: has(c.env, "MODAL_H3_ENDPOINT"), modal_h3_parked: true,
    modal_stitch: has(c.env, "MODAL_STITCH_ENDPOINT"), modal_stitch_result: has(c.env, "MODAL_STITCH_RESULT_ENDPOINT") } }));

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
  if (body.storyboard) {
    p.storyboard = body.storyboard; // user edits from the studio
    // A changed scene invalidates the still + QC for that scene only, so a
    // regenerated still is re-checked by SAM instead of inheriting the old
    // frame's verdict (audit #8 companion to the content-hash cache).
    const edited = new Set((body.storyboard.scenes || []).map((s) => s.n));
    if (Array.isArray(p.keyframes)) p.keyframes = p.keyframes.filter((f) => !edited.has(f.scene) || (body.storyboard.scenes || []).some((s) => s.n === f.scene && String(s.visual || "") === String((p.storyboard.scenes || []).find((o) => o.n === f.scene)?.visual || "")));
  }
  if (name === "storyboard" && (body.format === "confession" || body.format === "standard")) p.format = body.format;
  try { p[name] = await fn(c.env, p); }
  catch (e) { console.error(`[${name}]`, e); return c.json({ error: `${name} failed: ${e.message}` }, 502); }
  p.status = status;
  await saveProject(c.env, p);
  return c.json(p);
}
app.post("/api/projects/:pid/research", (c) => stage(c, "research", researchAgent, "researched"));
app.post("/api/projects/:pid/storyboard", (c) => stage(c, "storyboard", storyboardAgent, "storyboarded"));
app.post("/api/projects/:pid/script", (c) => stage(c, "script", scriptAgent, "scripted"));

// Generation (open-source-first — user decision 2026-10-29; H3 PARKED
// after H100 + H200 both failed the cost/speed bar):
//   storyboard scenes -> persona keyframe -> Wan 2.2 / LTX silent motion
//   + local Nigerian voice FIRST (YarnGPT2, or MMS for Pidgin), its real
//   duration sizes the motion clip, stitch muxes the voice onto the
//   picture — the winning-UGC voiceover format: continuous talk + proof
//   cutaways (real screen recordings composited as overlays, never AI-drawn).
//   Persona is locked on the project: keyframe, motion prompt and TTS
//   voice all derive from it (worker/src/personas.js).
// Without Modal endpoints the job completes in labelled demo mode ($0).
const volumeBasename = (u) => (u ? String(u).split("/").pop() : null);

function endpoints(env) {
  // Bindings may be undefined in in-process/test contexts — degrade to demo
  // mode instead of throwing a bare TypeError on property access.
  const e = env || {};
  return {
    tts: e.MODAL_TTS_ENDPOINT, yarn: e.MODAL_YARN_ENDPOINT,
    h3: e.MODAL_H3_ENDPOINT, h3Result: e.MODAL_H3_RESULT_ENDPOINT,
    wan: e.MODAL_WAN_ENDPOINT, wanResult: e.MODAL_WAN_RESULT_ENDPOINT,
    stitch: e.MODAL_STITCH_ENDPOINT, stitchResult: e.MODAL_STITCH_RESULT_ENDPOINT,
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
  if (!EP.tts) throw new Error("MODAL_TTS_ENDPOINT not set (MMS voice app)");
  const out = await modalCall(EP.tts, { text, language });
  if (out.error) throw new Error(`voice: ${out.error}`);
  return { ...out, warning: route.warning };
}

// One Muse Image still for one scene (persona-locked; cached so the same
// scene prompt is never paid for twice). Shared by /keyframes and by
// /generate, which auto-creates any missing still so a live run can never
// silently bypass Muse Image (hackathon: Meta must be visibly in the flow).
async function keyframeForScene(env, p, persona, scene) {
  const look = scene.visual || persona.look_default || persona.look_yoruba || "";
  const prompt = `Raw candid iPhone selfie photo of ${persona.keyframe_prompt}, visible skin pores, natural imperfections, natural light. ${look}. Product: ${p.name} — ${p.description}. Shot: ${scene.shot}. NOT plastic skin, NOT airbrushed, NOT CGI, no beauty filter, vertical 9:16.`;
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
// Returns { created:number[], reused:number[], failed:number[], error }.
// A failure never throws, but failed scenes are named: /generate renders
// them only when a still exists, so the Wan/LTX app never crashes inside
// Modal on a missing keyframe (whose error message there is opaque).
async function ensureKeyframes(env, p, persona, scenes) {
  const out = { created: [], reused: [], failed: [], error: null };
  if (!has(env, "META_API_KEY")) { out.error = "META_API_KEY not set — Muse Image keyframes skipped."; out.failed = scenes.map((s) => s.n); return out; }
  for (const s of scenes) {
    if ((p.keyframes || []).some((f) => f.scene === s.n)) { out.reused.push(s.n); continue; }
    try {
      const { url } = await keyframeForScene(env, p, persona, s);
      p.keyframes = [...(p.keyframes || []), { scene: s.n, keyframe_url: url }];
      out.created.push(s.n);
    } catch (e) {
      out.failed.push(s.n);
      out.error = `Muse Image keyframes failed for scene ${s.n} (${e.message}) — that scene will be skipped in the film.`;
    }
  }
  await saveProject(env, p);
  return out;
}

// SAM 3.1 QC (Meta, segmentation — NOT a video generator): run one noun
// phrase per frame ("person", "phone") over the project's keyframes so a
// broken/empty still is caught BEFORE a paid Wan/LTX render, not after.
// Advisory: detections are recorded on p.segmentation; a failure or a
// zero-person frame warns but never blocks generation. Both the in-run
// cache and persisted results are keyed by image CONTENT hash, so a
// regenerated still is re-checked instead of inheriting the old frame's
// verdict (audit #8). Returns { checked, results, error } — never throws.
async function segmentKeyframes(env, p, { scenes = null, force = false } = {}) {
  const out = { checked: 0, results: [], error: null };
  const frames = (p.keyframes || []).filter((f) => !scenes || scenes.some((s) => s.n === f.scene));
  if (!frames.length) return out;
  if (!has(env, "META_API_KEY")) { out.error = "META_API_KEY not set — SAM QC skipped."; return out; }
  const stored = new Map((p.segmentation || []).map((r) => [r.scene, r]));
  const PHRASES = ["person", "phone"];
  for (const f of frames) {
    const url = String(f.keyframe_url || "");
    if (!url.startsWith("data:image")) continue; // SAM needs media we control; skip remote refs
    const digest = contentHash(url);
    const prior = stored.get(f.scene);
    if (!force && prior?.image_hash === digest) { out.results.push(prior); out.checked++; continue; }
    const detections = {};
    for (const phrase of PHRASES) {
      const key = cacheKey("sam", phrase, digest);
      let hit = cacheGet(key);
      if (!hit) {
        try { hit = await samSegment(env, url, phrase); cacheSet(key, hit); await charge(env, "meta", "sam_segment", p.id); }
        catch (e) { out.error = `SAM QC deferred: ${e.message}`; hit = { phrase, detections: null, boxes: [] }; }
      } else { await charge(env, "meta", "sam_segment", p.id, { cached: true }); }
      detections[phrase] = hit.detections;
    }
    out.results.push({ scene: f.scene, image_hash: digest, detections,
      person_ok: detections.person == null ? null : detections.person > 0,
      note: detections.person === 0 ? "No person detected in this keyframe — check the still before filming." : null });
    out.checked++;
  }
  p.segmentation = [...(p.segmentation || []).filter((r) => !out.results.some((o) => o.scene === r.scene)), ...out.results];
  await saveProject(env, p);
  return out;
}

app.post("/api/projects/:pid/generate", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const requestedEngine = String(body.engine || "wan").toLowerCase();
  const engine = requestedEngine === "ltx" ? "ltx" : "wan"; // Wan primary; LTX cheapest. H3 is parked server-side, never submitted by this route.
  const persona = getPersona(body.persona || p.persona || DEFAULT_PERSONA_ID);
  p.persona = persona.id;
  const env = c.env;
  const EP = endpoints(env);
  // Live only when Wan/LTX spawn + result endpoints are both wired; otherwise
  // the job stays in clearly labelled demo mode and spends $0.
  const live = Boolean(EP.wan && EP.wanResult);
  const allScenes = p.storyboard?.scenes || [];
  const requestedLimit = Number(body.limit);
  const sceneLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 0), allScenes.length) : 0;
  const scenes = sceneLimit ? allScenes.slice(0, sceneLimit) : allScenes;
  const clipPaths = [], audioPaths = [], stitchedOverlays = [], stitchedLines = [], failedScenes = [];
  const job = { id: id(), project_id: p.id, stage: "generate", engine, persona: persona.id, requested_engine: requestedEngine,
    models: { research: MODEL_MAP.research, storyboard: MODEL_MAP.storyboard, script: MODEL_MAP.script,
      keyframe: MODEL_MAP.keyframe, segment: MODEL_MAP.segment, voice: MODEL_MAP.voice,
      video: MODEL_MAP.video[engine] || MODEL_MAP.video.wan, critic: MODEL_MAP.critic, stitch: MODEL_MAP.stitch,
      verify: MODEL_MAP.verify },
    audio_plan: "local-voice", scene_limit: sceneLimit,
    status: "running", progress: 10, scenes: [] };
  mem.jobs.set(job.id, job);
  // Money gate (audit #4): the $50/credits.js caps must be able to stop a
  // LIVE run before the first Modal submit, not just log it afterwards.
  if (live) {
    try { assertBudget("modal"); } catch (e) {
      job.status = "error"; job.error = e.message;
      job.note = "Generation refused by the credit guard before any Modal submit.";
      return c.json(job, 402);
    }
  }
  try {
    // 0) Muse Image keyframes first: every live run must show Meta in the
    //    flow, so missing stills are created here even if the user never
    //    pressed "Generate keyframes" in the Studio.
    job.models.keyframe_status = live ? await ensureKeyframes(env, p, persona, scenes) : { created: [], reused: [], error: null };
    // 0b) SAM 3.1 QC gate (advisory): confirm each still actually contains
    //     a person before paying for its render. Cheap Meta call, cached.
    job.models.segment_status = live ? await segmentKeyframes(env, p, { scenes }) : { checked: 0, results: [], error: null };
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const line = p.script?.lines?.[i] || { text: scene.key_line, seconds: scene.seconds };
      let clipUrl = null, mode = live ? "live" : "demo", audioUrl = null, voiceInfo = null;
      // The whole-scene overlay slot (audit #11): editor intent -> real file.
      // Overlay assets are REAL uploads only (never AI-drawn). Until the
      // Studio upload lands they are null; the job keeps `overlay` (intent)
      // separate from what stitch actually composited.

      // 1) Local voice FIRST (all languages on Wan/LTX, which are silent):
      //    its real duration sizes the motion clip, and stitch muxes it in.
      //    A missing voice endpoint degrades to "voice pending" — it must
      //    never kill an otherwise-working video job.
      let localAudio = null;
      if (live) {
        try {
          localAudio = await speakLocal(env, EP, { text: line.text, language: p.language, persona });
        } catch (e) {
          voiceInfo = { engine: "voice-pending", voice: null, warning: `Local voice unavailable (${e.message}) — clip rendered silent for this scene.` };
        }
        if (localAudio) {
          await charge(env, "modal", "tts_scene", p.id);
          audioUrl = localAudio.audio_url; voiceInfo = localAudio;
        }
      }

      // 2) Video clip per storyboard scene. A failed scene must NOT kill
      //    the film (audit #1): scenes that already rendered are stitched
      //    into a partial cut, failures are named on the job, and the
      //    completed work is never thrown away. A scene with no keyframe
      //    is skipped here instead of crashing inside the Modal app
      //    (audit #9); its voice, if any, still ships in the run record.
      if (live) {
        try {
          const frame = (p.keyframes || []).find((f) => f.scene === scene.n);
          if (!frame?.keyframe_url) throw new Error(`no Muse Image keyframe for scene ${scene.n} — scene skipped (see keyframe_status)`);
          const b64 = String(frame.keyframe_url).split(",").pop();
          const seconds = Math.min(Math.max(Number(line.seconds) || 6, 5), 15);
          const out = await modalJobCall(EP.wan, EP.wanResult, { engine, keyframe_b64: b64,
            prompt: `${persona.h3_description}. ${scene.visual}. Natural talking-head UGC motion, looking into camera, relaxed gestures, no text, no logo.`,
            seconds,
            project: { name: p.name, language: p.language } });
          await charge(env, "modal", engine === "wan" ? "wan_clip" : "ltx_clip", p.id);
          if (out.error) throw new Error(`${engine} scene ${scene.n}: ${out.error}`);
          clipUrl = out.clip_url;
          mode = "live";
          clipPaths.push(out.clip_volume_path || volumeBasename(clipUrl));
          audioPaths.push(localAudio?.audio_volume_path || null);
          stitchedOverlays.push(scene.overlay || null);
          stitchedLines.push(line);
        } catch (e) {
          mode = "failed";
          failedScenes.push({ scene: scene.n, error: e.message });
          voiceInfo = voiceInfo ?? { engine: "voice-pending", voice: null, warning: null };
        }
      }

      // 3) Critic gate (advisory until frame-aware critic lands — verdicts
      //    are shown per scene; generation is not silently blocked).
      let verdict = null;
      for (let attempt = 1; attempt <= LIMITS.criticRetriesPerScene; attempt++) {
        verdict = await criticAgent(env, p, scene, attempt);
        if (verdict.verdict === "pass") break;
      }
      job.scenes.push({ scene: scene.n, engine, mode, clip_url: clipUrl, audio_url: audioUrl, overlay: scene.overlay || null,
        overlay_status: scene.overlay ? "intent recorded — a real uploaded proof asset is required before stitch can composite it" : null,
        voice: voiceInfo ? { engine: voiceInfo.engine, voice: voiceInfo.voice, warning: voiceInfo.warning || null } : { engine: "voice-pending" },
        critic: verdict });
      job.progress = 10 + Math.round(((i + 1) / Math.max(scenes.length, 1)) * 80);
    }
    if (live && clipPaths.length && EP.stitch) {
      try {
        assertBudget("modal");
        const stitched = await modalJobCall(EP.stitch, EP.stitchResult, {
          clip_volume_paths: clipPaths,
          audio_volume_paths: audioPaths,
          overlays: stitchedOverlays,
          lines: stitchedLines,
          project_id: p.id,
        }, { timeoutMs: 600000 }); // stitch app itself times out at 600s (audit #13)
        await charge(env, "modal", "stitch", p.id);
        job.final_video_url = stitched.final_video_url || null;
        job.final_volume_path = stitched.final_volume_path || null;
        job.overlays_applied = stitched.overlays_applied ?? null;
      } catch (e) { job.stitch_error = e.message; } // rendered scenes survive a stitch failure too
    }
    if (live && failedScenes.length) job.failed_scenes = failedScenes;
    job.status = (live && clipPaths.length === 0 && scenes.length > 0) ? "error" : "complete";
    job.progress = job.status === "complete" ? 100 : 90;
    job.note = live
      ? (failedScenes.length
          ? `Partial film: ${clipPaths.length}/${scenes.length} scenes rendered; scenes ${failedScenes.map((f) => f.scene).join(", ")} failed and were left out rather than killing the whole run. Finished media is preserved for the posting package.`
          : `${engine === "wan" ? "Wan 2.2" : "LTX 2.5"} picture (silent motion) + local Nigerian voice muxed at stitch — the winning-UGC voiceover format. Media lives in the talla-outputs volume until R2 keys are set.`)
      : "Demo mode: Wan/LTX Modal endpoints are not configured. No media credits were spent on this job.";
  } catch (e) {
    job.status = "error"; job.error = e.message;
    job.note = "Generation stopped — see error. Completed scenes are kept above.";
  }
  p.status = job.status === "complete" ? "generated" : job.status === "error" ? "generate_error" : p.status;
  // Optional final step: attach a ready-to-post export package (caption in
  // the video's language + hashtags + video ref). Best-effort — a caption
  // failure must never fail a completed film. Also available standalone at
  // POST /api/projects/:pid/export for manual/copy-only use.
  if (job.status === "complete") {
    // Verify: transcribe the FIRST shipped voice track against ITS OWN
    // script line (audit #7 — comparing one scene's audio to the whole
    // script would understate similarity on every multi-scene job).
    const firstScene = job.scenes.find((s) => s.audio_url);
    const firstLine = firstScene ? (p.script?.lines || []).find((l) => l.scene === firstScene.scene) : null;
    job.verification = await verifySpoken(env, p, firstScene?.audio_url || null,
      firstLine?.text || (p.script?.lines || [])[0]?.text || "", p.language);
    job.verification.scope = firstScene ? `scene ${firstScene.scene} vs its script line` : "no shipped voice";
    try { job.posting_package = await exportAgent(env, p, job); } catch {}
  }
  await saveProject(env, p);
  return c.json(job, 201);
});

// Verify (Muse Voice Transcribe): transcribe the SPOKEN audio that will
// actually ship and compare it against the script, so "the video says our
// exact words" is checked, not assumed. The audio may live in the Modal
// volume (modal-volume://) — then we fetch it via the TTS app's own
// volume-mount path if present, else honestly defer. NEVER throws: a
// verify failure must not fail a completed film.
async function verifySpoken(env, p, audioRef, expectedText, language) {
  const out = { status: "skipped", expected: expectedText || "", heard: null, similarity: null, words: null, note: null };
  if (!has(env, "META_API_KEY")) { out.note = "META_API_KEY not set — verify skipped."; return out; }
  if (!audioRef) { out.note = "No local voice track was produced for this job, so transcription verify has nothing to compare against the script."; return out; }
  try {
    let b64 = null;
    if (String(audioRef).startsWith("data:audio")) b64 = String(audioRef).split(",").pop();
    else if (/^https?:/.test(audioRef)) {
      const res = await fetch(audioRef); const buf = new Uint8Array(await res.arrayBuffer());
      b64 = Buffer.from(buf).toString("base64");
    }
    if (!b64) { out.note = `Voice lives in the Modal volume (${audioRef}) — transcription runs when the audio is served over HTTP (R2). Deferred, not faked.`; return out; }
    const { text, words } = await museTranscribe(env, b64, { language });
    out.heard = text; out.words = words;
    // crude word-overlap similarity (cheap honesty signal, not a metric claim)
    const norm = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9à-ÿ\s]/g, " ").split(/\s+/).filter(Boolean));
    const a = norm(out.expected), b = norm(text);
    if (a.size) { let hit = 0; for (const w of a) if (b.has(w)) hit++; out.similarity = Math.round((hit / a.size) * 100) / 100; }
    out.status = "complete";
    out.note = words?.length ? `Transcribed with word-level timestamps (${words.length} words).` : "Transcribed (no word timestamps returned by this model response).";
  } catch (e) { out.status = "deferred"; out.note = `Verify deferred: ${e.message} — the API's transcription wire format is probed at runtime; generation is unaffected.`; }
  return out;
}

// Export for Posting (standalone, optional): build/refresh the posting
// package for the latest job without regenerating any media. Works in demo
// mode too — the caption/hashtags are prepared from script + research, the
// user copies and posts manually (no social APIs, no auto-posting).
app.post("/api/projects/:pid/export", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!p.script) return c.json({ error: "Run script first — the export caption is written from your script." }, 400);
  const body = await c.req.json().catch(() => ({}));
  const job = body.job_id ? mem.jobs.get(body.job_id) : [...mem.jobs.values()].filter((j) => j.project_id === p.id).pop();
  try {
    const pkg = await exportAgent(c.env, p, job);
    if (job) job.posting_package = pkg;
    return c.json({ project_id: p.id, job_id: job?.id || null, posting_package: pkg });
  } catch (e) { return c.json({ error: `export failed: ${e.message}` }, 502); }
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

// Seed a keyframe: attach an EXISTING still (e.g. a user-approved, LOCKED
// persona keyframe) to a scene without re-paying Muse Image — regenerating
// would also risk a different face. The still joins the normal QC/generate
// flow (content-hash SAM cache included). Body: { scene, keyframe_url }.
app.post("/api/projects/:pid/keyframes/seed", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const scene = Number(body.scene);
  const url = String(body.keyframe_url || "");
  if (!scene || !url.startsWith("data:image")) return c.json({ error: "Body must be { scene: number, keyframe_url: data:image/... }" }, 400);
  p.keyframes = [...(p.keyframes || []).filter((f) => f.scene !== scene), { scene, keyframe_url: url, source: "seeded" }];
  await saveProject(c.env, p);
  return c.json({ project_id: p.id, seeded: scene, keyframes: p.keyframes.map((f) => ({ scene: f.scene, source: f.source || "muse-image" })) });
});

// SAM 3.1 QC on the project's keyframes (advisory — never blocks filming).
// Body: { scene?: number } to limit to one scene.
app.post("/api/projects/:pid/qc", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  if (!p) return c.json({ error: "Project not found" }, 404);
  if (!(p.keyframes || []).length) return c.json({ error: "Generate keyframes first" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const scenes = body.scene && p.storyboard ? p.storyboard.scenes.filter((s) => s.n === body.scene) : null;
  const res2 = await segmentKeyframes(c.env, p, { scenes, force: !!body.force });
  return c.json({ project_id: p.id, segmentation: p.segmentation, qc: res2 });
});

app.get("/api/jobs/:jid", (c) => {
  const job = mem.jobs.get(c.req.param("jid"));
  return job ? c.json(job) : c.json({ error: "Job not found" }, 404);
});

export default app;
