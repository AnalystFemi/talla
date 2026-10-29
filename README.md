# Talla — Autonomous Research → UGC Video Engine

Talla (Hausa for "advertisement") turns a product, brand, category or URL into a researched, storyboarded, culturally authentic UGC video in Pidgin, Yoruba, Hausa, Igbo or Nigerian English. Full brief: `../TALLA_MASTER_PLAN-2.md`.

## Run locally (demo mode, $0)
```powershell
npm run install:all
npm run dev:api    # http://localhost:8787
npm run dev:web    # http://localhost:5173
node scripts/smoke.mjs
```
No keys = demo mode: every stage returns clearly-labelled demo output and the full flow (homepage → studio → research → storyboard → script → generate → credits) works end-to-end. One exception: keyframes (Muse Image) need `META_API_KEY`, so without it `/generate` falls back to a labelled H3/Wan anchor frame and the job flags the gap honestly. The critic is advisory (scores shown per scene), not a gate. Add keys to `.env` (see `.env.example`) to go live stage by stage.

## Architecture
- `web/` — React/Vite, Cloudflare Pages. Riverside-style homepage (§8) + studio flow.
- `worker/` — Hono API. Runs locally via @hono/node-server, deploys unchanged to Cloudflare Workers. D1 (projects/jobs/credits) + R2 (media) when bound, in-memory locally.
- `modal/` — Cloud GPU only: `wan_app.py` (Wan 2.2 + LTX — PRIMARY silent-motion video), `yarngpt_app.py` (YarnGPT2, self-hosted voices for Yoruba/Hausa/Igbo), `tts_app.py` (MMS voices for Pidgin), `stitch_app.py` (FFmpeg composite + captions + AI label), `h3_app.py` (MiniMax H3 — ON HOLD/parked; needs a fresh Modal deploy before use), `lipsync_app.py` (parked, unused). Outputs upload Modal → R2 directly. Nothing >5MB is downloaded or rendered locally.
- `worker/src/credits.js` — budget enforcement: caching, retry caps, 768p-first, per-call estimates. See `CREDITS.md`.

## Deploy (after local works)
```powershell
# One-time, already done — wrangler.toml already holds the D1 database_id + R2 bucket:
# wrangler d1 create talla; wrangler r2 bucket create talla-media
# Then deploy:
npm run deploy:api
npm run deploy:web
wrangler secret put BASETEN_API_KEY  # repeat per key
```
GitHub: push this folder to the `analystfemi` repo (to be provided), then deploy from CI or Wrangler as above.
