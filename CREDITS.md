# Talla — Credit Management Plan

Goal: finish the hackathon inside a self-imposed **$50 total** (the hackathon issued more; we deliberately spend at most $50). Enforced in code (`worker/src/credits.js`), visible at `GET /api/credits` and in the Studio credit panel.

## Budgets
| Provider | Cap | Used for |
|---|---|---|
| Baseten | $20 | Muse Spark Open: research, storyboard, script, critic, export caption |
| Meta | $15 | Muse Image keyframes, SAM 3.1 keyframe QC, Muse Voice Transcribe verify |
| Modal | $10 | InfiniteTalk (primary) / Wan 2.2 / LTX 2.5 video, YarnGPT2 / MMS voices, stitch |
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

## Per-operation estimates (talk measured)
| Operation | Estimate | Status |
|---|---|---|
| **InfiniteTalk clip (480p, voice-length, H100)** | **$0.60** | **measured 2026-10-31: 483.6 s for 5.027 s Yoruba → ~$0.53 + stitch $0.03 = $0.56, rounded to $0.60 guard** |
| Wan 2.2 clip (720x1280, ≤81 frames, H100) | $1.20 | estimate — realistic range ~$0.70 warm to ~$2.20 cold (measured 2026-10-30: 5 s ~$1.90) |
| LTX 2.5 clip (≤10.6 s, A100-80GB) | $0.60 | estimate, gated |
| Voice line (YarnGPT2 / MMS) | $0.03 | estimate |
| Stitch | $0.03 | estimate |
| Muse Image still | $0.01 | provider price |
| Baseten stage call | $0.01–0.02 | estimate |

Modal figures are now partly measured; guard stays on the high side so it trips early.

## What $10 of Modal actually buys
At the measured Talk rate (**~$0.60 per scene + $0.03 stitch share**), a 6-scene Talk film costs **~$3.60–4.00**; the $10 cap covers **~16 scenes (~2–3 short films)**. At Wan's $1.20 range, a 4-scene Wan film was ~$3–7 for 5–8 clips total. Talk is ~3.6× cheaper/faster than Wan (483.6 s vs 1737.9 s for 5 s). Calibrate one scene first (`CALIBRATION_RUNBOOK.md`).

## Keys checklist
- [ ] `TALLA_ACCESS_CODE` — enables live mode for holders of the code
- [ ] `BASETEN_API_KEY` — live agents / critic
- [ ] `META_API_KEY` — Muse Image, SAM QC, verify
- [ ] `FIRECRAWL_API_KEY`, `EXA_API_KEY` — live research enrichment
- [ ] Modal secret `talla-endpoint-auth` + Worker `MODAL_ENDPOINT_TOKEN` (same value)
- [ ] Modal endpoint URLs (see `.env.example`)
