# Gemini Takeover Brief: Talla UGC Quality Pass

Written by Claude on 2026-11-03. Claude will review your work when its session resets, so leave evidence for every step (see section 9).

Read this whole file before touching anything. Follow it literally. When something here is marked UNVERIFIED, check the code first and tell me what you found; do not assume.

---

## 0. Goal

Make Talla's output look like the reference "winning UGC" ad:
`C:\Users\DELL\Downloads\Talla\winning-ugc_clip_1m00-3m00.mp4`

Compare against the last real render:
`C:\Users\DELL\Downloads\Talla\talla\data\demo\talla_demo_rcpt.mp4` (13.6 s, 1080x1920, 24 fps)

The reference ad has fast cuts (1.5-2.5 s), real human motion, one clean kinetic caption line, and crisp product UI. The last Talla film has a frozen-torso creator, hallucinated phone UI, subtitles that nearly touch, and one avatar in every talking scene.

---

## 1. Hard rules (do not break any of these)

1. **No Ken Burns / zoompan on still images, anywhere.** Not in the worker, not in scripts. The owner rejected it.
2. **Do not use Wan 2.2 in the pipeline.** It costs about $1.90 and 29 minutes per 5-second clip. It exists only as a silent fallback. Engines in use:
   - Talking scenes: InfiniteTalk, in `modal/talk_app.py` (H100, about $0.51 per clip).
   - B-roll: LTX 2.5, in `modal/wan_app.py` as `LTXEngine` (H200, max 3 containers; the file name says wan but we use the LTX class).
3. **Never print, log, commit, or paste any secret.** That means `X-Talla-Token`, `BASETEN_API_KEY`, the HF token, and all Modal/Cloudflare secrets. The token is currently hardcoded in `scripts/render_smart_ugc.py` and written in plain text in the old briefs. Replace it in code with `os.environ["TALLA_ENDPOINT_TOKEN"]` read from `talla/.env`, and never repeat its value in any file you write or any message.
4. **No paid renders without the owner's explicit "yes" in chat for that render.** A paid render is any call to talla-talk, talla-wan, talla-vc, talla-yarngpt, talla-image, or a full Worker job. Free work: editing code, running `node scripts/verify_api_chain.mjs`, `python -I scripts/verify_engine_wiring.py`, `npm --prefix web run build`, unit tests, ffmpeg on existing local files. Budget for the whole task: **$10 total**. Track every paid call and its cost in the log (section 9).
5. **Do not commit or push.** Leave all changes in the working tree. Do not create branches.
6. **Another session ("Deepseek continuation") has uncommitted edits in `worker/` and `modal/`:** parallel phases, `sceneEngines`, InfiniteTalk audio padding, LTX on H200 with tiling. Do not revert, reformat, or overwrite them. Make small targeted edits only. Before editing any file, run `git diff --stat` and `git diff <file>` and work on top of what is there.
7. **Never set `TALLA_DEV_OPEN` on the deployed Worker.**
8. **Do not touch** `max_containers`, GPU types, or Modal volumes. Another project (rsch) may call the LTX engine; leave limits as they are.
9. **Make no changes to the other repos or projects** (rsch, rcpt, Receiptgenerator, numbertold). Talla is standalone.
10. If a step's result is unclear or a test fails twice, stop and write down what you saw. Do not guess your way forward.

---

## 2. Orientation (do this first, no cost)

Run these and record results in the log:

1. `cd C:\Users\DELL\Downloads\Talla\talla`
2. `git status` and `git diff --stat` to see the uncommitted edits you must preserve.
3. Read, in this order:
   - `worker/src/index.js` (job state machine: keyframes, qc, voice, video_spawn, video_poll, critic, stitch_spawn/poll, verify, export; plus `sceneEngines`, `frameForScene`, `isBroll`, B-roll stills stored at slot `1000+n`).
   - `worker/src/personas.js` (avatars, locked voices, seeds, `keyframe_prompt`).
   - `worker/src/agents.js` (storyboard/script/critic prompts).
   - `modal/stitch_app.py` (caption burn-in, overlays, audio).
   - `modal/talk_app.py` (InfiniteTalk) and `modal/wan_app.py` (LTX).
   - `docs/CLAUDE_UGC_HANDOVER_BRIEF.md` (older context; parts are outdated, see section 8).
4. Open `data/demo/sheet.jpg` (contact sheet of the last film) so you know what the failures look like.

---

## 3. The five jobs, in order

Do them in this order. Finish and verify each before the next. All of 3.1 to 3.4 are free to build and test locally.

### 3.1 Subtitle fix (free)

**Problem:** the Pidgin line and the English line are stacked too tightly. They nearly overlap and wrap mid-phrase.

