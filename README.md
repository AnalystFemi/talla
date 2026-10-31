# Talla — Autonomous Research → UGC Video Engine

Talla (Hausa for "advertisement") turns a product, brand, category or URL into a researched, storyboarded, local-language UGC video in Pidgin, Yoruba, Hausa, Igbo or Nigerian English. Full brief: `../TALLA_MASTER_PLAN-2.md`.

## Judges' quick path ($0)
Open the Studio, click **Try a sample product**, then run research → storyboard → script. Without an access code everything runs in labelled **demo mode** and no credits are spent. Storyboard scenes can be edited and saved (free) before scripting.

## Run locally
```powershell
npm run install:all
npm run dev:api    # http://localhost:8787 (loads ../.env)
npm run dev:web    # http://localhost:5173 (proxies /api to :8787)
node scripts/smoke.mjs
```

## Demo vs live
- **Demo (public):** no access code → the Worker strips every paid key/endpoint for that request, so research/storyboard/script return labelled demo output at $0. Paid-only actions (generate, keyframes, QC, voice preview, keyframe seed) return `401 access_required`.
- **Live:** the Studio sends the access code as `X-Talla-Access`; it must match the Worker secret `TALLA_ACCESS_CODE`. If that secret is unset, nobody is live. `TALLA_DEV_OPEN=1` opens access for **local dev only**.
- Live generation also needs the Modal endpoints and `MODAL_ENDPOINT_TOKEN` (see `.env.example`). Every paid call is checked against the $50 budget (`CREDITS.md`).

## How generation runs
`POST /api/projects/:id/generate` (engine `wan`, `ltx`, or `talk` when wired) returns **202** with a job; a second click while one is running gets **409** with the running job id. The Studio polls `GET /api/jobs/:id` every 5 s and **each poll advances one step** (Muse Image keyframe → SAM QC → voice → clip spawn / result check → critic → stitch → verify → export). Filming only advances while a client polls (Studio tab open, or a script); reloading the Studio resumes polling. The finished film plays through `GET /api/media/file/:name`, which the Worker proxies from Modal stitch `file_http`. Verify transcribes the **first voiced scene only** (labelled in the Studio). Proof cards composite only after a **real asset is uploaded** (`POST /api/projects/:id/overlays`, max 8 MB) — editorial intent alone never renders a placeholder.

## Architecture
- `web/` — React/Vite on Cloudflare Pages. Homepage + Studio. Build with `VITE_API_URL=<worker url>`.
- `worker/` — Hono API. Runs locally via @hono/node-server, deploys to Cloudflare Workers. D1 (projects, jobs, credit_log) and R2 (`MEDIA`, keyframe stills) when bound; in-memory locally.
- `modal/` — cloud GPU/CPU apps, all token-gated (`X-Talla-Token`):
  - `wan_app.py` — **Wan 2.2 I2V A14B (primary)**, 720x1280, 16 fps, ≤81 frames (~5 s), H100 with CPU offload, max 1 container; **LTX 2.5 (fallback)**, 768x1344, 24 fps, ≤257 frames (~10.6 s), A100-80GB. Both are silent; the local voice is muxed at stitch.
  - `talk_app.py` — **InfiniteTalk lip-sync (NEW, not deployed, keyed off until its smoke test):** keyframe + the voice WAV render audio-driven lips (25 fps, ≤1000 frames/40 s, H100). Worker accepts `engine: "talk"` only when its endpoints are wired; the Studio card stays disabled otherwise.
  - `yarngpt_app.py` — YarnGPT2 voices (Yoruba, Hausa, Igbo, Nigerian English). Tone-marked Yoruba that renders broken-short is retried once with diacritics stripped (worker-side, flagged in the voice warning).
  - `tts_app.py` — MMS voice for Pidgin (MMS is CC-BY-NC).
  - `stitch_app.py` — FFmpeg: normalise every clip to 1080x1920 / 24 fps / 48 kHz stereo, proof overlays, Noto Sans captions, "AI-generated" label; `file_http` serves outputs.
  - `h3_app.py`, `lipsync_app.py` — **parked**, never submitted by any route.
- `worker/src/credits.js` — budget guard from D1 `credit_log` totals. See `CREDITS.md`.

## Deploy
Follow `docs/deploy-checklist.md` (Modal secret → Modal deploys → D1 migration → Worker secrets → Worker → Pages → CORS → verify). Calibration of the first live render: `CALIBRATION_RUNBOOK.md`.

## Not yet proven
No live Wan 720p render has been run on the hardened code; per-clip Modal costs are uncalibrated estimates (InfiniteTalk `talk_clip` $1.50 is an unmeasured placeholder until its smoke test); the verify stage has not been proven live; Modal → R2 upload is optional and not configured.
