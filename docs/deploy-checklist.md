# Talla — Cloudflare deploy checklist

> Prepared 2026-10-28. Wrangler 4.94.0, logged in as akinspajo@gmail.com.
> Status: **infra prepared, NOT deployed yet.** No Worker deploy, no Pages
> project creation, and no secret upload was done in the prep pass.
> **Never commit or print secret values.** This file lists secret NAMES only.
> Run all commands from `C:\Users\DELL\Downloads\Talla\talla` in PowerShell
> unless noted.

## Done in prep pass

- [x] D1 database created: name `talla`, region WEUR
  - `database_id = 14e2db4e-d6a4-4111-8e45-662df9267afd`
  - Reuse check: `wrangler d1 list` (only create again if `talla` is absent:
    `wrangler d1 create talla`)
- [x] `wrangler.toml` updated: `database_id` placeholder replaced with the ID
  above. R2 binding was already correct, unchanged:
  `[[r2_buckets]] binding = "MEDIA", bucket_name = "talla-media"`
  - No API keys were added to `wrangler.toml` (only non-secret `[vars]`:
    `BASETEN_BASE_URL`, `BASETEN_MODEL`).
- [x] Remote schema applied successfully:
  `wrangler d1 execute talla --remote --file=infra/schema.sql`
  - Result: 3 queries executed, `success: true`. Verified tables:
    `projects`, `jobs`, `credit_log` (+ internal `sqlite_sequence`, `_cf_KV`).
  - Re-running is safe (`CREATE TABLE IF NOT EXISTS`).
- [x] R2 bucket verified present: `talla-media` (`wrangler r2 bucket list`).
- [x] Pages check: `wrangler pages project list` — **no `talla` project exists**
  yet (only unrelated `getrsch`). Project was NOT created in prep pass.

## Remaining steps (in order)

### 1. (Only if missing on another account) Create the R2 bucket

Already exists on this account — skip unless `wrangler r2 bucket list` is empty:

```powershell
wrangler r2 bucket create talla-media
wrangler r2 bucket list
```

### 2. Upload Worker secrets — NAMES ONLY, interactive

`wrangler secret put` prompts for the value interactively (input is hidden).
Run each one and paste the value at the prompt. Do NOT pass values as CLI
arguments, do NOT `echo` them, and do NOT read/print `.env` to do this.
Skip any provider you are not using yet — the API degrades to demo mode
without keys (`GET /api/health` reports which providers are configured).

Required for live (non-demo) behaviour, from `talla\`:

```powershell
wrangler secret put BASETEN_API_KEY
wrangler secret put META_API_KEY
wrangler secret put FIRECRAWL_API_KEY
wrangler secret put EXA_API_KEY
wrangler secret put AVA_API_KEY
```

Optional fallback keys (only if the Modal/engine tests need them; the Worker
code does not currently read these directly):

```powershell
wrangler secret put MINIMAX_API_KEY
wrangler secret put YARNGPT_API_KEY
```

Modal endpoint URLs (not API keys). Set them once the Modal apps are deployed,
either as secrets (commands below) or as plain `[vars]` in `wrangler.toml`:

```powershell
wrangler secret put MODAL_TTS_ENDPOINT
wrangler secret put MODAL_VIDEO_ENDPOINT
wrangler secret put MODAL_STITCH_ENDPOINT
```

Also, only if overriding the code defaults
(`META_BASE_URL` defaults to `https://api.meta.ai/v1`,
`MUSE_IMAGE_MODEL` defaults to `muse-image-1.0`):

```powershell
wrangler secret put META_BASE_URL
wrangler secret put MUSE_IMAGE_MODEL
```

Do NOT upload these as Worker secrets: `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN` (deploy credentials for local tooling only),
`R2_BUCKET`, `D1_DATABASE`, `PORT` (names in `.env` for local use).

Verify names only (never prints values):

```powershell
wrangler secret list
```

### 3. Deploy the Worker (API)

`wrangler.toml` is at the repo root, so deploy from `talla\`:

```powershell
wrangler deploy
```

(Equivalent repo script — check it runs against the root `wrangler.toml`
before relying on it: `npm run deploy:api`.)

Verify (use the `*.workers.dev` URL printed by the deploy):

```powershell
curl.exe https://talla-api.<your-subdomain>.workers.dev/api/health
curl.exe https://talla-api.<your-subdomain>.workers.dev/api/credits
wrangler tail talla-api
```

Expected `/api/health`: `{ "ok": true, "service": "talla-api", ... }` with
`providers` booleans reflecting the secrets uploaded in step 2.

Re-apply the remote DB schema at any time (idempotent):

```powershell
wrangler d1 execute talla --remote --file=infra/schema.sql
```

### 4. Decide how Pages reaches the API — BLOCKER before Pages deploy

`web/src/App.jsx:3` has `const API = "";`, so the frontend calls same-origin
`/api/...`. Locally that works via the Vite proxy (`web/vite.config.js` →
`http://localhost:8787`). On Pages + a separate Worker it will 404 until one
of these is chosen:

- **Option A (quickest):** point the frontend at the Worker, e.g. set `API`
  in `web/src/App.jsx` to the deployed Worker URL from step 3, then rebuild.
  The Worker already sends permissive CORS (`cors()` in
  `worker/src/index.js:8`).
- **Option B:** serve `/api/*` from the Pages origin (Pages Function or
  route/proxy to the Worker) so `API = ""` stays correct.
- **Option C:** put both behind one custom domain with a Worker route for
  `/api/*`.

Pick one, implement it, and rebuild before step 5. Do not deploy Pages
before this is resolved or the deployed site cannot reach the API.

### 5. Build and deploy Pages (creates the `talla` project on first run)

```powershell
npm --prefix web run build
wrangler pages deploy web/dist --project-name talla --branch main
```

(Repo shortcut, same thing: `npm run deploy:web` — note it omits
`--branch main`, which can prompt interactively; prefer the explicit
command above.)

This first deploy creates the Pages project `talla`. Verify afterwards:

```powershell
wrangler pages project list
curl.exe https://talla.pages.dev/
```

Then open `https://talla.pages.dev/` and confirm the studio loads and
`/api/health` data appears (depends on step 4's choice).

### 6. Smoke-test the deployed stack

Against the Worker URL (demo mode spends $0; the keyframes step needs
`META_API_KEY` from step 2 and will fail/skip cleanly without it):

```powershell
$env:API_BASE = "https://talla-api.<your-subdomain>.workers.dev"
node scripts/smoke.mjs
Remove-Item Env:API_BASE
```

Or by hand: create a project, then research → storyboard → script →
generate in the Pages UI, and check:

```powershell
wrangler d1 execute talla --remote --command "SELECT id, name, status FROM projects ORDER BY created_at DESC LIMIT 5;"
```

### 7. Optional follow-ups

- Custom domains: `wrangler pages domain ...` / dashboard for Pages, and a
  Worker route or custom domain for `talla-api` if Option C was chosen.
- Rollback: `wrangler deployments list`, `wrangler rollback` (Worker);
  Pages: redeploy a previous `web/dist` build or use the dashboard.
- Re-check tables after any schema change:
  `wrangler d1 execute talla --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"`
