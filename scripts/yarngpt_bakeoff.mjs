// Hosted YarnGPT reference generation for the TTS bakeoff.
// CREDIT GUARD: default is DRY RUN (0 calls). Real run needs --go.
// Hard limits: --max-calls default 5, absolute cap 25 per run. Every call is logged
// to data/tts_bakeoff/credit_log.md. User budget: MAX 1000 credits total, account has 4000.
// After the FIRST real run, check the yarngpt.ai dashboard balance and record credits/call
// in credit_log.md before running again.
//
// Usage:
//   node scripts/yarngpt_bakeoff.mjs                 # dry run, prints plan, spends nothing
//   node scripts/yarngpt_bakeoff.mjs --go            # 5 calls: 1 line x 5 languages, voice idera
//   node scripts/yarngpt_bakeoff.mjs --go --max-calls 10 --voice umar --lines 2
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const args = process.argv.slice(2);
const GO = args.includes("--go");
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const MAX_CALLS = Math.min(parseInt(opt("--max-calls", "5"), 10) || 5, 25);
const VOICE = opt("--voice", "idera");
const LINES_PER_LANG = parseInt(opt("--lines", "1"), 10) || 1;
const OUT = root + "/data/tts_bakeoff/hosted";
const LOG = root + "/data/tts_bakeoff/credit_log.md";

let key = process.env.YARNGPT_API_KEY;
if (!key) { try { key = (readFileSync(root + "/.env", "utf8").match(/^YARNGPT_API_KEY=(.*)$/m) || [])[1]?.trim(); } catch {} }
if (!key) { console.error("YARNGPT_API_KEY not found"); process.exit(1); }

const lines = JSON.parse(readFileSync(root + "/data/tts_bakeoff/lines.json", "utf8")).languages;
const jobs = [];
for (const [lang, arr] of Object.entries(lines)) {
  arr.slice(0, LINES_PER_LANG).forEach((text, i) => jobs.push({ lang, idx: i + 1, text }));
}
const plan = jobs.slice(0, MAX_CALLS);
console.log(`Plan: ${plan.length} call(s), voice=${VOICE}`);
for (const j of plan) console.log(`  [${j.lang} #${j.idx}] ${j.text.slice(0, 70)}`);
if (!GO) { console.log("\nDRY RUN — nothing spent. Re-run with --go to generate."); process.exit(0); }
if (jobs.length > MAX_CALLS) console.log(`(capped at ${MAX_CALLS} of ${jobs.length} planned jobs)`);

mkdirSync(OUT, { recursive: true });
if (!existsSync(LOG)) writeFileSync(LOG, "# YarnGPT credit log — Session B\n\nBudget: MAX 1000 credits (account: 4000). Log EVERY synthesis call here.\n\n| date | engine | voice | lang | lines | calls | credits (dashboard) | note |\n|---|---|---|---|---|---|---|---|\n");
let done = 0;
for (const j of plan) {
  const name = `${j.lang}_${j.idx}_${VOICE}.mp3`;
  // prepare -> stream ticket (fast path, billed once on fetch)
  const prep = await fetch("https://api.yarngpt.ai/api/v1/tts/prepare", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: j.text, voice: VOICE, output_format: "mp3" }),
  });
  const prepBody = await prep.json().catch(() => ({}));
  if (!prep.ok || !prepBody.stream_url) { console.error(`prepare failed [${j.lang}]: ${prep.status} ${JSON.stringify(prepBody).slice(0, 300)}`); break; }
  const audio = await fetch("https://api.yarngpt.ai" + prepBody.stream_url);
  if (!audio.ok) { console.error(`stream failed [${j.lang}]: ${audio.status}`); break; }
  const buf = Buffer.from(await audio.arrayBuffer());
  if (buf.length < 1000) { console.error(`suspiciously small audio [${j.lang}]: ${buf.length} bytes — stopping`); break; }
  writeFileSync(`${OUT}/${name}`, buf);
  done++;
  console.log(`OK ${name} (${buf.length} bytes) [${done}/${plan.length}]`);
}
appendFileSync(LOG, `| ${new Date().toISOString().slice(0, 10)} | hosted yarngpt.ai | ${VOICE} | mixed | ${done} | ${done} | CHECK DASHBOARD | bakeoff first pass |\n`);
console.log(`\nDone: ${done} call(s). NOW check yarngpt.ai dashboard balance and fill the credits column in credit_log.md before any more calls.`);
