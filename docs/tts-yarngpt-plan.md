# TTS plan — YarnGPT champion + Pidgin specialist (Session B)

Date: 2026-10-29. Budget rule: **max 1,000 YarnGPT credits total** (account: 4,000). Log every synthesis in `data/tts_bakeoff/credit_log.md`.

## Decision (from research 2026-10-29 + user answers: commercial later, most natural voice, cloning later)
- YarnGPT stays champion. No model is proven "way better" across Nigerian languages.
- **Hosted yarngpt.ai** (sound user loves): 16 voices, all list english/pidgin/hausa/yoruba/igbo (`data/tts_bakeoff/voices.json`, fetched free). API: `POST /api/v1/tts` (async) or `/api/v1/tts/prepare` (stream). Voices dynamic — never hardcode.
- **Open `saheedniyi/YarnGPT2`** (Apache-2.0): English/Yoruba/Igbo/Hausa only, **no Pidgin**, fixed voices, no cloning. Must prove itself against hosted on golden lines before becoming primary.
- Challengers only win niches: Pidgin/cloning (WazobiaVoice, 9jaLingo Spark, Spitch), Yoruba code-switch (LyngualLabs VoxCPM2-Yoruba, experimental/NC).

## Voice roster (user-confirmed 2026-10-29)
- Female: **idera**, **regina**
- Male: **femi**, **emma**
(Hosted API returns no gender field; this mapping is the user's. Open YarnGPT2 has different per-language voice names — see `modal/yarngpt_app.py`.)

## Steps
1. [x] Voice catalogue fetched (0 credits)
2. [x] Hosted reference pass 1: 20 calls total (4 voices x 5 languages, line 1 each) -> `data/tts_bakeoff/hosted/*.mp3`. Credits/call still to calibrate from dashboard (user reported 4,090 after first 5 calls — account may have topped up; do not spend more until rate is known).
3. [ ] Modal open YarnGPT: `modal deploy modal/yarngpt_app.py` then `modal run modal/yarngpt_app.py` (GPU cost only, 0 YarnGPT credits). Generate same golden lines.
4. [ ] Blind native-speaker scoring per language (naturalness, tone, wrong-words). Routing decided per language.
5. [ ] Pidgin specialist trial: 9jaLingo Spark first (Apache, 325 speakers), WazobiaVoice only after licence email.
6. [ ] Wire winner(s) into worker (separate step, coordinate via SESSION_COORDINATION.md — worker files are shared).

## Files (Session B owns)
- `modal/yarngpt_app.py`, `scripts/yarngpt_voices.mjs`, `scripts/yarngpt_bakeoff.mjs`, `data/tts_bakeoff/*`, this doc.
