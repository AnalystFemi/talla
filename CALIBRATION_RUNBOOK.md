# Calibration Runbook — Wan 2.2 first scene (then LTX 2.5)

Goal: prove ONE confession scene end to end before spending on full films.
Engines: `wan` (primary), `ltx` (fallback). H3 and lipsync are parked — never submitted.

## Preconditions
- Modal secret `talla-endpoint-auth` (key `TALLA_ENDPOINT_TOKEN`) exists, and `talla-wan` + `talla-stitch` are deployed from the hardened code (Wan health marker `wan-720p-hardening-2026-10-30`).
- Modal secret `huggingface-secret` (key `HF_TOKEN`) attached; LTX-2.5 repo access accepted.
- Locked Funmi v4 keyframe: `data/funmi_keyframe_v4_url.txt` (WebP data URL).
- Voice object in Modal volume `talla-outputs`: `yarn_1793287035.wav` (8.69 s Yoruba).
- `.env` contains `TALLA_ACCESS_CODE`, `MODAL_ENDPOINT_TOKEN` (same value as the Modal secret), `MODAL_WAN_ENDPOINT`, `MODAL_WAN_RESULT_ENDPOINT`, `MODAL_STITCH_ENDPOINT`, `MODAL_STITCH_RESULT_ENDPOINT`, `MODAL_YARN_ENDPOINT`, plus `BASETEN_API_KEY` / `META_API_KEY` for the live brain stages and SAM QC.
- `node scripts/calibrate_wan.mjs --dry` prints the endpoint/token/access flags and spends $0 (no API or Modal request).

## Run (spends Modal GPU credits — one Wan scene)
1. Start the API (loads `.env`): `npm run dev:api` → http://localhost:8787.
2. In a second shell: `node scripts/calibrate_wan.mjs`
   - Through the API (sends `X-Talla-Access`, so these go through the credit guard): creates a fresh `confession` project (Funmi, Yoruba), runs research → storyboard → script, seeds the locked keyframe for scene 1 (no Muse charge) and SAM-QCs it.
   - **Directly against Modal** (sends `X-Talla-Token`; bypasses `/generate` and the credit guard, so these spends are NOT in `credit_log`): spawns exactly ONE Wan clip at `min(script seconds, 5.0)` and polls the result endpoint every 10 s (up to 25 min, first run loads Wan weights), then spawns one stitch with the verified voice `yarn_1793287035.wav`, captions and AI label.
3. State lands in `data/calibration_wan.json` (project id, clip + final volume paths).
4. Log the Modal spend for both calls by hand from the Modal dashboard.

## Known limit: held-frame tail
Wan is capped at 81 frames @ 16 fps (5.0 s). The calibration voice is 8.69 s, so stitch pads the picture with a held (cloned) frame for the last **~3.6 s**. That is a poor test of motion quality. **Owner decision (2026-10-30):** calibrate Wan with a SHORT line (≤5 s, ~10–11 words) and run one LTX 2.5 scene as well. Results are recorded by the person running the calibration, not in this runbook.

## Judge (zero extra spend)
5. Pull the film: `modal volume get talla-outputs <final_volume_path> data/calibration_film.mp4`
6. Inspect: `python scripts/inspect_film.py data/calibration_film.mp4 data/calibration_frames`
   - Face/motion reads as natural talking-head UGC (compare `data/ref_frame_*.png`).
   - Voice is script-exact; captions + AI label present; output is 1080x1920, 24 fps, 48 kHz stereo.
   - `tail_frame_ssim` > 0.995 means a held-frame tail is visible (expected with the 8.69 s line).
7. If PASS: run one LTX 2.5 scene, inspect, then replace the `modal:wan_clip` / `modal:ltx_clip` estimates in `worker/src/credits.js` with measured cost.
8. Record the verdict in `SESSION_COORDINATION.md` and `TALLA_MASTER_PLAN-2.md` §14e.

## Do not
- Do not post `engine: "h3"` expecting H3 — the route normalises to Wan.
- Do not make hosted YarnGPT calls to "check" voices.
- Do not regenerate Funmi's keyframe; the v4 still is user-locked.
