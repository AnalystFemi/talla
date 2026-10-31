// Zero-spend API-chain verification (demo mode, in-process, no network).
// Proves the hardened Worker contract BEFORE any GPU money is spent:
//  - access gate: no code -> demo env + 401 on paid routes; test code -> authorised
//  - project create whitelists fields and ignores a client-supplied id
//  - research -> storyboard (confession) -> PUT storyboard edit -> script
//    (the edit must survive into the script)
//  - keyframes/seed + qc (authorised), async generate (202) polled to
//    complete in demo, second generate while running -> 409
// Bindings are passed explicitly (no keys, no Modal endpoints, no DB), so
// nothing can reach a paid provider. Usage: node scripts/verify_api_chain.mjs

for (const k of Object.keys(process.env)) {
  if (/^(BASETEN|META|FIRECRAWL|EXA|MODAL|TALLA)_/.test(k)) delete process.env[k];
}
const { default: app } = await import("../worker/src/index.js");

const CODE = "test-code-" + Math.random().toString(36).slice(2, 8);
const ENV = { TALLA_ACCESS_CODE: CODE }; // TALLA_DEV_OPEN deliberately unset
const AUTH = { "X-Talla-Access": CODE };

const call = async (method, path, body, headers = {}, env = ENV) => {
  const res = await app.request(path, {
    method, headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }, env);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};
const post = (path, body = {}, h) => call("POST", path, body, h);
const put = (path, body, h) => call("PUT", path, body, h);
const get = (path, h) => call("GET", path, undefined, h);
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

// --- access ---------------------------------------------------------------
const hAnon = await get("/api/health");
must(hAnon.status === 200 && hAnon.data.access?.required === true && hAnon.data.access?.authorized === false && hAnon.data.mode === "demo",
  `anon health: ${JSON.stringify(hAnon.data.access)} mode=${hAnon.data.mode}`);
const hAuth = await get("/api/health", AUTH);
must(hAuth.data.access?.authorized === true, "health with code should be authorized");
must((await post("/api/access/check", {}, { "X-Talla-Access": "wrong" })).status === 401, "wrong code must 401");
must((await post("/api/access/check", {}, AUTH)).status === 200, "right code must 200");
const noCodeEnv = await call("POST", "/api/access/check", {}, AUTH, {}); // TALLA_ACCESS_CODE unset
must(noCodeEnv.status === 401 && noCodeEnv.data.authorized === false, "unset TALLA_ACCESS_CODE must authorise nobody");
const devOpen = await call("POST", "/api/access/check", {}, {}, { TALLA_DEV_OPEN: "1" });
must(devOpen.status === 200, "TALLA_DEV_OPEN=1 must authorise locally");
// Unauthorised request with paid keys in env -> still demo (keys stripped).
const leaky = await call("GET", "/api/health", undefined, {}, { ...ENV, BASETEN_API_KEY: "sk-fake", MODAL_WAN_ENDPOINT: "https://example.invalid" });
must(leaky.data.providers.baseten === false && leaky.data.providers.modal_wan === false && leaky.data.mode === "demo",
  "unauthorised request must get the demo env (paid keys removed)");

// --- project create ---------------------------------------------------------
must((await post("/api/projects", "{not json")).status === 400, "invalid JSON must 400");
must((await post("/api/projects", { name: "x", url: "javascript:alert(1)" })).status === 400, "non-http url must 400");
const project = await post("/api/projects", {
  id: "client-chosen-id", status: "generated", research: { injected: true },
  name: "rcpt", description: "verify chain", category: "fintech",
  language: "yoruba", format: "confession", persona: "no-such-persona", url: "https://example.com",
});
must(project.status === 201, `create project -> ${project.status}`);
const pid = project.data.id;
must(pid !== "client-chosen-id" && /^[0-9a-f-]{36}$/.test(pid), `client id must be ignored (got ${pid})`);
must(project.data.status === "draft" && !project.data.research, "client status/research must be ignored");
must(project.data.format === "confession", "project format not persisted");
must(project.data.persona === "female-creator", `persona not normalised (${project.data.persona})`);

// --- brain stages (anonymous = demo, free) -----------------------------------
const research = await post(`/api/projects/${pid}/research`);
must(research.status === 200 && research.data.research?.mode === "demo", `research -> ${research.status} mode=${research.data.research?.mode}`);
const board = await post(`/api/projects/${pid}/storyboard`, { format: "confession" });
must(board.status === 200, `storyboard -> ${board.status}`);
must(board.data.storyboard?.format === "confession", `storyboard format=${board.data.storyboard?.format}`);
const scenes = board.data.storyboard?.scenes || [];
must(scenes.length === 6, `confession scenes=${scenes.length} (expected 6)`);
const overlays = scenes.map((s) => s.overlay?.style || null);
must(JSON.stringify(overlays) === JSON.stringify([null, null, null, "fullscreen", "pip", null]), `overlay beats unexpected: ${JSON.stringify(overlays)}`);

// Seed scene 1 + 2 BEFORE the edit so invalidation can be observed.
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=";
must((await post(`/api/projects/${pid}/keyframes/seed`, { scene: 1, keyframe_url: tinyPng })).status === 401, "seed without code must 401");
for (const n of [1, 2]) {
  const seed = await post(`/api/projects/${pid}/keyframes/seed`, { scene: n, keyframe_url: tinyPng }, AUTH);
  must(seed.status === 200 && seed.data.seeded === n, `seed ${n} -> ${seed.status}`);
}

