# Cloudflare Pages Deploy Readiness — talla (usetalla.pages.dev preferred, talla.pages.dev fallback)

**Generated:** 2026-10-31 09:57 Africa/Lagos  
**Workspace:** C:\Users\DELL\Downloads\Talla\talla — branch **review-hardening** (2590a7a WP-H finish)  
**Account:** akinspajo@gmail.com — ID **0ac7ff501ce61b640bf95ce1bfa77d8f** (OAuth token, scopes: workers:write, pages:write, d1:write, r2)  
**Mode:** READ-ONLY INSPECT — **no deploys, no money spent** (no wrangler deploy, no pages deploy, no modal deploy)

---

## 1. Inspect: wrangler.toml / web/package.json / .env.example / docs/deploy-checklist.md

### wrangler.toml (5 key facts)
- `name = "talla-api"` — Worker main `worker/src/index.js` — `compatibility_date = "2026-10-28"` — **no nodejs_compat** (chunked btoa only)
- `[[d1_databases]]` binding `DB` → `database_name = "talla"` → **ID 14e2db4e-d6a4-4111-8e45-662df9267afd** (provisoned 2026-10-28, confirmed via `wrangler d1 list` — 36,864 bytes)
- `[[r2_buckets]]` binding `MEDIA` → `talla-media` (confirmed via `wrangler r2 bucket list` — 2026-10-28)
- `[vars]`: `BASETEN_BASE_URL=https://inference.baseten.co/v1` / `BASETEN_MODEL=meta-models/muse-spark-open-1026` / **`ALLOWED_ORIGINS = "https://talla.pages.dev"` — PLACEHOLDER** (`http://localhost:5173` always allowed; docs §7 says set to real Pages URL then redeploy)
- Secrets comment block lists 12 names: BASETEN_API_KEY, META_API_KEY, FIRECRAWL_API_KEY, EXA_API_KEY, TALLA_ACCESS_CODE, MODAL_ENDPOINT_TOKEN (+ MODAL_* endpoints) — **never TALLA_DEV_OPEN on deploy**

### web/package.json
- `name: talla-web` — `scripts: { dev: "vite --port 5173", build: "vite build", preview: ... }` — deps `react@19, react-dom@19` / dev `@vitejs/plugin-react@4.3, vite@6`
- `web/index.html` title: *Talla — Your AI UGC Team for Nigerian Businesses* — fonts Bricolage + DM Sans

### .env.example (ground truth for vars vs secrets)
- `TALLA_ACCESS_CODE, TALLA_DEV_OPEN (local only), ALLOWED_ORIGINS` (§0)
- Baseten + Meta (§1–2), Firecrawl/Exa (§3), Modal (§4: MODAL_ENDPOINT_TOKEN = TALLA_ENDPOINT_TOKEN in Modal secret `talla-endpoint-auth`; endpoints WAN/WAN_RESULT, TALK/TALK_RESULT (keyed-off), STITCH/STITCH_RESULT/FILE, YARN/TTS; H3/LIPSYNC PARKED)
- Cloudflare deploy-only (§5: CLOUDFLARE_* , R2_BUCKET, D1_DATABASE — **never as Worker secrets**)
- §6 scripts-only: YARNGPT_API_KEY, API_BASE
- Footer: **`VITE_API_URL` — Worker origin baked at build (e.g. https://talla-api.<subdomain>.workers.dev) — empty = same-origin/dev proxy; `DEV_API_PROXY` default http://localhost:8787** (mirrored in `web/src/api.js: API = import.meta.env.VITE_API_URL || ""` and `web/vite.config.js` proxy)

### docs/deploy-checklist.md (review-hardening 2026-10-30)
- 8-step flow: 1) `modal secret create talla-endpoint-auth` 2) `modal deploy wan/stitch/yarngpt/tts` + stop parked 3) D1 migrate 4) `wrangler secret put` ×12 5) `wrangler deploy` → note `talla-api.<subdomain>.workers.dev` 6) `VITE_API_URL=... npm --prefix web run build && wrangler pages deploy web/dist --project-name talla --branch main` 7) set `ALLOWED_ORIGINS` → redeploy 8) `/api/health` verify (demo vs live flags + sample product → access code → calibration). Workers free-plan CPU risk noted (R2 base64). Rollback via `wrangler deployments list/rollback`.

