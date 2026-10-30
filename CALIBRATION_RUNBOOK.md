# Calibration Runbook — Wan 2.2 first scene (then LTX 2.5)

Goal: prove ONE confession scene end-to-end before spending on full films.
H3 is parked — never select or submit it. Engines: `wan` (primary), `ltx` (fallback).

## Preconditions (all verified 2026-10-29, zero spend)
- Modal app `talla-wan` deployed (marker `wan-ltx25-upgrade-2026-10-29`); `talla-stitch` deployed.
- Modal secret `huggingface-secret` (key `HF_TOKEN`) attached; LTX-2.5 repo access returns HTTP 200.
- Locked Funmi v4 keyframe: `data/funmi_keyframe_v4_url.txt` (1280×1920 WebP data URL).
- Voice object present in Modal volume `talla-outputs`: `yarn_1793287035.wav` (8.69s Yoruba).
- `.env` has MODAL_WAN_ENDPOINT / MODAL_WAN_RESULT_ENDPOINT / MODAL_STITCH_ENDPOINT (+ result) / MODAL_YARN_ENDPOINT (`node scripts/calibrate_wan.mjs --dry` confirms).

## Run (spends Modal GPU credits — one Wan scene only)
1. Start the API server (it is NOT usually running):
   `cd worker; node src/local.js`  (listens on http://localhost:8787)
2. In a second shell: `node scripts/calibrate_wan.mjs`
   - Creates a fresh `confession` project (Funmi, Yoruba), runs research → storyboard → script,
     seeds the locked keyframe (no Muse charge), SAM-QCs scene 1,
     spawns exactly ONE Wan scene, stitches with the verified voice + captions + AI label.
   - First run downloads Wan 2.2 weights — allow up to ~25 min (script polls that long).
3. State lands in `data/calibration_wan.json` (project id, clip + final volume paths).

## Judge (zero extra spend)
4. Pull the film: `modal volume get talla-outputs <final_volume_path> data/calibration_film.mp4`
5. Inspect: `python scripts/inspect_film.py data/calibration_film.mp4 data/calibration_frames`
   - Verdict checklist: face/motion reads as natural talking-head UGC (compare `data/ref_frame_*.png`);
     voice is script-exact and in sync enough for voiceover format; captions + AI label present;
     loudness sane (~ -27 LUFS reference); `tail_frame_ssim` — >0.995 means the ~2s held-frame tail
     is visible (voice 8.69s > Wan 6.7s cap): acceptable under CTA line, reject under emotive lines.
     Future scripts are protected by ENGINE CAPS prompting (≤6s lines) regardless.
6. If PASS: run one LTX 2.5 scene the same way (engine `ltx`), inspect, then recalibrate
   `modal:ltx_clip` cost in `worker/src/credits.js` from Modal's actual usage — "cheapest"
   must become a measured fact before LTX is recommended in the Studio.
7. Record the verdict in `SESSION_COORDINATION.md` and `TALLA_MASTER_PLAN-2.md` §14d.

## Do not
- Do not run `/generate` with `engine: "h3"` expecting H3 — the route normalises to Wan by design.
- Do not make hosted YarnGPT calls to "check" voices; the volume voice above is the verified one.
- Do not regenerate Funmi's keyframe; the v4 still is user-locked.
