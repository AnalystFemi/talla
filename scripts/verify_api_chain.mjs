// Zero-spend API-chain verification (demo mode, in-process).
// Proves every worker route the calibration script depends on works BEFORE
// any GPU money is spent: project -> research -> storyboard (confession) ->
// script -> keyframes/seed -> qc -> demo generate. Asserts the confession
// format survives the whole chain and demo mode never touches Modal/H3.
// Usage: node scripts/verify_api_chain.mjs   (spends $0 — no keys, demo mode)

process.env.BASETEN_API_KEY = "";
process.env.META_API_KEY = "";

const { default: app } = await import("../worker/src/index.js");

const post = async (path, body = {}) => {
  const res = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const project = await post("/api/projects", {
  name: "rcpt", description: "verify chain", category: "fintech",
  language: "yoruba", format: "confession",
});
if (project.status !== 201) throw new Error(`create project -> ${project.status}`);
const pid = project.data.id;
if (project.data.format !== "confession") throw new Error("project format not persisted");

const research = await post(`/api/projects/${pid}/research`);
if (research.status !== 200 || research.data.research?.mode !== "demo")
  throw new Error(`research -> ${research.status} mode=${research.data.research?.mode}`);

const board = await post(`/api/projects/${pid}/storyboard`, { format: "confession" });
if (board.status !== 200) throw new Error(`storyboard -> ${board.status}`);
if (board.data.storyboard?.format !== "confession")
  throw new Error(`storyboard format=${board.data.storyboard?.format} (expected confession)`);
const scenes = board.data.storyboard?.scenes || [];
if (scenes.length !== 6) throw new Error(`confession scenes=${scenes.length} (expected 6)`);
const overlays = scenes.map((s) => s.overlay?.style || null);
if (JSON.stringify(overlays) !== JSON.stringify([null, null, null, "fullscreen", "pip", null]))
  throw new Error(`overlay beats unexpected: ${JSON.stringify(overlays)}`);

const script = await post(`/api/projects/${pid}/script`);
if (script.status !== 200) throw new Error(`script -> ${script.status}`);
const lines = script.data.script?.lines || [];
if (lines.length !== 6) throw new Error(`script lines=${lines.length} (expected 6)`);

const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const seed = await post(`/api/projects/${pid}/keyframes/seed`, { scene: 1, keyframe_url: tinyPng });
if (seed.status !== 200 || seed.data.seeded !== 1) throw new Error(`seed -> ${seed.status}`);

const qc = await post(`/api/projects/${pid}/qc`, { scene: 1 });
if (qc.status !== 200) throw new Error(`qc -> ${qc.status}`);

const gen = await post(`/api/projects/${pid}/generate`, { engine: "h3", limit: 1 });
if (gen.status !== 201) throw new Error(`generate -> ${gen.status}`);
if (gen.data.engine !== "wan") throw new Error(`engine=${gen.data.engine} (h3 must normalise to wan/parked)`);
if (gen.data.status !== "complete") throw new Error(`demo job status=${gen.data.status}`);
if (gen.data.note?.includes("ON HOLD") || /h3/i.test(gen.data.note || ""))
  throw new Error("demo job note mentions H3 — parked engine must never surface");

console.log(`API_CHAIN_OK project=${pid} scenes=${scenes.length} overlays=${JSON.stringify(overlays)} engine=${gen.data.engine} job=${gen.data.status}`);
