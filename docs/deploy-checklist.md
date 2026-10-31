# Talla — deploy checklist

> Rewritten 2026-10-30 for the hardened code (branch `review-hardening`).
> **Never commit or print secret values.** This file lists secret NAMES only.
> Run from `C:\Users\DELL\Downloads\Talla\talla` in PowerShell unless noted.
> Already provisioned on this account: D1 `talla`
> (`database_id = 14e2db4e-d6a4-4111-8e45-662df9267afd`, in `wrangler.toml`)
> and R2 bucket `talla-media` (binding `MEDIA`).

## 1. Create the Modal endpoint-auth secret (FIRST)
Every Modal app resolves `talla-endpoint-auth` at deploy time, so deploys fail
without it. Pick a long random token (keep it out of chat/logs); the same value
becomes the Worker secret `MODAL_ENDPOINT_TOKEN` in step 4.

```powershell
modal secret create talla-endpoint-auth TALLA_ENDPOINT_TOKEN=<token>
```
(Type the value yourself; do not paste it into scripts that log commands.)
`huggingface-secret` (key `HF_TOKEN`) must also exist for `talla-wan`.

## 2. Deploy the Modal apps; stop the parked ones
```powershell
modal deploy modal/wan_app.py       # talla-wan: Wan 2.2 (primary) + LTX 2.5 (fallback)
modal deploy modal/stitch_app.py    # talla-stitch: stitch + stitch_result + file_http
modal deploy modal/yarngpt_app.py   # talla-yarngpt: Yoruba/Hausa/Igbo/Nigerian English
modal deploy modal/tts_app.py       # talla-tts: MMS Pidgin
modal app stop talla-h3             # parked
modal app stop talla-lipsync        # parked
```
Copy the printed endpoint URLs: Wan spawn + result, stitch spawn + result +
`file_http`, YarnGPT `speak_http`, TTS `speak_http`. Each returns 401 without
`X-Talla-Token` — that is expected.

## 3. Migrate D1
Fresh database: `npm --prefix worker run db:remote` (full schema).
Already-provisioned database (this account):

```powershell
npm --prefix worker run db:migrate
```
A `duplicate column name` error on `persona`, `keyframes` or `segmentation`
is harmless — those are the last statements and everything before them has
applied. An error on an earlier statement means the file stopped early:
check with `wrangler d1 execute talla --remote --command "PRAGMA table_info(jobs);"`.
Local equivalent: `npm --prefix worker run db:migrate:local`.

## 4. Worker secrets (interactive prompt, never as CLI args)
```powershell
wrangler secret put TALLA_ACCESS_CODE
wrangler secret put MODAL_ENDPOINT_TOKEN          # same value as step 1
wrangler secret put BASETEN_API_KEY
wrangler secret put META_API_KEY
wrangler secret put FIRECRAWL_API_KEY
wrangler secret put EXA_API_KEY
wrangler secret put MODAL_WAN_ENDPOINT
wrangler secret put MODAL_WAN_RESULT_ENDPOINT
wrangler secret put MODAL_STITCH_ENDPOINT
wrangler secret put MODAL_STITCH_RESULT_ENDPOINT
wrangler secret put MODAL_FILE_ENDPOINT
wrangler secret put MODAL_YARN_ENDPOINT
wrangler secret put MODAL_TTS_ENDPOINT
wrangler secret list                               # names only
```
Optional overrides (code defaults are fine): `META_BASE_URL`, `MUSE_IMAGE_MODEL`,
`SAM_MODEL`, `MUSE_TRANSCRIBE_MODEL`.
**Never** set `TALLA_DEV_OPEN` on the deployed Worker. Do not upload
`CLOUDFLARE_*`, `R2_BUCKET`, `D1_DATABASE`, `PORT`.

## 5. Deploy the Worker
```powershell
wrangler deploy
```
Note the `https://talla-api.<subdomain>.workers.dev` URL.

## 6. Build and deploy Pages
```powershell
$env:VITE_API_URL = "https://talla-api.<subdomain>.workers.dev"
npm --prefix web run build
Remove-Item Env:VITE_API_URL
wrangler pages deploy web/dist --project-name talla --branch main
```
(First deploy creates the `talla` Pages project.)

## 7. CORS
Set `ALLOWED_ORIGINS` in `wrangler.toml` `[vars]` to the real Pages URL
(comma-separated if several; `http://localhost:5173` is always allowed),
then redeploy: `wrangler deploy`.

## 8. Verify
```powershell
curl.exe https://talla-api.<subdomain>.workers.dev/api/health
```
- Without a code: `mode: "demo"`, `access.authorized: false`, all provider flags false.
- Open the Pages site, click **Try a sample product**, run research → storyboard → script in demo mode ($0).
- Enter the access code in the Studio: it should report live mode unlocked
  (`POST /api/access/check` → `{ authorized: true }`) and `/api/health`
  provider flags (incl. `modal_file`, `modal_token`, `r2`, `d1`) turn true.
- Do not start a live generate until the one-scene calibration
  (`CALIBRATION_RUNBOOK.md`) has been judged.

## Risk: Workers free-plan CPU
With R2 bound, the Worker reads each keyframe still from R2 and base64-encodes
it before spawning Wan/LTX. On the Workers **free plan (10 ms CPU per request)**
that encode can exceed the limit for large stills. Use the **Workers Paid plan
for live runs**; demo mode is unaffected.

## Rollback
Worker: `wrangler deployments list`, `wrangler rollback`. Pages: redeploy a
previous `web/dist` or use the dashboard.
