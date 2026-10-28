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
const kf = await step("keyframes (scene 1)", () => post(`/api/projects/${project.id}/keyframes`, { scene: 1 }));
if (!Array.isArray(kf.keyframes) || kf.keyframes.length !== 1) throw new Error(`keyframes: expected exactly 1 keyframe, got ${JSON.stringify(kf.keyframes)}`);
if (kf.keyframes[0].scene !== 1 || !kf.keyframes[0].keyframe_url) throw new Error(`keyframes: bad keyframe payload ${JSON.stringify(kf.keyframes[0])}`);
console.log(`    keyframe scene 1: ${kf.keyframes[0].keyframe_url}`);
const job = await step("generate (demo)", () => post(`/api/projects/${project.id}/generate`, { engine: "h3" }));
console.log(`    job ${job.id}: ${job.status}, scenes critic-checked: ${job.scenes.length}`);
const credits = await step("credits", () => get("/api/credits"));
console.log("    credit providers:", credits.providers.map((p) => `${p.provider} $${p.estimated_used_usd}/$${p.budget_usd}`).join(", "));
console.log("\nSMOKE PASS — full flow works end-to-end.");
