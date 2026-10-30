// End-to-end smoke test against a running API. Start API first: npm run dev:api
// Sends X-Talla-Access from process.env.TALLA_ACCESS_CODE (if set). Without
// it (and without TALLA_DEV_OPEN=1 on the server) paid routes answer 401 and
// are reported as SKIP — the free demo flow is still checked end-to-end.
// Spends $0 when the server has no keys/endpoints (demo mode).
const BASE = process.env.API_BASE || "http://localhost:8787";
const ACCESS = process.env.TALLA_ACCESS_CODE ? { "X-Talla-Access": process.env.TALLA_ACCESS_CODE } : {};
const step = async (name, fn) => { const out = await fn(); console.log(`OK  ${name}`); return out; };
const req = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...ACCESS },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};
const post = async (path, body = {}) => {
  const { status, data } = await req("POST", path, body);
  if (status >= 400) throw Object.assign(new Error(`${path} -> ${status}: ${JSON.stringify(data).slice(0, 300)}`), { status });
  return data;
};
const get = async (path) => {
  const { status, data } = await req("GET", path);
  if (status >= 400) throw new Error(`${path} -> ${status}`);
  return data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const health = await step("health", () => get("/api/health"));
console.log(`    mode=${health.mode} access=${JSON.stringify(health.access)} providers:`, JSON.stringify(health.providers));
const authorized = Boolean(health.access?.authorized);
const project = await step("create project", () => post("/api/projects", {
  name: "rcpt", description: "Receipts Nigerian vendors create in 10 seconds, with QR verification.",
  category: "fintech tool", audience: "Instagram/WhatsApp vendors", language: "pidgin",
}));
await step("research", () => post(`/api/projects/${project.id}/research`));
const sb = await step("storyboard", () => post(`/api/projects/${project.id}/storyboard`));
console.log(`    scenes: ${sb.storyboard.scenes.length}`);
await step("storyboard edit (PUT, free)", async () => {
  const { status } = await req("PUT", `/api/projects/${project.id}/storyboard`, { storyboard: sb.storyboard });
  if (status !== 200) throw new Error(`PUT storyboard -> ${status}`);
});
await step("script", () => post(`/api/projects/${project.id}/script`));
const hasMeta = Boolean(health.providers?.meta);
let kf = { keyframes: [] };
if (authorized && hasMeta) {
  kf = await step("keyframes (scene 1)", () => post(`/api/projects/${project.id}/keyframes`, { scene: 1 }));
  if (!Array.isArray(kf.keyframes) || !kf.keyframes.some((f) => f.scene === 1 && f.keyframe_url)) throw new Error(`keyframes: bad payload ${JSON.stringify(kf.keyframes).slice(0, 200)}`);
  console.log(`    keyframe scene 1: ${String(kf.keyframes.find((f) => f.scene === 1).keyframe_url).slice(0, 80)}`);
} else {
  console.log(`SKIP keyframes (${authorized ? "no META_API_KEY" : "no access code"} — Muse Image stage)`);
}
if (kf.keyframes.length) {
  const qc = await step("qc (SAM 3.1, scene 1)", () => post(`/api/projects/${project.id}/qc`, { scene: 1 }));
  console.log(`    qc checked=${qc.qc.checked} error=${qc.qc.error || "none"}`);
} else {
  console.log("SKIP qc (no keyframes to segment)");
}
let job = null;
if (!authorized) {
  console.log("SKIP generate (needs X-Talla-Access: set TALLA_ACCESS_CODE, or TALLA_DEV_OPEN=1 on a local server)");
} else {
  job = await step("generate (async, 202)", async () => {
    const { status, data } = await req("POST", `/api/projects/${project.id}/generate`, { engine: "wan" });
    if (status !== 202) throw new Error(`generate -> ${status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  });
  const t0 = Date.now(), maxMs = Number(process.env.SMOKE_MAX_MS || 30 * 60 * 1000);
  while (job.status === "running" && Date.now() - t0 < maxMs) {
    await sleep(job.mode === "demo" ? 200 : 5000);
    job = await get(`/api/jobs/${job.id}`);
    console.log(`    ${job.progress}% ${job.step}`);
  }
  console.log(`    job ${job.id}: ${job.status}, engine=${job.engine}, mode=${job.mode}, video=${job.models?.video?.model || "(not run)"}, scenes=${job.scenes.length}, final=${job.final_media_url || "none"}`);
  if (job.status !== "complete") throw new Error(`generate: job ended ${job.status} ${job.error || ""}`);
  if (job.engine !== "wan") throw new Error(`generate: expected engine wan (H3 parked server-side), got ${job.engine}`);
  if (!job.verification) throw new Error("generate: missing job.verification (Muse Voice Transcribe stage)");
  if (!job.posting_package) throw new Error("generate: missing job.posting_package (Export for Posting stage)");
  console.log(`    verification=${job.verification.status} similarity=${job.verification.similarity}`);
}
const exp = await step("export", () => post(`/api/projects/${project.id}/export`, job ? { job_id: job.id } : {}));
if (!exp.posting_package) throw new Error(`export: bad package ${JSON.stringify(exp)}`);
console.log(`    export hashtags: ${(exp.posting_package.hashtags || []).length}`);
const credits = await step("credits", () => get("/api/credits"));
console.log(`    credits (${credits.source}):`, credits.providers.map((p) => `${p.provider} $${p.estimated_used_usd}/$${p.budget_usd}`).join(", "));
console.log(`\nSMOKE PASS — ${authorized ? "full flow" : "demo flow (paid routes skipped: no access code)"} works end-to-end.`);