**Files:** `modal/stitch_app.py` (caption generation and burn-in), and wherever the worker builds the caption data (search `worker/src/index.js` for `caption`, `srt`, `ass`, `subtitle`; UNVERIFIED, find the real names).

**Do exactly this:**
1. Find where captions are produced and burned. Record the file, function, and the ffmpeg filter or ASS style used now.
2. Use an **ASS** subtitle file, not plain SRT, so the two languages are separate styled events:
   - Spoken line (Pidgin/Hausa/etc.): bold sans-serif, uppercase optional, 1080x1920 canvas, font size about 64 px in ASS PlayRes terms, white text with thick black outline (about 4), `Alignment=2`, bottom margin about 330 px from the bottom edge (keeps it inside the TikTok/Reels safe zone).
   - English line: same font, size about 44 px, color light yellow or light grey, outline about 3, `Alignment=2`, bottom margin about 250 px so there is a clear gap of at least 30 px between lines.
   - These two must be **separate Dialogue events with different styles and margins**, never one text block with a newline.
3. **No wrapping:** split each caption into chunks of at most 4-5 words and at most about 22 characters per rendered line. Time each chunk across its scene by word proportion of the scene's voice duration. If a chunk would still wrap at the chosen font size, shrink the chunk, not the font below 52.
4. Highlight style: one active word in yellow (`&H0000FFFF`), rest white, is optional. Skip it if it complicates timing. Safe, readable, non-overlapping text matters more than highlight effects.
5. Keep captions only in the last pass of stitching (one burn-in), so they are not double-burned.

**Verify (free):** build an ASS file from sample text in a scratch script, burn it over an existing local clip (for example `data/demo/talla_demo_rcpt.mp4`) with ffmpeg, extract 6 frames at different timestamps with `ffmpeg -ss T -i out.mp4 -frames:v 1 frame_T.png`, and look at them. Pass criteria: no overlap, no wrap, gap between lines at least 30 px, nothing in the bottom 200 px or the top 150 px. Save the frames in `data/qa/subtitles/`.

### 3.2 Four avatars, locked per project (free to build)

**Problem:** the worker never selects among the 4 avatars. All talking scenes reuse one woman in a green hijab. The same paper receipt is held in all talk scenes.

**Files:** `worker/src/personas.js`, `worker/src/index.js` (keyframes phase, `frameForScene`), `worker/src/agents.js` (storyboard agent), the web UI (`web/src/App.jsx`, `web/src/Home.jsx`) if a picker exists. Avatar images live in `web/public/avatars/` (for example `aisha.webp`).

**Locked voice anchors (already decided by the owner, do not change):**
| Avatar | Gender | Voice | Seed |
| --- | --- | --- | --- |
| Aisha | F | zainab | 2007 |
| Funmi | F | chinenye | 1421 |
| Ebuka | M | tayo | check personas.js |
| Tunde | M | umar | check personas.js |

**Do exactly this:**
1. Read `personas.js`. Confirm each persona has: `keyframe_prompt` (hair, skin, clothing, background), `seed`, and a locked `voice`. Report any mismatch with the table above instead of silently changing it.
2. Add a project-level field (for example `persona_id`) that is chosen once per project and stored in the DB/project object. Default if unset: the persona the project already uses today, so nothing breaks. UNVERIFIED: check the D1 schema (`schema.sql` or migrations) before adding a column. If a column is needed, add a migration file and tell the owner; do not run it against production yourself.
3. In the keyframes phase, every talking scene must build its prompt as: `persona.keyframe_prompt` (verbatim) plus a **shot suffix**, and use `seed: persona.seed` for all scenes of that persona. Never use a random seed or a freeform description for a face.
4. Shot suffixes (vary only camera and micro-action, never clothing, hair, or room):
   - Hook scene: close-up selfie framing, head and shoulders with room around the head, leaning slightly toward camera, wide-eyed confessional expression.
   - Middle talking scene: medium shot, head and shoulders, both hands visible and gesturing, expressive.
   - CTA scene: medium close-up, warm smile, small wave or nod.
   Use **head-and-shoulders with space around the head**, not a tight face crop. A tight selfie caused ghosting and extra eyes in the last render.
5. Remove the held paper receipt from talk-scene prompts. Product proof goes in B-roll only (section 3.3).
6. Make the UI (if a picker exists in `web/src`) show the 4 avatars and send the choice to the API. If no picker exists, add the smallest one possible: four selectable cards using the images in `web/public/avatars/`. Run `npm --prefix web run build` and make sure it passes.
7. Make sure the persona's locked voice is used for all that project's scenes (English/Pidgin direct YarnGPT; Hausa/Yoruba/Igbo via the voice-conversion step, see the older brief section 3).

