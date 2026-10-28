# Talla — Autonomous Research → UGC Video Engine

Talla (Hausa for "advertisement") turns a product, brand, category or URL into a researched, storyboarded, culturally authentic UGC video in Pidgin, Yoruba, Hausa, Igbo or Nigerian English. Full brief: `../TALLA_MASTER_PLAN-2.md`.

## Run locally (demo mode, $0)
```powershell
npm run install:all
npm run dev:api    # http://localhost:8787
npm run dev:web    # http://localhost:5173
node scripts/smoke.mjs
```
No keys = every stage returns clearly-labelled demo output; the complete flow (homepage → studio → research → storyboard → script → critic-gated generate → credits) works end-to-end. Add keys to `.env` (see `.env.example`) to go live stage by stage.

## Architecture
- `web/` — React/Vite, Cloudflare Pages. Riverside-style homepage (§8) + studio flow.
- `worker/` — Hono API. Runs locally via @hono/node-server, deploys unchanged to Cloudflare Workers. D1 (projects/jobs/credits) + R2 (media) when bound, in-memory locally.
- `modal/` — Cloud GPU only: `h3_app.py` (MiniMax H3, primary, H100:4), `wan_app.py` (Wan 2.2 + LTX), `lipsync_app.py` (LivePortrait), `tts_app.py` (SoroTTS/WazobiaVoice), `stitch_app.py` (FFmpeg, captions, AI-generated label). Outputs upload Modal → R2 directly. Nothing >5MB is downloaded or rendered locally.
- `worker/src/credits.js` — budget enforcement: caching, retry caps, 768p-first, per-call estimates. See `CREDITS.md`.
- `docs/rea-findings.md` — REA/Ava reverse-engineering status (blocked on Node >=22.23.4).

## Deploy (after local works)
```powershell
wrangler d1 create talla; wrangler r2 bucket create talla-media
# paste database_id into wrangler.toml, then:
npm run deploy:api
npm run deploy:web
wrangler secret put BASETEN_API_KEY  # repeat per key
```
GitHub: push this folder to the `analystfemi` repo (to be provided), then deploy from CI or Wrangler as above.