---

## 2. Verdict: npm --prefix web run build WILL SUCCEED

**Test run (pwsh, no env set):**
`vite v6.4.5 building for production... ✓ 32 modules transformed ... dist/index.html 1.78kB | assets/index-TFSJu0IP.js 297.37kB (gzip 90.69kB) | assets/index-XZ7TDlnd.css 47.91kB — built in 10.20s`

- `web/dist` already exists with 17 image assets (agents/*webp) + js/css — reproducible.
- For **local dev** `VITE_API_URL` stays **empty** — `web/src/api.js` falls back to `/api` via Vite proxy to `http://localhost:8787`.
- For **production deploy** it **must be** `https://talla-api.<subdomain>.workers.dev` where `<subdomain>` is printed by `wrangler deploy` (step 5). Set as env BEFORE build (`\ = "..." ; npm --prefix web run build ; Remove-Item Env:VITE_API_URL`). Empty value would ship a broken same-origin Pages build that 404s on `/api`.

---

## 3. VITE_API_URL — what to set and when

- Current `web/.env` **does not exist** (correct — per .env.example it belongs in shell or web/.env, not root .env).
- Current production build in `web/dist` was built **without** VITE_API_URL (empty string baked in — dev mode).
- **Before WP-J Pages deploy:** after `wrangler deploy`, copy the Workers URL, re-build with it, then deploy. Example: `https://talla-api-xyz123.workers.dev` → `\="https://talla-api-xyz123.workers.dev"`.

---

## 4. Secrets required (12 + 2 optional talk)

**Worker secrets (set via interactive `wrangler secret put NAME` — never CLI args):**
1. `TALLA_ACCESS_CODE` — present in .env as `<access-code-redacted>` — header `X-Talla-Access`; unset = everyone demo-only
2. `MODAL_ENDPOINT_TOKEN` — present in .env as `<token-redacted>` — **must equal** Modal secret `talla-endpoint-auth/TALLA_ENDPOINT_TOKEN` (step 1) — sent as `X-Talla-Token` to every Modal endpoint
3. `BASETEN_API_KEY` — SET (b10_pxYO...)
4. `META_API_KEY` — SET (LLM_17766...)
5. `FIRECRAWL_API_KEY` — SET (fc-abeeb...)
6. `EXA_API_KEY` — SET (e55ea...)
7. `MODAL_WAN_ENDPOINT` — SET (https://akinspajo--talla-wan-generate-http.us-east.modal.run)
8. `MODAL_WAN_RESULT_ENDPOINT` — SET (…/generate-result)
9. `MODAL_STITCH_ENDPOINT` — SET (…/stitch-http)
10. `MODAL_STITCH_RESULT_ENDPOINT` — SET (…/stitch-result)
11. `MODAL_FILE_ENDPOINT` — SET (…/file-http) — serves finished media via `/api/media/file/:name`
12. `MODAL_YARN_ENDPOINT` — SET (…/yarngpt-speak-http) — Yoruba/Hausa/Igbo/Nigerian English
13. `MODAL_TTS_ENDPOINT` — SET (…/talla-tts-speak-http) — MMS Pidgin

**Optional talk (engine `talk` = InfiniteTalk — currently keyed-off until WP-C smoke passes):**
- `MODAL_TALK_ENDPOINT` + `MODAL_TALK_RESULT_ENDPOINT` — SET in .env (…/talk-generate-http) — only needed if deploying talk.

**Status:** `wrangler secret list` → `Worker "talla-api" not found` — **zero secrets uploaded yet** (Worker never deployed). All values available locally in `C:\Users\DELL\Downloads\Talla\talla\.env` — use them for `wrangler secret put`. **Never set** `TALLA_DEV_OPEN`, `CLOUDFLARE_*`, `R2_BUCKET`, `D1_DATABASE`, `PORT` as Worker secrets. Modal side also needs `huggingface-secret/HF_TOKEN` for talla-wan.

---

## 5. D1 migrations pending — 0002_hardening.sql BLOCKS live runs

**Current remote D1 state (PRAGMA table_info):**
- `projects` has **12 columns only**: id, name, description, url, category, audience, language, research, storyboard, script, status, created_at
- **Missing 4 columns added by 0002:** `persona TEXT, keyframes TEXT, segmentation TEXT, format TEXT` (+ `updated_at` handling)
- `jobs` has **8 columns**: id, project_id, stage, engine, status, progress, output_url, critic? Actually PRAGMA shows id, project_id, stage, engine, status, progress, output_url, critic... — **missing** `data TEXT, lock_until INTEGER, updated_at TEXT` + indexes `jobs_project` and unique `jobs_one_running_generate` and `credit_log_provider` index
- `credit_log` table exists.

**Required:** `npm --prefix worker run db:migrate` which runs:
`wrangler d1 execute talla --remote --file=infra/migrations/0002_hardening.sql`

File contains (in safe order):
`ALTER TABLE projects ADD COLUMN format TEXT;`
`ALTER TABLE jobs ADD COLUMN data TEXT; ADD COLUMN lock_until INTEGER; ADD COLUMN updated_at TEXT; CREATE INDEX jobs_project; CREATE UNIQUE INDEX jobs_one_running_generate ... WHERE status='running' AND stage='generate'; CREATE INDEX credit_log_provider;`
`ALTER TABLE projects ADD COLUMN persona TEXT; ADD COLUMN keyframes TEXT; ADD COLUMN segmentation TEXT;` — these last 3 may error `duplicate column name: persona/keyframes/segmentation` — **harmless** per docs (means last statements already applied; everything before them applied). Error on earlier statement = failure — re-check PRAGMA.

**Count:** 0 projects, 0 jobs — fresh.

---

## 6. usetalla.pages.dev vs talla.pages.dev — availability

- **Expected project name:** `talla` per `docs/deploy-checklist.md` step 6: `wrangler pages deploy web/dist --project-name talla --branch main` → domains `talla.pages.dev` + `main.talla.pages.dev` etc. **Goal override:** deploy to **`usetalla.pages.dev` (preferred) or `talla.pages.dev` fallback** → that means `--project-name usetalla` vs `--project-name talla`.
- **Current Pages projects on account (`wrangler pages project list`):** only `getrsch / getrsch.pages.dev` — **neither `talla` nor `usetalla` exists yet — both names are available to create** (first `pages deploy` creates the project).
- **DNS/probe:**
  - `usetalla.pages.dev` → **DNS NXDOMAIN** (no A/AAAA) — `Invoke-WebRequest` => *remote name could not be resolved* — **available, preferred**.
  - `talla.pages.dev` → **DNS resolves** (172.66.47.82, 172.66.44.174, 2606:4700:310c::…) — **but HTTP 500 error code 1101 (Cloudflare)** — not owned by this account (not in project list; likely taken/reserved or previously deleted project squatting the name). **Do NOT rely on fallback — use `usetalla`.**

**Recommendation:** create as `usetalla` (preferred). If you must keep `talla`, be prepared for name-collision and fall back to `usetalla`. After Pages deploy, set `ALLOWED_ORIGINS` to the real URL (comma-separated if you deploy both): `ALLOWED_ORIGINS="https://usetalla.pages.dev,https://talla.pages.dev"` — keep `http://localhost:5173` implicit.

---

## 7. Command sequence for WP-J (Worker + Pages Journey) — exact

Run from `C:\Users\DELL\Downloads\Talla\talla` in PowerShell. **Do NOT run yet — readiness check only.**

`powershell
# 0. Pre-flight (already verified)
# - D1 talla (14e2db4e...) + R2 talla-media exist; branch review-hardening; web build succeeds 10.2s

# 1. Modal auth secret — MUST be first (apps resolve at deploy time)
modal secret create talla-endpoint-auth TALLA_ENDPOINT_TOKEN=<paste-<token-redacted>>
# ensure huggingface-secret HF_TOKEN exists for talla-wan
modal secret list  # verify both

# 2. Deploy Modal apps (hardened code, parked stops)
modal deploy modal/wan_app.py        # → talla-wan: Wan 2.2 primary + LTX 2.5 fallback — note spawn+result URLs
modal deploy modal/stitch_app.py     # → talla-stitch: stitch + stitch_result + file_http — note file_http URL
modal deploy modal/yarngpt_app.py    # → talla-yarngpt — note speak_http URL (MODAL_YARN_ENDPOINT)
modal deploy modal/tts_app.py        # → talla-tts — note speak_http URL (MODAL_TTS_ENDPOINT)
modal app stop talla-h3              # parked since 2026-10-29
modal app stop talla-lipsync         # parked
# Optional for talk engine (keyed-off): modal deploy modal/talk_app.py

# 3. D1 migration (pending 0002)
npm --prefix worker run db:migrate
# Expect harmless "duplicate column name: persona" at end. Verify:
npx --prefix worker wrangler d1 execute talla --remote --command "PRAGMA table_info(projects); PRAGMA table_info(jobs);"

# 4. Worker secrets (interactive — paste from .env, never log)
wrangler secret put TALLA_ACCESS_CODE          # <access-code-redacted>
wrangler secret put MODAL_ENDPOINT_TOKEN       # <token-redacted> (same as step 1)
wrangler secret put BASETEN_API_KEY            # b10_pxYO...
wrangler secret put META_API_KEY               # LLM_17766...
wrangler secret put FIRECRAWL_API_KEY          # fc-abeeb...
wrangler secret put EXA_API_KEY                # e55ea86a...
wrangler secret put MODAL_WAN_ENDPOINT         # from step 2 wan spawn
wrangler secret put MODAL_WAN_RESULT_ENDPOINT  # from step 2 wan result
wrangler secret put MODAL_STITCH_ENDPOINT      # from step 2 stitch spawn
wrangler secret put MODAL_STITCH_RESULT_ENDPOINT # stitch result
wrangler secret put MODAL_FILE_ENDPOINT        # file_http
wrangler secret put MODAL_YARN_ENDPOINT        # yarngpt speak_http
wrangler secret put MODAL_TTS_ENDPOINT         # tts speak_http
# optional: wrangler secret put MODAL_TALK_ENDPOINT + MODAL_TALK_RESULT_ENDPOINT
wrangler secret list  # names only — verify 12

# 5. Deploy Worker — capture URL
wrangler deploy
# → https://talla-api.<subdomain>.workers.dev  (copy it!)

# 6. Build + Deploy Pages (preferred usetalla)
$env:VITE_API_URL = "https://talla-api.<subdomain>.workers.dev"
npm --prefix web run build
Remove-Item Env:VITE_API_URL
wrangler pages deploy web/dist --project-name usetalla --branch main
# Fallback if talla name required: --project-name talla

# 7. CORS — set to real Pages URL then redeploy
# Edit wrangler.toml [vars] ALLOWED_ORIGINS = "https://usetalla.pages.dev"
# or "https://usetalla.pages.dev,https://talla.pages.dev"
wrangler deploy

# 8. Verify (WP-J health)
curl.exe https://talla-api.<subdomain>.workers.dev/api/health
# without code: mode demo, access.authorized false, provider flags false
# with header X-Talla-Access: <access-code-redacted> → authorized true, mode live, providers baseten/meta/modal_*/r2/d1 true
# Open https://usetalla.pages.dev — Try sample product → research/storyboard/script (demo ) → enter access code → POST /api/access/check {authorized:true} → one-scene calibration before live generate
`

**Post-deploy notes:** Free Workers plan 10ms CPU can exceed on R2→base64 for large keyframe stills (WP-H note says far under budget per step, but docs § Risk says use Paid plan for live runs). Rollback: `wrangler deployments list/rollback`; Pages redeploy previous dist.

---

## 8. Gaps / blockers before WP-J

- [x] D1 + R2 already provisioned — OK
- [x] Modal endpoints URLs present in .env but **must be refreshed after fresh Modal deploys** (current .env values may be stale after hardening changes)
- [ ] **D1 migration not applied** — blocker for generate; run step 3
- [ ] **Worker not deployed** — secrets empty, `<subdomain>` unknown, health 404
- [ ] **ALLOWED_ORIGINS still placeholder** — will CORS-block Pages until step 7
- [x] **Web build ready** — no code changes needed
- [x] **Pages names checked** — `usetalla` free (use it), `talla` risky (500)
- [ ] Calibration runbook (CALIBRATION_RUNBOOK.md) judgment required before live generate — do not skip

**Overall readiness: 70% — infra exists + build green + secrets available locally, but D1 migration + Modal re-deploy + Worker deploy + Pages deploy remaining (WP-J steps 1–8). No spend incurred.**