**Verify (free):** run `node scripts/verify_api_chain.mjs` (expect `API_CHAIN_OK`) and `python -I scripts/verify_engine_wiring.py` (expect `ENGINE_WIRING_OK`). Add a small test or assertion in a scratch script that builds keyframe prompts for all four personas and shows: same `seed` and same `keyframe_prompt` prefix across scenes of one persona, only the suffix differs. Save the printed output in the log.

### 3.3 Real product screens, not AI screens (free to build, one paid test later)

**Problem:** LTX cannot draw readable UI. The last film's B-roll showed "Dinr Nicepts / 10 seconds", a melting QR, and swirling artifacts in the last second.

**Rule:** LTX makes **hands, phone, and room only**. The real rcpt UI is added in post.

**Files:** `worker/src/agents.js` (B-roll prompt text), `worker/src/index.js` (B-roll scene handling), `modal/stitch_app.py` (`overlay_cmd`, `pip` and `fullscreen` modes already exist; UNVERIFIED, read them first).

**Do exactly this:**
1. **Prompts:** rewrite the B-roll prompts so they never ask for readable text, app screens, QR codes, or receipts with writing. Use the phone with a **blank dark or solid-green screen facing the camera**, for example: "close-up of a Nigerian shopkeeper's hand holding a smartphone steadily, thumb tapping the screen, screen is plain solid dark green, shop counter softly blurred behind, handheld phone-camera feel, natural small hand movement". Add to the negative prompt: "text, letters, words, numbers, logo, UI, QR code, watermark".
2. **Assets:** create `data/proof/` and put in real rcpt screenshots or recordings (portrait). If the owner has not supplied any, generate clean mock screenshots with a small HTML page rendered by a headless browser (the rcpt receipt screen, a "payment verified" screen with a QR) and save them as PNG at 1080x1920 or smaller. Ask the owner in chat for real recordings and say what is missing. Do not invent brand claims; use the text already in the product copy.
3. **Compositing:** in stitch, for each B-roll scene, overlay the proof asset onto the LTX clip. Two supported modes:
   - `pip` (small phone-sized overlay in the middle) when the LTX clip has a phone in frame;
   - `fullscreen` proof cut for the last 0.8-1.2 s of the scene, so the viewer always sees crisp UI.
   Start with the **fullscreen cutaway for the second half of the B-roll scene**; it is the most robust since it does not need tracking the phone screen. Do not attempt corner-pin tracking in this pass.
4. **Artifact guard (important):** LTX degraded in the last second of the clip. Trim the final 0.5 s of every LTX clip before stitching, and have the critic reject any B-roll whose last 12 frames show swirling or melting (see 3.4).

**Verify (free):** composite one existing LTX clip from the last render (find it in the Modal outputs volume or in the local job output folder; if not available locally, use any 3-second test clip) with a proof PNG using ffmpeg, extract 4 frames, and confirm the UI text is readable and crisp. Save frames in `data/qa/proof/`.

### 3.4 Quality gate, audio loudness, retry safety (free to build)

**Files:** `worker/src/index.js` (critic and verify phases, `video_spawn`), `modal/stitch_app.py` (audio).

1. **Critic must gate.** Today verification came back "deferred" and the critic is advisory. Change it so a final film is marked `needs_review` (not `done`) when: any caption overlaps another, any B-roll has artifacts in its last frames, audio is clipped or too quiet, or the film is longer than 4 s on any single shot without a cut. A failed check must be visible in the job result, with the reason in plain words. Do not auto-rerender (that costs money); just flag it.
2. **Audio.** Add this at the final mix in `stitch_app.py` (keep it simple and apply it once on the voice track before the final mux):
   `highpass=f=80,afftdn=nf=-25,acompressor=threshold=-18dB:ratio=2.5:attack=15:release=100,loudnorm=I=-16:TP=-1.5:LRA=11`
   The older brief also lists a de-esser and equalizers; skip those until the owner has listened to a test. Reason: the voice samples peaked at exactly 1.0 (likely clipped), and changing tone too much risks making the muffled voice worse. Report the before/after loudness with `ffmpeg -i file -af ebur128 -f null -` for one existing clip.
3. **Idempotent `video_spawn`.** A retried step must not launch duplicate GPU jobs. Before spawning a scene's clip, check whether the job already stores a `call_id` for that scene, and reuse it. Record the call ids in the job state when spawning. Add a short comment explaining why.
4. **Pacing.** Support up to 2 shots per scene: when a talking scene's voice is longer than 4 s, cut to a short B-roll cutaway or a different crop of a different keyframe for the second half. Implement this only if 3.1-3.3 are done and verified; otherwise write it up as a proposal with the exact code location and stop.

**Verify (free):** `node scripts/verify_api_chain.mjs` and `python -I scripts/verify_engine_wiring.py` still pass; `npm --prefix web run build` passes. Show a diff summary.

### 3.5 One paid test render (needs the owner's "yes")

