# Talla — Credit Management Plan

Goal: finish the hackathon inside budget. Enforced in code (`worker/src/credits.js`), visible live at `GET /api/credits` and in the Studio "Credit guard" panel.

## Budgets
| Provider | Budget | Used for | Rule |
|---|---|---|---|
| Baseten | $100 | Muse Spark Open: research, storyboard, script, critic | Default for ALL LLM work |
| Meta | $150 | Muse Image keyframes ($0.01 each) + rare final Spark 1.3/Wonder passes | Never for routine agent work |
| Modal | ~$30 (confirm actual) | H3/Wan/LivePortrait/LTX GPUs, TTS, stitch | scaledown_window=60s — idle GPUs stop billing |
| Firecrawl / Exa | ~$10 each | Research enrichment only | Results cached; never re-scraped |

## Enforcement (already coded)
1. **Cache first** — identical research/storyboard inputs are served from cache and logged at $0 (`cached: 1` in `credit_log`).
2. **Critic cap** — max 2 critic attempts per scene, max 2 regenerations per project (`LIMITS`).
3. **768p first** — H3/Wan generate at base resolution; no direct 2K runs.
4. **Short clips** — 5–15s per generation, stitched to 25–40s. Never generate a full 40s in one call.
5. **Budget guard** — `assertBudget()` hard-stops a provider at $0 remaining; Studio warns at 80%.
6. **Demo mode is free** — with no keys set, every stage runs labelled demo output. Credits only burn after you add keys, stage by stage.
7. **Engine ladder** — H3 (primary) → Wan 2.2 / LivePortrait (cheap, 1 GPU) → LTX (floor). Expensive engine is tried once, compared, then the ladder decides — not hope.

## Estimated cost per finished video (live mode)
Research $0.02 + storyboard $0.015 + script $0.02 + 5× Muse Image $0.05 + TTS ~$0.05 + video (H3 ~$1.75 worst case / LivePortrait ~$0.05) + critics ~$0.05 + stitch $0.02 ≈ **$0.25 (LivePortrait path) to ~$2 (all-H3 path)**. At $100 Baseten + $150 Meta that is hundreds of test videos — the binding constraint is Modal GPU time, so the engine ladder matters more than LLM spend.

## Keys checklist (user action — see `.env.example`)
- [ ] `BASETEN_API_KEY` — unlocks live agents/critic
- [ ] `META_API_KEY` + endpoint — unlocks Muse Image keyframes
- [ ] `FIRECRAWL_API_KEY`, `EXA_API_KEY` — unlocks live research enrichment
- [ ] `AVA_API_KEY` — unlocks Ava MCP for REA findings
- [ ] Modal: `modal token new` if CLI auth lapses; R2 keys as Modal secrets for uploads
- [ ] Node upgrade >=22.23.4 — unblocks REA MCP setup
- Not needed: MiniMax key, YarnGPT key (fallbacks only)
