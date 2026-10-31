# Calibration Runbook — InfiniteTalk (primary) + Wan 2.2 / LTX 2.5 (fallbacks)

Goal: prove ONE confession scene end to end before spending on full films.
Engines: `talk` (InfiniteTalk primary, lip-synced, any length), `wan` (silent fallback, ≤5 s), `ltx` (gated fallback). H3 and lipsync parked — never submitted.
**Proven 2026-10-31:** `talk` 5.027 s Yoruba in 483.6 s wall (125 frames @ 25 fps, 448×832 → 1080×1920 final in 28.5 s, ~$0.53). See `data/calibration_engines.json`.

## Preconditions
- Modal secret `talla-endpoint-auth` (key `TALLA_ENDPOINT_TOKEN`) exists, and `talla-talk` + `talla-wan` + `talla-stitch` are deployed (health markers `wan-720p-hardening-2026-10-30` + `talla-talk` diffusers shim).
- Modal volume `talla-talk-weights` populated (`modal run modal/talk_app.py::download` once, ~93 GB, CPU).
- Locked Funmi keyframe: `data/funmi_keyframe_v4_url.txt` (WebP data URL).
- Voice object in Modal volume `talla-outputs`: `yarn_1793393529_17112a4c.wav` (5.027 s Yoruba, used for Talk smoke test) and `yarn_1793287035.wav` (8.69 s, Wan legacy).
- `.env` contains `TALLA_ACCESS_CODE`, `MODAL_ENDPOINT_TOKEN`, `MODAL_TALK_ENDPOINT` + `_RESULT`, `MODAL_WAN_ENDPOINT` + `_RESULT`, `MODAL_STITCH_ENDPOINT` + `_RESULT`, `MODAL_FILE_ENDPOINT`, `MODAL_YARN_ENDPOINT`, plus `BASETEN_API_KEY` / `META_API_KEY`.
- `node scripts/calibrate_engines.mjs --dry` prints endpoint/token/access flags and spends $0.

## Run (spends Modal GPU credits — one scene)
1. Start the API (loads `.env`): `npm run dev:api` → http://localhost:8787.
2. In a second shell:
   - **Talk (primary, recommended):** `node scripts/calibrate_engines.mjs --only=talk --voice=yarn_1793393529_17112a4c.wav:5.027` — spawns ONE Talk clip (voice-driven, 25 fps, no 5 s cap) + stitch (keeps clip audio, no re-mux). Wall ~8 min cold, ~1–2 min warm.
   - **Wan (fallback, silent):** `node scripts/calibrate_engines.mjs --only=wan` — spawns ONE Wan clip at `min(script seconds, 5.0)` + stitch (muxes WAV). Wall ~29 min for 5 s.
   - Through the API for Talk/Wan direct Modal path (sends `X-Talla-Token`; bypasses `/generate` credit guard — log Modal spend by hand).
   - Or via Worker: `node scripts/calibrate_wan.mjs` creates `confession` project (Funmi, Yoruba), research → storyboard → script, seeds keyframe, SAM-QC, then generates via `/generate` (goes through credit guard).
3. State lands in `data/calibration_engines.json` (runs.talk / runs.wan, clip + final volume paths) and legacy `data/calibration_wan.json`.
4. Log Modal spend for both calls by hand from Modal dashboard and update `worker/src/credits.js` (`talk_clip` now $0.60 measured).

## Known limits
- **Talk:** 480p bucket (448×832) upscaled to 1080×1920 — review sharpness; `talk-720` is option if soft, but costs more.
- **Wan:** capped at 81 frames @ 16 fps (5.0 s) — voice longer than 5 s gets held-frame tail (~3.6 s for 8.69 s voice). Calibrate Wan with SHORT line (≤5 s, ~10–11 words).

## Judge (zero extra spend)
5. Pull the film: `modal volume get talla-outputs <final_volume_path> data/calibration_film.mp4` (use `PYTHONUTF8=1` on Windows)
6. Inspect: `python scripts/inspect_film.py data/calibration_film.mp4 data/calibration_frames`
   - Face/motion reads as natural talking-head UGC (compare `data/ref_frame_*.png`); for Talk, lips follow Yoruba line.
   - Voice is script-exact; captions + AI label present; output 1080×1920, 24 fps, 48 kHz stereo; single audio track (Talk clip audio kept, not doubled).
   - `tail_frame_ssim` > 0.995 means held-frame tail visible (Talk has none — voice length = clip length).
7. If Talk PASS: Talk is default (switched 2026-10-31). Wan/LTX remain selectable fallbacks. Update `CREDITS.md` and `README.md`.
8. Record verdict in `SESSION_COORDINATION.md` and `TALLA_MASTER_PLAN-2.md` §14e.

## Do not
- Do not post `engine: "h3"` expecting H3 — the route normalises to Talk/Wan.
- Do not make hosted YarnGPT calls to "check" voices.
- Do not regenerate Funmi's keyframe; the v4 still is user-locked.
