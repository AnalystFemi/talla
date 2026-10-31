// Engine calibration: ONE short Yoruba rcpt line, rendered once per engine
// from the locked Funmi v4 keyframe, each stitched with captions + AI label.
// Times every stage so "speed" and "cost" become measured facts.
//
//   node scripts/calibrate_engines.mjs            (SPENDS Modal GPU: 2 clips)
//   node scripts/calibrate_engines.mjs --only=ltx (one engine)
//   node scripts/calibrate_engines.mjs --only=talk (InfiniteTalk smoke test,
//     about $0.50-2 on H100: keyframe + the reused volume WAV below)
//
// --voice=<volume wav>:<seconds> reuses an already-generated take ($0); the
// WP-C smoke test uses the existing volume WAV yarn_1793393529_17112a4c.wav
// (5.027 s Yoruba) so only the talk render + stitch spend.
//
// Calls Modal directly (X-Talla-Token) — it bypasses /generate and the
// Worker credit guard by design; results land in data/calibration_engines.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const H = { "Content-Type": "application/json", "X-Talla-Token": env.MODAL_ENDPOINT_TOKEN || "" };
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const engines = only ? [only] : ["wan", "ltx"];

// ~12 words: comfortably under Wan's 5.0 s cap so the picture never freezes.
const LINE = process.env.CAL_LINE || "Mi o ko iwe isanwo pelu owo mo. rcpt lo n se e fun mi bayi, onibara mi si n gbekele mi ju ti tele lo.";
const PROMPT = "Funmi, a light-skinned Nigerian Yoruba woman in her late 20s with long black knotless braids. Bright upscale Lagos apartment living room, modern grey sofa with mustard cushions behind her, soft daylight. Natural talking-head UGC motion, speaking to camera, relaxed hand gestures, no text, no logo.";

const sec = (t) => Math.round((Date.now() - t) / 100) / 10;
async function spawnPoll(spawnUrl, resultUrl, payload, timeoutMs) {
  const t = Date.now();
  // Retried ONLY when the request provably never left this machine (DNS /
  // refused connection) — this network drops lookups intermittently; any
  // other failure could mean Modal already spawned, so it is not retried.
  let r;
  for (let a = 1; ; a++) {
    try { r = await fetch(spawnUrl, { method: "POST", headers: H, body: JSON.stringify(payload) }); break; }
    catch (e) {
      const code = e.cause?.code || "";
      if (a < 6 && /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT/.test(code)) { await new Promise((res) => setTimeout(res, 5000)); continue; }
      throw new Error(`spawn fetch failed (${code || e.message})`);
    }
  }
  const s = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`spawn HTTP ${r.status}: ${JSON.stringify(s).slice(0, 300)}`);
  if (!s.call_id) return { out: s, seconds: sec(t) };
  while (Date.now() - t < timeoutMs) {
    await new Promise((res) => setTimeout(res, 10000));
    const rr = await fetch(`${resultUrl}?call_id=${encodeURIComponent(s.call_id)}`, { headers: H }).catch(() => null);
    if (!rr || !rr.ok) continue;
    const o = await rr.json();
    if (o.status === "complete") return { out: o, seconds: sec(t), call_id: s.call_id };
    if (o.status === "error") throw new Error(o.error || "modal job failed");
    process.stdout.write(".");
  }
  throw new Error(`poll timeout after ${timeoutMs / 60000} min (call ${s.call_id})`);
}

const report = { at: new Date().toISOString(), line: LINE, persona: "funmi", language: "yoruba", runs: {} };
const save = () => writeFileSync(join(root, "data", "calibration_engines.json"), JSON.stringify(report, null, 2));

// 1) Voice (YarnGPT2 on Modal T4) — real duration sizes silent-engine clips
// (talk renders FROM this audio, so its clip length equals this duration).
// --voice=<volume wav>:<seconds> reuses an already-generated take ($0).
let t = Date.now();
const reuse = (process.argv.find((a) => a.startsWith("--voice=")) || "").slice(8);
let voice;
if (reuse) {
  const [audio_volume_path, d] = reuse.split(":");
  voice = { audio_volume_path, duration_s: Number(d) };
} else {
  const vr = await fetch(env.MODAL_YARN_ENDPOINT, { method: "POST", headers: H, body: JSON.stringify({ text: LINE, language: "yoruba", voice: "yoruba_female2" }) });
  voice = await vr.json();
  if (!vr.ok || voice.error) throw new Error(`voice: ${vr.status} ${JSON.stringify(voice).slice(0, 300)}`);
}
report.voice = { seconds_to_generate: sec(t), duration_s: voice.duration_s, volume_path: voice.audio_volume_path };
console.log(`voice: ${voice.duration_s}s audio in ${report.voice.seconds_to_generate}s -> ${voice.audio_volume_path}`);
save();

