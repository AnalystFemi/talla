# Talla: full build brief for Muse Wonder

Written 2026-10-31. This is everything needed to take Talla from its current state to a finished hackathon demo. It covers the Studio UI, the video engine, every open fix, and the deploy.

Each work package says what to do, which files to touch, and how to know it's done. Work through them in the order given in section 4.

---

## 0. What Talla is

Talla is an AI UGC (user-generated-content style) video team for Nigerian businesses. A business owner describes their product. Five AI agents then do the rest:

- The **Researcher** studies the market.
- The **Scriptwriter** writes a storyboard and script in **Pidgin, Yoruba, Hausa, Igbo or Nigerian English**.
- **Voice** speaks it with open Nigerian TTS.
- The **Critic** leaves advisory notes.
- The **Editor** stitches a captioned 9:16 film with an "AI-generated" label.

The output is a ready-to-post vertical advert plus caption and hashtags.

- Built for a Meta hackathon. The total budget is **$50**: Baseten $20, Meta $15, Modal $10, Firecrawl + Exa $5.
- The demo product is **rcpt**, a receipt app for WhatsApp/Instagram vendors. rcpt is the product Talla is tested on. Keep it as the "Try a sample product" example.

## 1. Rules you must follow

1. **Never print, log or commit secret values.** `.env` holds real keys. Read key names only. `.env.example` lists the names.
2. **Demo safety.** Anyone without the access code gets demo mode. A demo request must never reach a paid provider (Baseten, Meta, Modal, Firecrawl, Exa). In `worker/src/index.js`, the middleware swaps in `demoEnv()` (paid keys stripped) for unauthorised callers. A demo job is always stepped with the demo env (`GET /api/jobs/:id`). Don't weaken either.
3. **Access code.** The browser sends header `X-Talla-Access`, which the Worker checks against secret `TALLA_ACCESS_CODE`. `TALLA_DEV_OPEN=1` is for local only and never in production.
4. **Modal endpoint auth.** Every Modal web endpoint requires header `X-Talla-Token`, checked against the Modal secret `talla-endpoint-auth` (key `TALLA_ENDPOINT_TOKEN`). The Worker holds the same value in `MODAL_ENDPOINT_TOKEN`. A 401 must happen before any GPU is spawned.
5. **Budget guard.** Every paid call goes through `assertBudget(provider, op)` in `worker/src/credits.js`, with D1-backed totals. A new engine needs a cost estimate there.
6. **Brand.** Don't copy Riverside's logo or waveform mark. The layout is inspired by https://riverside.com/agents; the look is Talla's own (see section 3).
7. **Honest claims.** UI copy must match what the pipeline really does. Examples: the critic is advisory, and verify only checks the first voiced scene. If you change the engine, change the copy.
8. Branch `review-hardening`. Commit in small, labelled commits. Don't push or deploy without the owner's go-ahead.

## 2. Repo map and how to run

The repo is `C:\Users\DELL\Downloads\Talla\talla`.

