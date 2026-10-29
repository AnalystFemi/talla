# Talla Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Talla — a generic Nigerian UGC video engine (product/URL/category → research → storyboard → script → keyframe → SAM 3.1 QC → YarnGPT2/MMS voice → Wan 2.2/LTX silent-motion video → critic → ffmpeg stitch → Muse Voice Transcribe verify → Export for Posting) with a Riverside-style homepage + studio, Cloudflare-hosted, Modal GPU media, Baseten Muse Spark Open brain. rcpt is the final test case only. MiniMax H3 is parked/ON HOLD (its H200 calibration run was cancelled at the user's 18:35 hard stop 2026-10-29; /generate never submits it — Wan 2.2 is primary, LTX the cheapest fallback).

**Architecture:** React/Vite SPA (Cloudflare Pages) → Hono Worker API (D1 projects/jobs/credits, R2 media) → Baseten Muse Spark Open (agents/critic), Meta Muse Image (keyframes), Meta SAM 3.1 (keyframe QC), Modal (Wan 2.2 primary + LTX cheapest silent motion, YarnGPT2/MMS voices, FFmpeg stitch composite; H3 parked, lipsync_app.py unused). No-login; projects addressed by ID. Credit manager enforces budgets, caching, retry caps, 768p-first generation. Nothing >5MB is downloaded/rendered locally; weights live in Modal volumes, outputs in R2.

**Tech Stack:** React + Vite, Hono (Worker + @hono/node-server locally), Cloudflare Pages/Workers/D1/R2, Modal (Python), FFmpeg.

---

### Task 1: Repo scaffold, env, Cloudflare infra
**Files:** `.env.example`, `.env`, `.gitignore`, `wrangler.toml`, `infra/schema.sql`, `package.json`
- [ ] Create scaffold with placeholder keys (no real secrets committed; `.env` gitignored)
- [ ] D1 schema: projects, scenes, jobs, credit_log
- [ ] Verify: `git status` clean structure; `.env` not tracked

### Task 2: REA diagnosis
**Files:** `docs/rea-findings.md`
- [ ] Run `npx -y rea-agents@latest doctor --client opencode --json` (diagnosis only)
- [ ] Record: MCP registered or not, exact setup dry-run command pending user approval

### Task 3: Worker API — agents, providers, credits, jobs
**Files:** `worker/src/index.js`, `worker/src/agents.js`, `worker/src/providers.js`, `worker/src/credits.js`
- [ ] `POST /api/projects`, `GET /api/projects/:id`, `POST /api/projects/:id/research|storyboard|script|generate`, `GET /api/jobs/:id`, `GET /api/credits`
- [ ] Agents return structured JSON; live Baseten call when `BASETEN_API_KEY` set, deterministic demo output otherwise (labelled `mode: demo`)
- [ ] Credit manager: per-provider budget caps, estimated cost per call, cache keys, critic retry cap = 2, regeneration cap = 2
- [ ] Verify: smoke script hits every route (Task 6)

### Task 4: Frontend — Riverside homepage + studio
**Files:** `web/index.html`, `web/src/main.jsx`, `web/src/App.jsx`, `web/src/styles.css`, `web/public/agents/*.jpg`
- [ ] Homepage per brief §8: hero with agents in headline, Meet Your Team (5 agents), pipeline cards, "What you can hand off", CTA
- [ ] Studio: create project → research brief → editable storyboard → generate (per-agent progress) → critic verdicts → final video/download
- [ ] Verify: `npm run build` succeeds; dev server renders

### Task 5: Modal media apps (cloud-only heavy work)
**Files:** `modal/wan_app.py`, `modal/yarngpt_app.py`, `modal/tts_app.py`, `modal/stitch_app.py`, `modal/h3_app.py` (parked), `modal/lipsync_app.py` (parked, unused)
- [ ] Wan 2.2 primary + LTX cheapest (silent motion), YarnGPT2 (Yoruba/Hausa/Igbo) + MMS (Pidgin) voices, FFmpeg stitch+captions+"AI-generated" label; all outputs uploaded to R2 from Modal. H3 parked — not deployed, never submitted by /generate.
- [ ] Verify: `python -m py_compile modal/*.py`

### Task 6: Local run + smoke test
**Files:** `scripts/smoke.mjs`
- [ ] `npm install`, start API + web, run smoke test end-to-end in demo mode
- [ ] Verify: project → research → storyboard → script → job → credits all return 200 with coherent IDs

### Task 7: Credit management + handover
**Files:** `CREDITS.md`, `README.md`
- [ ] Document budgets — see `worker/src/credits.js` BUDGETS_USD ($20 Baseten / $15 Meta / $10 Modal / $5 research, $50 total cap) — burn rules, what each key unlocks, keys the user must supply
- [ ] Verify: `/api/credits` shows budget vs estimated burn

### Task 8: Post-plan hardening (2026-10-29)
- [x] Export for Posting (Muse Spark caption in video language + 5-8 hashtags; no social APIs)
- [x] Avatar approval gate (UGC Forge): Funmi v4 LOCKED by user (light-skinned Yoruba woman, black knotless braids, upscale Lagos flat). H200 calibration run CANCELLED 2026-10-29 at user hard stop (18:35): no video produced, H3 parked/ON HOLD permanently; talking-head engine decision pending (open-source LatentSync/MuseTalk bake-off)
- [x] SAM 3.1 (Meta) keyframe QC gate — live-verified (person:1 on Funmi v4); Wan 2.2 primary video engine, LTX cheapest, H3 parked
- [ ] Two male avatars: Tunde (light-skinned) generated OK; Ebuka (dark-skinned) rendered female → REJECTED, masculine regeneration pending approval
- [ ] Funmi talking-head video (new open-source lipsync engine, pending bake-off) -> lock prompt/look before any batch generation
