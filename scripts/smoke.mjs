// End-to-end smoke test (demo mode, $0 spend). Start API first: npm run dev:api
const BASE = process.env.API_BASE || "http://localhost:8787";
const step = async (name, fn) => { const out = await fn(); console.log(`OK  ${name}`); return out; };
const post = async (path, body = {}) => {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
};
const get = async (path) => {
  const res = await fetch(BASE + path);
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return data;
};

const health = await step("health", () => get("/api/health"));
console.log("    providers:", JSON.stringify(health.providers));
const project = await step("create project", () => post("/api/projects", {
  name: "rcpt", description: "Receipts Nigerian vendors create in 10 seconds, with QR verification.",
  category: "fintech tool", audience: "Instagram/WhatsApp vendors", language: "pidgin",
}));
await step("research", () => post(`/api/projects/${project.id}/research`));
const sb = await step("storyboard", () => post(`/api/projects/${project.id}/storyboard`));
console.log(`    scenes: ${sb.storyboard.scenes.length}`);
await step("script", () => post(`/api/projects/${project.id}/script`));
const hasMeta = Boolean(health.providers?.meta);
let kf = { keyframes: [] };
if (hasMeta) {
  kf = await step("keyframes (scene 1)", () => post(`/api/projects/${project.id}/keyframes`, { scene: 1 }));
  if (!Array.isArray(kf.keyframes) || kf.keyframes.length !== 1) throw new Error(`keyframes: expected exactly 1 keyframe, got ${JSON.stringify(kf.keyframes)}`);
  if (kf.keyframes[0].scene !== 1 || !kf.keyframes[0].keyframe_url) throw new Error(`keyframes: bad keyframe payload ${JSON.stringify(kf.keyframes[0])}`);
  console.log(`    keyframe scene 1: ${kf.keyframes[0].keyframe_url}`);
} else {
  console.log("SKIP keyframes (no META_API_KEY — Muse Image stage needs the Meta key; /generate records keyframe_status.error and skips still-less scenes)");
}
if (kf.keyframes.length) {
  const qc = await step("qc (SAM 3.1, scene 1)", () => post(`/api/projects/${project.id}/qc`, { scene: 1 }));
  console.log(`    qc checked=${qc.qc.checked} error=${qc.qc.error || "none"}`);
} else {
  console.log("SKIP qc (no keyframes to segment)");
}
const job = await step("generate (demo)", () => post(`/api/projects/${project.id}/generate`, { engine: "wan" }));
console.log(`    job ${job.id}: ${job.status}, engine=${job.engine}, requested=${job.requested_engine}` + `, audio_plan=${JSON.stringify(job.audio_plan)}` + `, video model=${job.models?.video}` + `, scenes critic-checked: ${job.scenes.length}`);
if (job.engine !== "wan") throw new Error(`generate: expected engine wan (Wan 2.2 primary; H3 parked server-side), got ${job.engine}`);
if (!job.verification) throw new Error("generate: missing job.verification (Muse Voice Transcribe stage)");
if (!job.posting_package) throw new Error("generate: missing job.posting_package (Export for Posting stage)");
console.log(`    verification=${job.verification.status} similarity=${job.verification.similarity}`);
const exp = await step("export", () => post(`/api/projects/${project.id}/export`, { job_id: job.id }));
if (!exp.posting_package) throw new Error(`export: bad package ${JSON.stringify(exp)}`);
console.log(`    export hashtags: ${(exp.posting_package.hashtags || []).length}`);
const credits = await step("credits", () => get("/api/credits"));
console.log("    credit providers:", credits.providers.map((p) => `${p.provider} $${p.estimated_used_usd}/$${p.budget_usd}`).join(", "));
console.log("\nSMOKE PASS — full flow works end-to-end.");
