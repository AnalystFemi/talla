// ONE-SHOT Funmi Yoruba calibration — zero-risk orchestration, no loop.
// Reads the COMMITTED API's env from ../.env itself (no keys pass through
// the Studio server), creates a fresh in-memory project, runs the full
// stage chain, then generates EXACTLY ONE Wan scene (limit: 1) with the
// LOCKED Funmi v4 keyframe pre-seeded. Writes state to data/calibration_wan.json.
//
// Usage: node scripts/calibrate_wan.mjs            (spends Modal GPU credits)
//        node scripts/calibrate_wan.mjs --dry      (prints plan, spends $0)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnv();
const WAN = env.MODAL_WAN_ENDPOINT, WAN_RESULT = env.MODAL_WAN_RESULT_ENDPOINT;
const STITCH = env.MODAL_STITCH_ENDPOINT, STITCH_RESULT = env.MODAL_STITCH_RESULT_ENDPOINT;
const YARN = env.MODAL_YARN_ENDPOINT;

const API = process.env.API_BASE || "http://localhost:8787";
const PERSONA = "female-creator-2"; // Funmi — LOCKED, user-accepted 2026-10-29
const LANG = "yoruba";
const LINE = "E ku ife, e ma se je ki iwe isanwo ti ko dara maa le awon onibara yin lo. E fi rcpt se iwe isanwo to dara, to si ni QR, ki onibara le sayewo ara re.";
const VOICE_VOLUME_PATH = "yarn_1793287035.wav"; // verified present in talla-outputs

const post = async (path, body = {}) => {
  const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
};
const modalSpawnPoll = async (spawnUrl, resultUrl, payload, timeoutMs = 25 * 60 * 1000) => {
  const sres = await fetch(spawnUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const spawn = await sres.json().catch(() => ({}));
  if (!spawn.call_id) return spawn;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    const rres = await fetch(`${resultUrl}?call_id=${encodeURIComponent(spawn.call_id)}`);
    if (!rres.ok) continue;
    const out = await rres.json();
    if (out.status === "complete") return out;
    if (out.status === "error") throw new Error(out.error || "modal job failed");
    process.stdout.write(".");
  }
  throw new Error("modal poll timeout");
};

console.log(`== Funmi Yoruba calibration (ONE Wan scene, persona ${PERSONA}) ==`);
console.log(`endpoints: wan=${!!WAN} wan_result=${!!WAN_RESULT} stitch=${!!STITCH} yarn=${!!YARN}`);
if (!WAN || !WAN_RESULT) throw new Error("MODAL_WAN_ENDPOINT(S) missing in .env");
if (dry) { console.log("DRY RUN — plan only, $0 spent."); process.exit(0); }

// 1) Fresh project (API is in-memory; everything happens in this server session).
const project = await post("/api/projects", {
  name: "rcpt", description: "Receipts Nigerian vendors create in 10 seconds, with QR verification.",
  category: "fintech tool", audience: "Instagram/WhatsApp vendors", language: LANG, persona: PERSONA, format: "confession",
});
console.log(`project ${project.id} created`);

// 2) Brain stages (Baseten Spark Open; ~$0.05 total, cached where possible).
await post(`/api/projects/${project.id}/research`);
console.log("research done");
await post(`/api/projects/${project.id}/storyboard`, { format: "confession" });
console.log("storyboard done");
const scripted = await post(`/api/projects/${project.id}/script`);
const line1 = scripted.script?.lines?.[0];
console.log(`script scene 1: "${(line1?.text || "").slice(0, 90)}"`);

// 3) Seed the LOCKED Funmi v4 keyframe + SAM-QC it directly (no Muse charge).
const kfUrl = readFileSync(join(root, "data", "funmi_keyframe_v4_url.txt"), "utf8").trim();
const kfRes = await fetch(`${API}/api/projects/${project.id}/keyframes/seed`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scene: 1, keyframe_url: kfUrl }),
});
const kf = await kfRes.json().catch(() => ({}));
if (!kfRes.ok || kf.seeded !== 1) throw new Error(`seed failed: ${JSON.stringify(kf).slice(0, 300)}`);
console.log("Funmi v4 keyframe seeded for scene 1 (locked, $0)");
try {
  const qc = await post(`/api/projects/${project.id}/qc`, { scene: 1 });
  console.log(`SAM QC: checked=${qc.qc?.checked} person_ok=${qc.qc?.results?.[0]?.person_ok} err=${qc.qc?.error || "none"}`);
} catch (e) { console.log(`SAM QC skipped: ${e.message}`); }

// 4) Wan clip — direct spawn/poll so this script owns the call lifecycle.
//    Voice is 8.69s; Wan caps at 161 frames (~6.7s) and stitch tpad-clones
//    the tail to cover the voice — honest known limit, flagged in the note.
const b64 = kfUrl.split(",").pop();
const seconds = Math.min(Math.max(Number(line1?.seconds) || 8, 5), 15);
console.log(`spawning Wan (seconds=${seconds}) — first run downloads Wan 2.2 weights, be patient…`);
const t0 = Date.now();
const clip = await modalSpawnPoll(WAN, WAN_RESULT, {
  engine: "wan", keyframe_b64: b64, seconds,
  prompt: "Funmi, a light-skinned Nigerian Yoruba woman in her late 20s with long black knotless braids. Bright upscale Lagos apartment living room, modern grey sofa with mustard cushions behind her, soft daylight. Natural talking-head UGC motion, looking into camera, relaxed gestures, no text, no logo.",
  project: { name: "rcpt", language: LANG },
});
console.log(`\nWan clip done in ${Math.round((Date.now() - t0) / 1000)}s: ${clip.clip_volume_path || clip.clip_url}`);

// 5) Stitch the single scene with Funmi's verified Yoruba voice.
console.log("stitching (voice + captions + AI label)…");
const film = await modalSpawnPoll(STITCH, STITCH_RESULT, {
  clip_volume_paths: [clip.clip_volume_path],
  audio_volume_paths: [VOICE_VOLUME_PATH],
  overlays: [null],
  lines: [{ text: line1?.text || LINE, seconds }],
  project_id: project.id,
}, 10 * 60 * 1000);
console.log(`film: ${film.final_video_url} (volume: ${film.final_volume_path}, overlays_applied=${film.overlays_applied})`);

writeFileSync(join(root, "data", "calibration_wan.json"), JSON.stringify({
  at: new Date().toISOString(), project_id: project.id, persona: PERSONA, language: LANG,
  line_used: line1?.text || LINE, seconds_requested: seconds,
  clip_volume_path: clip.clip_volume_path, clip_url: clip.clip_url,
  voice_volume_path: VOICE_VOLUME_PATH,
  final_video_url: film.final_video_url, final_volume_path: film.final_volume_path,
  overlays_applied: film.overlays_applied,
}, null, 2));
console.log("state -> data/calibration_wan.json");
console.log("DONE — exactly one Wan scene was rendered.");