const b64 = readFileSync(join(root, "data", process.env.CAL_KEYFRAME || "funmi_keyframe_v5_url.txt"), "utf8").trim().split(",").pop();
// talk (InfiniteTalk) is audio-driven: no 5 s cap, clip length = voice
// length (max 40 s). Stitch keeps the clip's own muxed voice — the voice WAV
// is NOT passed again, so stitch must not double the audio.
const caps = { wan: 5.0, ltx: 10.6, talk: 40.0 };
const SPAWN = {
  wan: [env.MODAL_WAN_ENDPOINT, env.MODAL_WAN_RESULT_ENDPOINT],
  ltx: [env.MODAL_WAN_ENDPOINT, env.MODAL_WAN_RESULT_ENDPOINT],
  talk: [env.MODAL_TALK_ENDPOINT, env.MODAL_TALK_RESULT_ENDPOINT],
};
for (const engine of engines) {
  if (!SPAWN[engine]) throw new Error(`unknown engine --only=${engine} (want wan|ltx|talk)`);
  const [spawnUrl, resultUrl] = SPAWN[engine];
  if (!spawnUrl || !resultUrl) throw new Error(`missing endpoint env for --only=${engine} (check .env.example names)`);
  const seconds = Math.min(Number(voice.duration_s) || 4.5, caps[engine]);
  console.log(`\n== ${engine.toUpperCase()} (seconds=${seconds}) — first run may download weights…`);
  const run = { seconds_requested: seconds };
  report.runs[engine] = run;
  // Talk payload: keyframe + the voice WAV already on the volume. Silent
  // engines take {engine, seconds, prompt}; talk takes {audio_volume_path}.
  const clipPayload = engine === "talk"
    ? { keyframe_b64: b64, audio_volume_path: voice.audio_volume_path, prompt: PROMPT }
    : { engine, keyframe_b64: b64, seconds, prompt: PROMPT, project: { name: "rcpt", language: "yoruba" } };
  try {
    const clip = await spawnPoll(spawnUrl, resultUrl, clipPayload, 45 * 60 * 1000);
    Object.assign(run, { clip_wall_s: clip.seconds, clip_volume_path: clip.out.clip_volume_path, num_frames: clip.out.num_frames, fps: clip.out.fps, call_id: clip.call_id });
    console.log(`\nclip in ${clip.seconds}s -> ${clip.out.clip_volume_path} (${clip.out.num_frames} frames @ ${clip.out.fps}fps)`);
    save();
    // Talk clips already contain the voice: stitch from the clip audio only.
    // Silent-engine clips need the voice WAV muxed at stitch.
    const stitchPayload = engine === "talk"
      ? { clip_volume_paths: [clip.out.clip_volume_path], audio_volume_paths: [null],
          overlays: [null], lines: [{ text: LINE, seconds }], project_id: `calibration-${engine}` }
      : { clip_volume_paths: [clip.out.clip_volume_path], audio_volume_paths: [voice.audio_volume_path],
          overlays: [null], lines: [{ text: LINE, seconds }], project_id: `calibration-${engine}` };
    const film = await spawnPoll(env.MODAL_STITCH_ENDPOINT, env.MODAL_STITCH_RESULT_ENDPOINT, stitchPayload, 10 * 60 * 1000);
    Object.assign(run, { stitch_wall_s: film.seconds, final_volume_path: film.out.final_volume_path, final_duration_s: film.out.duration_s });
    console.log(`\nfilm in ${film.seconds}s -> ${film.out.final_volume_path}`);
  } catch (e) { run.error = e.message; console.log(`\n${engine} FAILED: ${e.message}`); }
  save();
}
console.log("\nCALIBRATION_DONE -> data/calibration_engines.json");
