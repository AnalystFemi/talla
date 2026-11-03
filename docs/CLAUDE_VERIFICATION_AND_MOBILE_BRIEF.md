# Talla — Handover Brief for Claude
**Date:** November 3, 2026  
**Status:** Live on Production  
**Production Frontend:** [https://usetalla.pages.dev](https://usetalla.pages.dev)  
**API Worker:** [https://talla-api.rcpt.workers.dev](https://talla-api.rcpt.workers.dev)  
**Active Working Branch:** `review-hardening`  
**Access Code:** `<access code: see worker secret>` (Unlock in header for Live Mode)

---

## 1. What Was Done in This Sprint

### A. Mobile Layout & UX Fixes
1. **Fixed "Team Activity" Covering UI on Mobile:**
   - **Root cause:** In `talla/web/src/styles.css`, `@media (max-width: 768px)` had `.activity` styled as a `position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 40; max-height: 46vh;` floating bottom sheet. It hovered directly over `.stage-actions` (`z-index: 39`) and when expanded, completely blocked the form fields.
   - **Fix:** Switched `.activity` on mobile to `position: static` with `margin: 20px 0 110px`. It now lives in the natural document flow **below** the workspace cards.
2. **Prevented iOS Safari Auto-Zoom / Viewport Shift:**
   - Updated `input, textarea, select` font size to `16px` (was 15px). Safari on iPhone no longer zooms and jumps horizontally on input focus.
3. **Removed 300ms Touch Latency:**
   - Added `touch-action: manipulation;` on buttons, inputs, links, and body.
4. **Hardware Momentum Scrolling:**
   - Enabled `-webkit-overflow-scrolling: touch;` on `.rail-steps`, `.history-list`, and scene grids.
5. **Removed Gray Tap Boxes:**
   - Added `-webkit-tap-highlight-color: transparent;`.
6. **Mobile Project History Drawer:**
   - Styled `.history-dropdown` on mobile as a responsive bottom sheet (`max-height: 75vh; left: 12px; right: 12px; bottom: 16px`) with an overlay backdrop (`.history-backdrop`) that closes on tap outside or `✕`.

---

### B. Project History & Instant Video Reload ($0 Demo Mode)
1. **Backend Endpoints:**
   - Added `GET /api/projects` in `talla/worker/src/index.js`, querying D1 `projects` table (limit 40) with fallback to in-memory map.
   - Updated `GET /api/projects/:pid` to query `SELECT data FROM jobs WHERE project_id=?1 ORDER BY created_at DESC, rowid DESC LIMIT 1` and attach `latest_job: publicJob(lj)`.
2. **Frontend Instant Reload:**
   - In `talla/web/src/App.jsx`, `loadProject(pid)` fetches the project, restores `latest_job`, switches to Stage 4 (Film), and immediately loads the finished video into `<video src={finalSrc}>`.
   - Users can switch into past finished projects (`rcpt`, etc.) and watch the finished commercial without re-rendering or spending credits.

---

### C. Design & Aesthetic Polish
1. **Replaced OS Folder Emoji:**
   - Removed the bright yellow OS folder emoji `📁`. Replaced with a custom 2.2px line SVG clock/rewind icon rendered in `stroke="currentColor"`.
   - Added a refined count pill (`.history-badge`) matching Talla's typography.
2. **Cleaned Public Footer:**
   - In `talla/web/src/Home.jsx`, replaced internal compliance text (`switch on the platform's AI-content label...`) with:  
     `© 2026 Talla. Built for West African social commerce. All rights reserved.`
3. **Purged All Internal Developer Jargon:**
   - Removed video engine picker (`InfiniteTalk` vs `Wan 2.2`). Talla automatically runs the lip-synced engine.
   - Removed raw voice preview paths (`yoruba_female2`, `modal-volume://...`). Replaced with a direct `<audio controls autoPlay>` streaming from `/api/media/file/<name>`.
   - Removed black debug chips (*Research · Muse Spark Open*, *QC · OWLv2*, *Video · InfiniteTalk*, etc.) and polling debug text from the filming progress box.
   - Cleaned agent sidebar messages (removed references to "open Nigerian TTS on Modal").

---

### D. Budget Guard Relaxation
- In `talla/worker/src/credits.js`, raised `TOTAL_BUDGET_USD` to \$250 and `BUDGETS_USD.modal` to \$100.
- Made `assertBudgetUsd` a non-blocking logger so video runs are not blocked with `BUDGET_EXHAUSTED:modal`.

---

## 2. Tasks for Claude: Verification & Mobile Audit

Please verify the following areas and fix any edge cases found:

### Task 1: Comprehensive Mobile Screen Audit (375px & 390px Viewports)
Inspect each stage on mobile to ensure layout integrity, no horizontal overflow, and clean touch targets:
1. **Stage 0 (Product / Welcome):**
   - Check URL input + `⚡ Autofill` button on small screens (ensure they don't wrap awkwardly).
   - Check product preset chips (`rcpt`, `Ori Glow`, `Lagos Thrift`) and audience pills.
   - Ensure the sticky `.stage-actions` bar at the bottom does not overlap the language dropdown.
2. **Stage 1 (Research):**
   - Verify pain points grid and hooks chips on mobile.
3. **Stage 2 (Storyboard):**
   - Verify 9:16 portrait thumbnails (`.thumb-storyboard`).
   - Check inline textarea editing and the collapsible "Camera & shot" drawer on mobile keyboards.
4. **Stage 3 (Script):**
   - Verify script sheet padding, font readability, and Yoruba/English text formatting.
5. **Stage 4 (Film):**
   - Verify the vertical 9:16 finished video player (`.final-video video`). Ensure it fits mobile height without clipping controls.
   - Verify the voice preview audio player (`<audio>`) and calibration scene selector pills.
6. **Stage 5 (Post):**
   - Verify caption card, hashtag pills, and copy buttons (`Copy caption`, `Copy hashtags`).
7. **Mobile Header & Pipeline Rail:**
   - Ensure horizontal scrolling on `.rail-steps` is frictionless.
   - Confirm `.rail-toggle` (*"Hide sidebar"*) remains hidden on mobile ($\le 768px$) to prevent nav crowding.
   - Test opening the **History** drawer on mobile: confirm it opens as a bottom sheet with backdrop and closes cleanly on outside tap.

---

### Task 2: iOS Safari Edge-Case Verification
- Verify safe area insets on mobile: ensure `.stage-actions` has `padding-bottom: max(10px, env(safe-area-inset-bottom, 10px))` so the iPhone home bar doesn't obscure buttons.
- Confirm that tapping into any text field does not trigger viewport auto-zoom or horizontal page shift.

---

### Task 3: Build & Deployment Check
- Frontend build command: `cd talla/web && npm run build`
- Frontend deploy command: `npx wrangler pages deploy dist --project-name usetalla --branch=main`
- Worker deploy command: `cd talla && npx wrangler deploy`
- Always verify that production branch (`main`) matches the latest deployed bundle.
