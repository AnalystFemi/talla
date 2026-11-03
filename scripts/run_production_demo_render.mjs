import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

// Load .env
const env = {};
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      let v = (m[2] || "").trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
}

const ACCESS_CODE = env.TALLA_ACCESS_CODE || "";
const API_BASE = "https://talla-api.rcpt.workers.dev";
const H = {
  "Content-Type": "application/json",
  "X-Talla-Access": ACCESS_CODE,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, options = {}, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      if (attempt === retries) throw e;
      console.log(`[network] fetch error: ${e.message}. Retrying (${attempt}/${retries})...`);
      await sleep(3000 * attempt);
    }
  }
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetchWithRetry(url, {
    ...options,
    headers: { ...H, ...(options.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

console.log("=== STARTING TALLA UGC PRODUCTION TEST RENDER ===");
console.log(`Target: ${API_BASE}`);

// 1. Health check
const health = await api("/api/health");
console.log(`Health: mode=${health.mode}, authorized=${health.access?.authorized}`);
if (!health.access?.authorized) {
  throw new Error("Worker rejected access code! Check TALLA_ACCESS_CODE.");
}

// 2. Create Project
console.log("\n[1] Creating project (rcpt demo, Aisha persona, Pidgin language)...");
const project = await api("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: "rcpt",
    description: "Receipts Nigerian vendors create in 10 seconds, with instant QR verification.",
    category: "fintech tool",
    audience: "Instagram and WhatsApp vendors in Lagos",
    language: "pidgin",
    persona: "female-creator", // Aisha (Seed 2007, Voice zainab)
    format: "confession",
  }),
});
const pid = project.id;
console.log(`Project created: id=${pid}, persona=${project.persona}`);

// 3. Research
console.log("\n[2] Running Research Agent...");
const research = await api(`/api/projects/${pid}/research`, { method: "POST" });
console.log(`Research complete: hook ideas=${research.research?.hooks?.length || 0}`);

// 4. Storyboard
console.log("\n[3] Generating Storyboard...");
const sb = await api(`/api/projects/${pid}/storyboard`, { method: "POST" });
console.log(`Storyboard generated: ${sb.storyboard?.scenes?.length || 0} scenes`);

// 5. Attach Real Proof Overlay on Scene 3
const proofPath = path.join(ROOT, "data", "proof", "rcpt_payment_verified_fullscreen.png");
if (fs.existsSync(proofPath)) {
  console.log("\n[4] Attaching real rcpt fullscreen proof overlay to Scene 3...");
  const proofB64 = fs.readFileSync(proofPath).toString("base64");
  const dataUri = `data:image/png;base64,${proofB64}`;
  const ovRes = await api(`/api/projects/${pid}/overlays`, {
    method: "POST",
    body: JSON.stringify({ scene: 3, asset: dataUri }),
  });
  console.log(`Attached proof overlay to scene 3: ${ovRes.overlay?.asset || "ok"}`);
}

// 6. Script
console.log("\n[5] Writing Script...");
const script = await api(`/api/projects/${pid}/script`, { method: "POST" });
console.log(`Script lines produced: ${script.script?.lines?.length || 0}`);

// 7. Generate Job
console.log("\n[6] Launching Generate Job (engine: talk, limit: 5 scenes)...");
const genRes = await api(`/api/projects/${pid}/generate`, {
  method: "POST",
  body: JSON.stringify({ engine: "talk", limit: 5 }),
});
const jid = genRes.id;
console.log(`Job spawned: id=${jid}, engine=${genRes.engine}, status=${genRes.status}`);

// 8. Poll Job
console.log("\n[7] Polling job state machine (advancing steps)...");
const t0 = Date.now();
let job = genRes;
let lastStep = "";

while (job.status === "running") {
  await sleep(4000);
  try {
    job = await api(`/api/jobs/${jid}`);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const timeStr = `${m}m ${s}s`;
    const stepMsg = `[${timeStr}] Progress: ${job.progress}% | ${job.step}`;
    if (stepMsg !== lastStep) {
      console.log(stepMsg);
      lastStep = stepMsg;
    }
  } catch (err) {
    console.log(`[poll warning] ${err.message}. Retrying next interval...`);
  }
}

console.log(`\nJob finished with status: ${job.status}`);
if (job.status === "error") {
  console.error("Job Error:", job.error);
  process.exit(1);
}

console.log("Quality gate info:", JSON.stringify(job.quality_gate || {}));
console.log("Final Video URL:", job.final_video_url);
console.log("Final Media URL:", job.final_media_url);

// 9. Download output video
const outDir = path.join(ROOT, "data", "demo");
fs.mkdirSync(outDir, { recursive: true });
const outVideo = path.join(outDir, "talla_demo_v2.mp4");
const downloadUrl = job.final_video_url?.startsWith("http")
  ? job.final_video_url
  : `${API_BASE}${job.final_media_url}`;

console.log(`\n[8] Downloading final video from ${downloadUrl}...`);
const vidRes = await fetchWithRetry(downloadUrl);
if (!vidRes.ok) {
  throw new Error(`Failed to download video: ${vidRes.status}`);
}
const arrayBuffer = await vidRes.arrayBuffer();
fs.writeFileSync(outVideo, Buffer.from(arrayBuffer));
console.log(`Saved video to: ${outVideo} (${(fs.statSync(outVideo).size / 1024 / 1024).toFixed(2)} MB)`);

// 10. Generate 1-fps Contact Sheet
console.log("\n[9] Generating 1-fps contact sheet (sheet_v2.jpg)...");
const sheetPath = path.join(outDir, "sheet_v2.jpg");
try {
  // Tile frames across the video: 1 frame every second in a 4-column tile
  execSync(`ffmpeg -y -i "${outVideo}" -vf "fps=1,scale=270:480,tile=4x4" -frames:v 1 "${sheetPath}"`, { stdio: "pipe" });
  console.log(`Generated contact sheet: ${sheetPath}`);
} catch (e) {
  console.log(`Could not generate tile sheet with tile=4x4, falling back to simple tile...`);
  execSync(`ffmpeg -y -i "${outVideo}" -vf "fps=0.5,scale=270:480,tile=3x3" -frames:v 1 "${sheetPath}"`, { stdio: "inherit" });
}

console.log("\n=== RENDER COMPLETE & VERIFIED ===");