| Path | What it is |
|---|---|
| `worker/src/index.js` | Hono API: access middleware, project routes, async job step machine, media proxy routes |
| `worker/src/agents.js` | Research / storyboard / script / critic / export agents, plus demo fallbacks |
| `worker/src/providers.js` | Provider calls: Baseten, Meta Muse Image (`/images/generations`, `/images/edits`), Modal (`modalCall`, `modalPollOnce`) |
| `worker/src/credits.js` | Budget estimates and D1 credit log |
| `worker/src/local.js` | Local Node server for the Worker (port 8787) |
| `worker/migrations/` | D1 migrations (0002 must be applied on deploy) |
| `web/src/Home.jsx` | Landing page (**approved by owner, keep it**) |
| `web/src/App.jsx` | Studio (**owner says it's cluttered; rework it, see WP-A**) |
| `web/src/api.js` | API helper, access code and job storage (**do not change its behaviour**) |
| `web/src/content.js` | Copy, agents, personas, engines, model badges |
| `web/src/styles.css` | All styles and design tokens |
| `web/public/agents/*-cut.webp`, `*-lg.webp` | 3D agent head cutouts (small / 800px) |
| `modal/wan_app.py` | `talla-wan`: Wan 2.2 I2V A14B (primary today) and LTX 2.5 (fallback, blocked) |
| `modal/talk_app.py` | **NEW, not deployed:** `talla-talk` InfiniteTalk lip-sync engine (WP-C) |
| `modal/stitch_app.py` | `talla-stitch`: ffmpeg normalise to 1080x1920 at 24 fps with AAC 48 kHz, captions, AI label, concat; `file_http` serves volume files |
| `modal/yarngpt_app.py` | `talla-yarngpt`: YarnGPT2 voices for Yoruba, Hausa, Igbo and English |
| `modal/tts_app.py` | `talla-tts`: MMS voice for Pidgin |
| `modal/talla_common.py` | Token check, safe names, `poll_call`, `cancel_call`, R2 upload fallback |
| `scripts/verify_api_chain.mjs` | End-to-end API test against the local worker (demo, $0) |
| `scripts/verify_engine_wiring.py` | Offline engine / ffmpeg wiring check |
| `scripts/calibrate_engines.mjs` | Paid engine calibration (calls Modal directly) |
| `scripts/inspect_film.py` | Inspects a rendered film (size, fps, loudness) |
| `docs/ltx-setup.md` | Owner steps to unlock LTX on Hugging Face |
| `data/calibration_engines.json` | Measured engine timings |

**Run locally (demo, $0).** Copy `.env` to a demo env without the paid keys, or set no access code.

```
node worker/src/local.js        # API on :8787
npm --prefix web run dev        # Studio on :5173 (Vite proxies /api to :8787)
```

**Checks that must pass before any commit:**

```
npm --prefix web run build
node scripts/verify_api_chain.mjs          # expects API_CHAIN_OK, spend=$0
python scripts/verify_engine_wiring.py     # expects ENGINE_WIRING_OK
```

## 3. Design system (owner-approved, "Ankara Bold")

- **Colours** (tokens already exist in `styles.css` `:root`):
  - White `#FFFFFF` for page backgrounds.
  - Ink `#111111` for text and dark sections; dark cards `#1C1C1F`.
  - **Indigo `#3B2BFF`** is the primary colour (buttons, progress, live state).
  - **Coral `#FF5A5F`** is a tiny accent only (dots, small labels, one underline). No green anywhere.
- **Ankara strip:** an inline-SVG geometric band (diamonds and triangles) used as section dividers. It's already in `Home.jsx`.
- **Fonts:** **Bricolage Grotesque** 700/800 for headings, **DM Sans** for body. Both are loaded in `web/index.html`. No other fonts.
- **Shape:** pill buttons, cards with 16–20px corner radius, soft shadows on white, an 8px spacing scale.
- **Motion:** purposeful and quick (200–300ms ease-out). **Everything must switch off under `prefers-reduced-motion`.**
- **Agents:**
  - Five 3D heads: Researcher (blue), Scriptwriter (orange), Voice (pink with headset), Critic (green), Editor (purple).
  - Use the `*-cut.webp` files for small sizes and `*-lg.webp` for large ones.
  - The heads are the personality of the product. Animate them: float, bob while working, wiggle on hover.

---

## 4. Work packages (in this order)

### WP-A: Studio redesign (highest priority, owner request)

**Owner feedback:** the landing page is fine. The Studio is "clustered and just one-line stuff". It needs fluidity and should feel like a modern app.

**Current state:** a previous agent was stopped part-way through, so `web/src/App.jsx` is uncommitted.

- Already there: a three-column shell with a left `rail`, a `workspace` that shows one stage at a time, a right `activity` panel, skeletons, research cards and scene cards.
- Not verified: `styles.css` may be incomplete for these classes, and nothing has been visually checked.
- Start by running the Studio and screenshotting it, then decide whether to refine or rebuild.

**Must keep exactly (behaviour):**
- Every API call and its order.
- Access-code flow (`/api/access/check`), demo/live banner, budget-guard (402) messages.
- Job polling every 5s, resume after reload (`getStoredJob`), 409 "already running" handling.
- Storyboard PUT (save only) vs POST (regenerate, with confirm if there are unsaved edits).
- Auto-save before writing the script.
- Posting package copy and download.
- All aria attributes and labels, and focus moving to the stage title on stage change.
- `api.js` unchanged.

**Target experience:**
1. **App shell.**
   - Slim top bar: logo, "Studio", a live/demo status pill, access-code button, credits summary.
   - Left rail (desktop, about 260px): the 6 steps (Product, Research, Storyboard, Script, Film, Post). Each shows its agent head and a live state (done ✓, running with animated progress, ready, waiting). The team heads sit underneath and bob when working.
   - Main workspace: one stage at a time.
   - Right activity panel (about 320px): a chat-style feed of agent messages with typing dots while an agent works. It collapses into a drawer on smaller screens.
   - Mobile (≤ 768px): the rail becomes a horizontal stepper at the top, activity becomes a bottom sheet, and the primary action sits in a sticky bottom bar.
2. **Product stage.**
   - Not a bare form. Show a welcoming hero card with the five heads and "Try a sample product (rcpt)".
   - Group the form into clear cards: product, audience and language, format, creator.
   - Language as segmented pills, not a dropdown.
   - Format and persona as visual choice cards. Persona cards show the face thumbnail if available; otherwise use initials.
3. **Research stage.**
   - A 2-column grid of cards: pain points (numbered), desires (chips), hooks (quote cards, each with a "use as opening" affordance that only fills the UI, no new API), and angles (chips).
   - Staggered entrance and shimmer skeletons while loading.
4. **Storyboard stage.**
   - A horizontal scroll strip on desktop, or a grid, of **9:16 scene cards**. Each card has a thumbnail slot (the keyframe when it exists), the scene number and purpose, the spoken line edited inline, a seconds stepper, and a "Camera & shot" expandable section.
   - Summary chips at the top: scenes, total seconds, proof overlays, unsaved edits.
   - Sticky action bar: Regenerate · Save edits · Write script.
5. **Script stage.** A clean screenplay view: scene slug and seconds, the action line in muted text, the character name, and the spoken line large. Add a play button per line only if a voice preview exists.
6. **Film stage.**
   - Run settings card: engine selector as cards rather than a select (see WP-C for the engines), and a calibration choice (scene 1 / first 2 / first 3 / full).
   - Voice preview card with an audio player.
   - Keyframe grid with SAM QC badges.
   - A **job card**: big progress ring or bar, current step text, elapsed timer, per-scene clip cards with video players, critic badges, failed-scene notices, and the final film player prominent at the top when done.
   - "Models in this run" collapsible.
7. **Post stage.** A caption card with copy buttons, hashtag chips that copy on click, a checklist with real checkboxes (local state only), and download .txt.
8. **States everywhere.**
   - Empty states use the relevant agent head and one sentence.
   - Loading uses shimmer skeletons, never plain "Loading…".
   - Errors show as a friendly inline card with a retry where it makes sense.
9. **Motion.**
   - Stage transitions: fade plus 12px slide, direction-aware (forward or back).
   - Card stagger at 40–60ms.
   - Hover lift on cards: translateY −2px plus shadow.
   - Animated progress on the running rail step; head bob while working; smooth expand and collapse (grid-rows or height transition).
   - All disabled under reduced motion.
   - Animate only transform and opacity.

**Done when:**
- `npm --prefix web run build` passes, and the page has no horizontal scroll at 1440, 1024, 768 and 375px.
- A full demo run works in the browser against the local worker: create project with rcpt, research, storyboard, edit a scene, save, script, film stage, post package (demo).
- Screenshots of every stage at desktop and 375px have been reviewed against this spec.
- Keyboard-only navigation works through the whole flow, and colour contrast meets 4.5:1 for text.

### WP-B: Homepage polish (small)

`web/src/Home.jsx` and `styles.css`. The owner approved this page, so make only these fixes:
1. In the hero demo panel, text briefly overlaps (the "Storyboard ready" message shows behind the Editor card mid-animation). Make the message loop swap cleanly with no overlap at any frame.
2. In the final CTA, the giant "talla" wordmark has heads covering parts of the "t" and "a". Reposition them so the word stays readable.
3. Update engine copy once WP-C lands. "How it works" step 07 currently says "Silent motion, voice muxed at stitch · Wan 2.2 (primary) / LTX 2.5 (fallback)". Also update `PIPELINE`, `ENGINES` and `MODEL_BADGES` in `content.js`.

### WP-C: Lip-synced video engine, InfiniteTalk (core quality fix)

**The problem.** Wan 2.2 and LTX are *silent* motion engines. The persona's mouth moves but doesn't match the Yoruba/Pidgin line, and clips are capped near 5s. Wan is also very slow. Measured on an H100 on 2026-10-30, in `data/calibration_engines.json`:
- A 5s clip (81 frames at 16 fps, 720x1280) took **1737.9s, about 29 min, about $1.90**.
- A 2.2s clip took 650.8s.
- Stitch took about 54–128s.
- At this rate a 30s film is unaffordable on the $10 Modal budget.

The picture quality was good: clean keyframe, consistent face.

**The fix (research done 2026-10-30): switch to audio-driven lip-sync.**
- **InfiniteTalk** (MeiGen-AI, Apache-2.0, not gated) animates the keyframe from the voice WAV. Lips follow the audio, and clip length equals the voice length, up to 40s.
- Settings: 480p bucket, lightx2v 4-step LoRA.
- Estimated about 1–2 min per 5s scene warm on an H100. **This is not measured yet; the smoke test decides.**

**What's already done:** `modal/talk_app.py` (app `talla-talk`) is written but **not deployed or tested**.
- Source pinned to InfiniteTalk commit `50aa0a94184315407a991ae804d9b58d6d311ba8`. The image uses torch 2.4.1 cu121, xformers 0.0.28 and the flash-attn 2.7.4.post1 wheel.
- Weights go on volume `talla-talk-weights`, downloaded by a CPU function `download()`:
  - Wan2.1-I2V-14B-480P (82 GB)
  - chinese-wav2vec2-base, plus `model.safetensors` from `refs/pr/1`
  - InfiniteTalk `single/infinitetalk.safetensors` (10 GB)
  - Kijai `Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors`
- The `TalkEngine` class runs on H100 with timeout 1800, scaledown 300 and max_containers 1. It loads the pipeline once, with fail-fast `load_error`.
- `generate(payload)` takes `{keyframe_b64 | keyframe_url, audio_volume_path, prompt?}` and returns `{clip_url, clip_volume_path, fps: 25, num_frames, duration_s, has_audio: true, engine: "infinitetalk"}`.
- It has token-guarded `generate_http` (spawn), `generate_result` (poll) and `cancel_http`.
- **Known bug to fix first:** `generate()` imports `from wan_io import load_frame`, which doesn't exist. Copy `_load_frame` from `wan_app.py` into `talk_app.py`; it handles base64 or URL and returns a PIL RGB image. Then `python -m py_compile modal/talk_app.py`.

**Steps:**
1. Fix the import bug above and compile.
2. `modal run modal/talk_app.py::download`. This is CPU only and cheap, and takes a while for about 93 GB. Confirm the files exist on the volume.
3. `modal deploy modal/talk_app.py` (on Windows set `PYTHONUTF8=1`, otherwise Modal's ✓ output crashes the console). Add the endpoint URLs to `.env` and `.env.example` as `MODAL_TALK_ENDPOINT` and `MODAL_TALK_RESULT_ENDPOINT`, names only in `.env.example`.
4. **Smoke test, about $0.50–2.** Use the same inputs as the Wan run so the two can be compared:
   - Keyframe: `data/funmi_keyframe_v5_url.txt`.
   - Voice: the existing volume WAV `yarn_1793393529_17112a4c.wav` (5.027s, Yoruba, already on `talla-outputs`).
   - Add `--only=talk` support to `scripts/calibrate_engines.mjs`: spawn `MODAL_TALK_ENDPOINT`, then stitch. Record wall time, frames, and lip-sync by eye.
   - If any import or version error appears in the Modal logs, fix the pins and retry. Don't loop on paid GPU: read the error first.
5. **Decision gate (owner).**
   - Show the owner the InfiniteTalk film next to `data/calib_wan_v5_final.mp4`.
   - Switch only if lip-sync is clearly better and per-scene time is ≤ about 3 min.
   - If 480p looks soft after upscaling to 1080x1920, try `infinitetalk-720` on one scene and compare cost.
6. **Integrate into the Worker:**
   - Add engine `talk` to the step machine in `worker/src/index.js` and the `MODEL_MAP`, plus `providers.js` spawn and poll via `modalCall` / `modalPollOnce` with `X-Talla-Token`.
   - **Order changes for `talk`:** voice first (TTS returns `duration_s` and `audio_volume_path`), then video from keyframe plus that WAV. Clip seconds equal voice duration (cap 40s); no 5s cap and no picture padding.
   - Stitch: the clip already contains the voice. Make sure stitch doesn't double the audio. Either keep muxing the original WAV and drop clip audio, or use clip audio. Verify with `scripts/inspect_film.py` that loudness is around −14 LUFS and the audio is a single track.
   - `credits.js`: add a `talk` estimate from the measured smoke test.
   - Demo mode: `agents.js` demo film path must label it a demo, with $0 spend.
   - Keep Wan as a selectable fallback. Make `talk` the default only after the owner approves.
7. **UI:**
   - Engine cards in the Film stage: "InfiniteTalk: lip-synced, any length (recommended)" and "Wan 2.2: silent motion (fallback)". Show LTX only if unlocked.
   - Update the voice card copy. Today it says the voice is muxed onto silent motion; for `talk` it should say the face is animated to the voice.
8. **Optional hosted fallback,** only if the owner approves spend and adds a key: fal.ai `fal-ai/kling-video/ai-avatar/v2/standard`, about $0.056/s (about $0.28 per 5s). It needs a `FAL_KEY` secret and a budget line.

**Done when:** a lip-synced Funmi Yoruba scene renders, its timing is recorded in `data/calibration_engines.json`, the owner approves, and the engine is wired through Worker, credits and UI with a demo-safe path. `verify_api_chain.mjs` still passes at $0.

### WP-D: LTX 2.5 (blocked on owner, low priority)

- LTX failed with `403 GatedRepoError`: Hugging Face account **FemiML**, which owns the Modal `huggingface-secret` token, hasn't accepted the Lightricks licence. Owner steps are in `docs/ltx-setup.md`.
- The fail-fast fix is deployed: a load failure now errors immediately instead of a 45-min hang.
- If InfiniteTalk wins in WP-C, consider removing LTX from the UI entirely rather than keeping a broken option.

### WP-E: Verify stage is broken

- `Muse Voice Transcribe` (Meta) returns **HTTP 404**, so the speech check of the first voiced scene never works.
- Options:
  - (a) Find the correct Meta endpoint or model name in the Meta API docs.
  - (b) Replace it with a small Whisper model on Modal. Whisper-large-v3 knows Yoruba and Hausa. Token-guarded, cheap T4.
  - (c) If neither fits the budget, mark verify as "not available" honestly in the UI, `content.js` and the job output, instead of showing a failing step.
- **Done when** a job shows a real transcript and similarity score, or verify is honestly disabled everywhere.

### WP-F: Voice quality checks

- YarnGPT2 with tone-marked Yoruba (diacritics) produced broken, short audio (1.1s), while plain spelling gave a correct 5.03s.
- Normalise or strip Yoruba diacritics before TTS in the Worker. Add a guard: if `duration_s` is far below the expected roughly 0.35s per word, retry once with plain text and flag it.
- `max_new_tokens=3000` is already deployed in `modal/yarngpt_app.py`.
- Pidgin uses MMS (`talla-tts`). Keep the mapping in `worker/src/personas.js`.

### WP-G: Real proof overlays (rcpt screen recording)

- Storyboards plan "proof" scenes with an overlay (picture-in-picture or before/after), and stitch can composite overlays. But there is **no way to upload the real asset**, so `overlays_applied` is always 0.
- Build:
  - An upload control on the storyboard scene card (video or image, size-limited).
  - A Worker route that stores it in R2 (`MEDIA` binding) under the project.
  - Pass the R2 key to stitch in `overlays[]`.
- Proof must be real assets, never AI-drawn.
- **Done when** an uploaded rcpt screen recording appears picture-in-picture in the stitched film.

### WP-H: Worker robustness

- **Cloudflare free-plan CPU limit (10ms):** each `GET /api/jobs/:id` advances one step under a D1 lock. Confirm no single step does heavy CPU work, such as base64-encoding large images in the Worker. If needed, move it to Modal or note that the paid Workers plan is required.
- Abandoned jobs: make sure `cancel_http` is called for a Modal call when a job is cancelled or times out, so the GPU stops billing.

### WP-I: Commit the current work

These files are uncommitted on `review-hardening`. Review and commit them in logical groups, docs separately:
- **Docs and runbooks:** `.env.example`, `README.md`, `CREDITS.md`, `CALIBRATION_RUNBOOK.md`, `docs/deploy-checklist.md`, `docs/ltx-setup.md`, `docs/MUSE_WONDER_BRIEF.md`.
- **Engines:** `modal/wan_app.py` (CPU offload plus fail-fast load), `modal/yarngpt_app.py` (max_new_tokens), and `modal/talk_app.py` once it works.
- **Scripts and data:** `scripts/verify_api_chain.mjs`, `scripts/calibrate_engines.mjs`, `data/funmi_keyframe_v5_url.txt`.
- **Worker:** `worker/src/index.js` (demo job stepping, anonymous generate = demo job).
- **Web:** `web/index.html`, `web/public/favicon.svg`, `web/public/agents/*-cut.webp` and `*-lg.webp`, `web/src/Home.jsx`, `App.jsx`, `content.js`, `styles.css`.

Check that `.gitignore` excludes `.env`, `data/ref_frame_*.png` and `data/ref_seedance_*`. Never commit a key.

### WP-J: Cloudflare deploy (needs the owner's go-ahead)

1. Run the D1 migrations, including 0002: `npm --prefix worker run db:migrate`, using the remote flag the script defines.
2. Run `wrangler secret put` for every secret named in `.env.example`, including `TALLA_ACCESS_CODE`, `MODAL_ENDPOINT_TOKEN`, `MODAL_FILE_ENDPOINT`, every `MODAL_*_ENDPOINT`, `BASETEN_*`, `META_*`, `FIRECRAWL_API_KEY`, `EXA_API_KEY` and the R2 vars. **Never** set `TALLA_DEV_OPEN` in production.
3. `wrangler deploy` (Worker with D1 `DB` and R2 `MEDIA` bindings from `wrangler.toml`).
4. Build web with `VITE_API_URL=<worker url>`, then `wrangler pages deploy web/dist --project-name talla --branch main`.
5. Set `ALLOWED_ORIGINS` on the Worker to the Pages URL.
6. Smoke test production:
   - Without a code it's demo mode, with $0 spend.
   - With the code, the access check passes.
   - Run one calibration scene only after the owner approves the spend.

Follow `docs/deploy-checklist.md`.

### WP-K: Docs truthfulness pass

After WP-C, WP-E and WP-G, update `README.md`, `CREDITS.md`, `CALIBRATION_RUNBOOK.md`, `../TALLA_MASTER_PLAN-2.md` and the in-app copy so the engine, verify and overlay claims match reality. Record measured costs.

---

## 5. Budget and spend

- **Measured Modal spend so far** (H100 about $3.95/h):
  - Wan 2.2s test: about $0.70.
  - Wan 5s test: about $1.90.
  - LTX: a 45-min A100 timeout that never rendered.
  - Plus small TTS and stitch runs.
- Check the real totals on the Modal dashboard and `GET /api/credits` before any paid run.
- Every paid test from here on uses **one scene**. Get owner approval before any full-film render.

## 6. Owner decisions still needed

1. After the WP-C smoke test: switch the default engine to InfiniteTalk? This needs the side-by-side comparison.
2. LTX: accept the HF terms (see `docs/ltx-setup.md`) or drop it.
3. Optional fal Kling hosted fallback: approve spend and provide a key?
4. Verify: Whisper on Modal, or honestly disable it?
5. Go-ahead for the Cloudflare deploy (WP-J).
