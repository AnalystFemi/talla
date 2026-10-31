# Talla — Credit Management Plan

Goal: finish the hackathon inside a self-imposed **$50 total** (the hackathon issued more; we deliberately spend at most $50). Enforced in code (`worker/src/credits.js`), visible at `GET /api/credits` and in the Studio credit panel.

## Budgets
| Provider | Cap | Used for |
|---|---|---|
| Baseten | $20 | Muse Spark Open: research, storyboard, script, critic, export caption |
| Meta | $15 | Muse Image keyframes, SAM 3.1 keyframe QC, Muse Voice Transcribe verify |
| Modal | $10 | Wan 2.2 / LTX 2.5 video, YarnGPT2 / MMS voices, stitch |
| Firecrawl + Exa | $5 (shared) | Research enrichment only |
| **Total** | **$50** | Global cap checked in addition to each provider cap |

## Enforcement (in code)
1. **Totals come from D1.** When D1 is bound, every request reloads per-provider spend from `credit_log` (one `GROUP BY`), so the guard sees spend from every Worker isolate and poll. Locally (no D1) totals accumulate in memory.
2. **Guard before every paid call.** `assertBudget` refuses (HTTP 402 `BUDGET_EXHAUSTED`) unless the remaining provider budget **and** the $50 total both cover the cost of the next operation.
3. **Whole-job gate.** `/generate` estimates the full job and refuses before any Modal submit if it does not fit the Modal budget.
4. **Charged at spawn.** Modal charges are recorded when a render is spawned, so they are never lost if a poll dies.
5. **Cache first.** Identical research/storyboard/keyframe inputs are served from cache and logged at $0.
6. **Warnings.** The credit summary flags any provider (and the total) at 80% used. The critic runs once per scene and never triggers a regeneration (the `LIMITS` retry caps in `credits.js` are defined but not used by any route yet).
7. **Demo is free.** Without the access code, paid keys are stripped from the request — nothing can be billed.

Note: `scripts/calibrate_wan.mjs` calls Modal **directly** for its one Wan clip and stitch, so those two calls are not recorded in `credit_log`. Record them by hand from the Modal dashboard.

## Per-operation estimates (UNCALIBRATED)
| Operation | Estimate | Status |
|---|---|---|
| Wan 2.2 clip (720x1280, ≤81 frames, H100) | $1.20 | estimate — realistic range ~$0.70 warm to ~$2.20 cold |
| LTX 2.5 clip (≤10.6 s, A100-80GB) | $0.60 | estimate |
| InfiniteTalk clip (480p, voice-length, H100) | $1.50 | UNMEASURED placeholder — engine not deployed, smoke test pending |
| Voice line (YarnGPT2 / MMS) | $0.03 | estimate |
| Stitch | $0.03 | estimate |
| Muse Image still | $0.01 | provider price |
| Baseten stage call | $0.01–0.02 | estimate |

None of the Modal figures has been measured against an invoice. They are set on the high side so the guard trips early.

## What $10 of Modal actually buys
At the Wan range above, **one 4-scene Wan film costs roughly $3–7**, and the $10 Modal cap covers **roughly 5–8 Wan clips in total** — about one to two short films. That is the binding constraint, not LLM spend. Calibrate one scene first (`CALIBRATION_RUNBOOK.md`), then replace the estimates in `credits.js` with measured numbers.

## Keys checklist
- [ ] `TALLA_ACCESS_CODE` — enables live mode for holders of the code
- [ ] `BASETEN_API_KEY` — live agents / critic
- [ ] `META_API_KEY` — Muse Image, SAM QC, verify
- [ ] `FIRECRAWL_API_KEY`, `EXA_API_KEY` — live research enrichment
- [ ] Modal secret `talla-endpoint-auth` + Worker `MODAL_ENDPOINT_TOKEN` (same value)
- [ ] Modal endpoint URLs (see `.env.example`)