Only after 3.1 to 3.4 are done and verified, stop and ask the owner in chat:

> "3.1-3.4 are done and verified. One test render on the deployed Worker costs about $3.3 and takes about 16 minutes. Deploy and render?"

Wait for a clear yes. If yes:
1. Deploy only what changed. Web: `npm --prefix web run build` then `npx wrangler pages deploy web/dist --project-name usetalla --branch main`. Worker: `npx wrangler deploy`. Modal: `export PYTHONIOENCODING=utf-8 PYTHONUTF8=1; cd modal; modal deploy <file>.py` (Windows needs those env vars). Retry on network drops; the owner's internet is flaky. Wrangler or Modal timeouts are not code failures.
2. Run one render against `https://talla-api.rcpt.workers.dev` with the chosen persona and a 4-5 scene storyboard. Use the render script pattern from the earlier session: a small Node script that creates a project, runs research, storyboard, script, then generate with engine `talk`, and polls `GET /api/jobs/:id` (each poll advances one step; keep polling every few seconds, retry GETs on network errors).
3. Save the result to `data/demo/talla_demo_v2.mp4` and a 1-fps contact sheet to `data/demo/sheet_v2.jpg`.
4. Do not run a second render without asking again.

---

## 4. Things NOT to do in this pass (to keep scope small)

- Do not try Fish Speech, Seed-VC changes, or new voices.
- Do not try to fix the frozen torso of InfiniteTalk yet. The only allowed change is the framing in 3.2 (head and shoulders with room around the head). A separate A/B of keyframes and seeds comes later with the owner's approval.
- Do not build a screen-tracking pin; use cutaways.
- Do not touch the Hausa side script `scripts/render_smart_ugc.py` except to remove the hardcoded token (rule 3). It is secondary. I already replaced its Ken Burns code with an LTX call; leave that as is. If the token replacement changes its behavior, note it.

---

## 5. Definition of done

- Subtitles: two separate styled lines, no overlap, no wrap, gap at least 30 px, inside safe zones, verified on extracted frames.
- Avatars: 4 personas selectable per project, one persona's face/seed/voice constant across its scenes, head-and-shoulders framing, no repeated held receipt.
- B-roll: LTX prompts contain no UI/text asks; real proof assets composited; last 0.5 s of LTX trimmed; tested on one local clip.
- Gate: job result shows `needs_review` with reasons when checks fail; loudnorm applied and measured; video_spawn is idempotent.
- All three verifiers pass; web builds.
- No secrets in any file. No commits.
- Log written (section 9).

---

## 6. If you get stuck

- Missing info (for example no rcpt screenshots, unknown DB column): ask the owner in chat, list exactly what is missing, and continue with the other steps.
- Two failures on the same problem: stop, write both error messages and what you tried to the log, and move on to the next step.
- Network drops (Modal, Cloudflare unreachable): retry with a pause. Do not treat it as a code bug.

---

## 7. Cost table for reference

| Item | Cost |
| --- | --- |
| InfiniteTalk clip (H100) | about $0.51 |
| Full 5-scene film on deployed Worker (3 talk + 2 LTX) | about $3.3, about 16 min |
| Wan 2.2 clip | about $1.90, about 29 min (do not use) |
| Image generation (Z-Image-Turbo) | about $0.005 each |
| Voice synthesis | pennies per scene |

---

## 8. Known corrections to the older brief (`docs/CLAUDE_UGC_HANDOVER_BRIEF.md`)

- It says to use Wan 2.1 with `image_url` and `mode: i2v`. The deployed engine takes `keyframe_b64` or `keyframe_url`, `engine` (`wan` or `ltx`), `prompt`, `seconds`. We use `ltx`.
- It describes `render_smart_ugc.py` as the production path. The production path is the Worker state machine (`worker/src/index.js`). The script is a side experiment for the Hausa storyboard.
- Its subtitle size and margin values (font 24, MarginV 120) are too small and too low for 1080x1920. Use section 3.1 values.
- Its full audio chain includes a de-esser and EQ boosts. Hold those until the owner listens to the simpler chain in 3.4.

---

## 9. What to leave for Claude's review

Create `talla/docs/GEMINI_WORK_LOG.md` and keep it updated as you go. It must contain, per step (3.1 to 3.5):

1. Status: done / partial / blocked.
2. Files changed (path and one line on what changed).
3. Commands run and the exact result lines (pass/fail), never including secrets.
4. Paths of evidence: extracted frames, contact sheets, audio measurements.
5. Money spent so far, itemized.
6. Open questions for the owner and for Claude.
7. Anything that deviated from this brief, and why.

At the end, run `git status` and `git diff --stat` and paste the output in the log, so Claude can review exactly what changed.

Claude will check: the log against the actual diff, the evidence frames, the verifier outputs, and, if a render was approved, the final film against the reference ad.