// PUT edit: change scene 2's visual + line; scene 1 untouched.
const EDIT = "EDITED LINE: rcpt receipts with QR, copy me";
const edited = { ...board.data.storyboard, scenes: scenes.map((s) => (s.n === 2 ? { ...s, key_line: EDIT, visual: "new visual" } : s)) };
must((await put(`/api/projects/${pid}/storyboard`, { storyboard: { scenes: [{ n: 1 }, { n: 1 }] } })).status === 400, "duplicate scene n must 400");
const saved = await put(`/api/projects/${pid}/storyboard`, { storyboard: edited, format: "confession" });
must(saved.status === 200, `PUT storyboard -> ${saved.status}`);
must(JSON.stringify(saved.data.invalidated_scenes) === "[2]", `only scene 2 should be invalidated, got ${JSON.stringify(saved.data.invalidated_scenes)}`);
const kfScenes = (saved.data.keyframes || []).map((f) => f.scene);
must(kfScenes.includes(1) && !kfScenes.includes(2), `keyframes after edit: ${JSON.stringify(kfScenes)}`);

const script = await post(`/api/projects/${pid}/script`);
must(script.status === 200, `script -> ${script.status}`);
const lines = script.data.script?.lines || [];
must(lines.length === 6, `script lines=${lines.length}`);
must(lines.find((l) => l.scene === 2)?.text === EDIT, "storyboard edit did not survive into /script");

must((await post(`/api/projects/${pid}/qc`, { scene: 1 })).status === 401, "qc without code must 401");
const qc = await post(`/api/projects/${pid}/qc`, { scene: 1 }, AUTH);
must(qc.status === 200, `qc -> ${qc.status}`);

// WP-G proof upload: unauthorised attempt must 401; authorised upload of a
// REAL asset (tiny png) attaches to scene 4 and stamps overlay.real. Without
// R2 bound the worker keeps the asset inline (data URL); with R2 it serves
// through /api/media/r2 — either way it is a real asset, never a placeholder.
must((await post(`/api/projects/${pid}/overlays`, { scene: 4, asset: tinyPng })).status === 401, "overlay upload without code must 401");
const proof = await post(`/api/projects/${pid}/overlays`, { scene: 4, asset: tinyPng }, AUTH);
must(proof.status === 201 && proof.data.overlay?.real === true && String(proof.data.overlay?.asset || "").length > 40, `overlay upload -> ${proof.status} ${JSON.stringify(proof.data).slice(0, 160)}`);
must((await post(`/api/projects/${pid}/overlays`, { scene: 99, asset: tinyPng }, AUTH)).status === 404, "overlay upload to missing scene must 404");

// --- async generate ----------------------------------------------------------
// A public (no-code) generate is a labelled $0 demo job; poll it to completion
// so it doesn't hold the one-running-job slot for the authorised run below.
const anon = await post(`/api/projects/${pid}/generate`, { engine: "wan" });
must(anon.status === 202 && anon.data.mode === "demo", `anonymous generate must be a 202 demo job -> ${anon.status}`);
for (let k = 0; k < 20; k++) { const r = await get(`/api/jobs/${anon.data.id}`); if (r.data.status !== "running") break; }
const gen = await post(`/api/projects/${pid}/generate`, { engine: "h3", limit: 2 }, AUTH);
must(gen.status === 202, `generate -> ${gen.status} ${JSON.stringify(gen.data).slice(0, 200)}`);
must(gen.data.engine === "wan", `engine=${gen.data.engine} (h3 must normalise to wan/parked)`);
must(gen.data.status === "running" && !gen.data.state, "202 job must be running and hide internal state");
const dup = await post(`/api/projects/${pid}/generate`, { engine: "wan" }, AUTH);
must(dup.status === 409 && dup.data.job_id === gen.data.id, `second generate -> ${dup.status} (expected 409 with job id)`);

let job = gen.data, polls = 0;
while (job.status === "running" && polls < 10) { job = (await get(`/api/jobs/${gen.data.id}`)).data; polls++; }
must(job.status === "complete", `demo job status=${job.status} after ${polls} polls (${job.error || ""})`);
must(job.progress === 100 && job.scenes.length === 2 && job.scenes.every((s) => s.mode === "demo" && !s.clip_url), "demo scenes must be labelled demo with no clips");
must(/demo/i.test(job.note || "") && !/h3|on hold/i.test(job.note || ""), `demo note wrong: ${job.note}`);
must(!job.models.keyframe && !job.models.video && job.models.critic && job.models.critic.used === false, `models must list only stages that ran: ${Object.keys(job.models)}`);
must(job.scenes.every((s) => !("skin_realism" in (s.critic?.checks || {}))), "critic must not claim visual checks");
must(job.posting_package?.mode === "demo", "missing demo posting package");

// Second line (scene 2) must be matched by scene number = the edited line.
const exp = await post(`/api/projects/${pid}/export`, { job_id: job.id });
must(exp.status === 200 && exp.data.posting_package, `export -> ${exp.status}`);
const other = await post("/api/projects", { name: "other" });
const otherScripted = other.data.id;
await post(`/api/projects/${otherScripted}/research`); await post(`/api/projects/${otherScripted}/storyboard`); await post(`/api/projects/${otherScripted}/script`);
must((await post(`/api/projects/${otherScripted}/export`, { job_id: job.id })).status === 404, "export with another project's job must 404");

// Generate again after completion is allowed (no stale 409).
const again = await post(`/api/projects/${pid}/generate`, { limit: 1 }, AUTH);
must(again.status === 202, `generate after completion -> ${again.status}`);

const credits = await get("/api/credits");
must(credits.data.total.estimated_used_usd === 0, `demo chain must spend $0, got ${credits.data.total.estimated_used_usd}`);

console.log(`API_CHAIN_OK project=${pid} scenes=${scenes.length} overlays=${JSON.stringify(overlays)} engine=${job.engine} job=${job.status} polls=${polls} spend=$${credits.data.total.estimated_used_usd}`);
