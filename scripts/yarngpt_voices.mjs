// List hosted YarnGPT voices. FREE call (GET /api/v1/voices) — no synthesis, no credits spent.
// Usage: node scripts/yarngpt_voices.mjs
// Reads YARNGPT_API_KEY from ../.env or env var. Never prints the key.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
let key = process.env.YARNGPT_API_KEY;
if (!key) {
  try {
    const env = readFileSync(root + "/.env", "utf8");
    key = (env.match(/^YARNGPT_API_KEY=(.*)$/m) || [])[1]?.trim();
  } catch {}
}
if (!key) { console.error("YARNGPT_API_KEY not found in env or talla/.env"); process.exit(1); }

const res = await fetch("https://api.yarngpt.ai/api/v1/voices", {
  headers: { Authorization: `Bearer ${key}` },
});
const text = await res.text();
if (!res.ok) { console.error(`GET /voices -> ${res.status}: ${text.slice(0, 400)}`); process.exit(1); }
let data; try { data = JSON.parse(text); } catch { console.error("Non-JSON response:", text.slice(0, 400)); process.exit(1); }
const voices = Array.isArray(data) ? data : (data.voices || data.data || []);
console.log(`${voices.length} voices:`);
for (const v of voices) {
  console.log(`- ${v.name || v.id} | lang=${v.language || v.languages || "?"} | gender=${v.gender || "?"}${v.default ? " | DEFAULT" : ""}`);
}
mkdirSync(root + "/data/tts_bakeoff", { recursive: true });
writeFileSync(root + "/data/tts_bakeoff/voices.json", JSON.stringify(voices, null, 2));
console.log("\nSaved -> data/tts_bakeoff/voices.json (no credits spent)");
