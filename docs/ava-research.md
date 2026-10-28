# Ava Studio — public product-flow research for Talla

- Researched: 2026-10-28. Public pages only (`avastudio.com`, `app.avastudio.com`, `docs.avastudio.com`). No login, no private feeds, no authenticated app data.
- Caveat on evidence: Ava's marketing landing page is client-rendered, so most verifiable detail comes from its public docs, its public `Ava for Agents` page, its blog/RSS/sitemap, and the unauthenticated app shell. Where a claim is only vendor-described (not independently verified), this note says so.
- Key sources:
  - https://docs.avastudio.com/llms.txt (full docs index)
  - https://docs.avastudio.com/start-here/quickstart-create-your-first-ad.md, `set-up-your-brand-profile.md`, `core-concepts.md`, `choose-your-starting-point.md`
  - https://docs.avastudio.com/campaigns/campaign-overview.md, `create-a-campaign-brief.md`, `research-ugc-patterns.md`, `generate-campaign-projects.md`
  - https://docs.avastudio.com/prompting/hooks.md, `prompting/ugc-ad-structures.md`, `templates/*`, `studio-mode/ai-agent.md`, `studio-mode/scene-prompts.md`
  - https://docs.avastudio.com/api-and-mcp/tools/research.md, `tools/drafts.md`, `tools/brands.md`, `tools/planner.md`, `tools/production.md`, `credits-and-pricing.md`
  - https://docs.avastudio.com/models-and-credits/credits.md, `account-and-support/plans-and-billing.md`
  - https://avastudio.com/products/ava-agents, https://avastudio.com/blog (7 posts in sitemap/RSS at time of check), https://app.avastudio.com/create (public shell)

## Flow

### Positioning in one line

"Set the goal, Ava keeps creating" / "Turn your brand into a content machine." Ava sells an always-on creative system rather than a single video generator: research what is working, draft briefs from it, produce videos, review/approve, then repeat weekly and turn winners into variants.

### The five public entry paths

Ava docs (`choose-your-starting-point`) expose five distinct starting points. This is the most replicable structural idea in the whole product:

1. **First video (shortest path):** paste a brand URL -> Ava analyses brand context -> proposes ready-to-use/download ads -> user picks one, trims/captions in Editor Mode, exports.
2. **Campaign (batch path):** create campaign from a marketing prompt or blank -> research -> template recommendations -> template cart/queue -> tweak ingredients once per template -> generate a batch of projects -> review in campaign grid -> batch export.
3. **From scratch (control path):** New Video in Studio Mode -> add ingredients -> create scenes (hook / problem / demo / proof / CTA) -> pick model+mode per scene -> generate 2-4 variants per scene -> pick winner per scene -> Editor Mode.
4. **Clone a video (agent path):** paste a TikTok / Reel / Shorts URL or upload MP4/MOV -> agent extracts transcript, hook, pacing, scene beats, transitions, CTA placement -> user swaps in own actor/product/hook/proof/CTA -> generate.
5. **Model-led generation:** generate images/references first (saved to Library as ingredients), then use them as start frames / product / actor references for video.

### Campaign flow (the core loop)

Docs state the campaign path verbatim as:

> brief -> research what to create -> select templates to cart -> tweak ingredients -> generate projects -> review -> export generated projects

In the unauthenticated app shell this shows up as two campaign cards:

- **Organic — "Scale your organic content":** TikToks, Reels, carousels for awareness/conversions.
- **Paid ads — "Find your winning ad":** static + video ads with variations in hooks, visuals, selling points; "Connect Meta Ads."

Plus a third escape hatch: "Have a specific video in mind? Go to create." `/create` offers a plain-language outcome box ("What do you want to create? Describe the outcome in plain language. AVA will choose the right production flow for you."), quick chips (`UGC Ad`, `Product Demo`, `Launch Teaser`, `Script to Video`), and three modes: `New video`, `Clone videos`, `Clone images`, plus `Templates`.

### Autonomy dial

Landing copy frames two ways to work on the same system: "Ava runs it for you" (set the goal; Ava researches and creates; you approve what ships) vs. "Create and edit everything" (start from scratch or take over any campaign at any step). The approval gate is explicit: generation produces drafts for review in Studio; publishing/ad launch is a separate step, not implied by generation.

### Storyboard / script steps (brief -> spec -> prompts -> produce)

This is the most detailed part of the public API docs (`tools/drafts.md`) and maps almost 1:1 onto Talla's Researcher -> Storyboard -> Scriptwriter -> Critic chain:

1. **`draft_briefs`** (1-5 briefs, video/carousel/static): returns a concept paragraph, `hook`, `body`, `cta`, a `script[]` (sections tagged `Hook` / `Body_1` / `Cta`, each with `channel: spoken|voiceover|caption`, `role`, `text`), a `storyboard[]` (each beat has `role: hook|build|proof|cta` and an on-screen `beat` description — explicitly "not a model prompt"), and a `rationale` (see Research layer) plus a `credit_range` estimate and a preview image. Status lifecycle: `candidate -> queued -> planning -> planned -> generating -> review -> approved / failed / rejected`.
2. **`draft_clone`**: one source video (<=2 min) -> one on-brand brief preserving format, beats, pacing, hook mechanic, caption style. `preserve_hook` defaults to false: same hook *mechanic*, new words.
3. **`draft_check`**: scores a brief 0-100 against winning videos in its niche, with `strengths[]`, `risks[]`, and `similar_winners[]` (full corpus records with original TikTok URLs). Docs explicitly warn: "the score is an AI judgment, not a calibrated prediction of performance." Typical loop: check -> `draft_iterate` with plain-language feedback ("punchier hook", "less salesy", different CTA) -> re-check.
4. **`draft_spec`**: turns an approved brief into a shot list — per-shot role, duration, action, framing, camera, performer, speech, on-screen text, audio.
5. **`draft_prompts`**: turns the spec into model-specific generation prompts (after the user approves the cost estimate).
6. **`creative_produce`**: produces finished media (like Studio's Generate button; picks an actor if none set), then edit in Studio project (`project_edit`) and `export_render`. Organic creatives also get a post package: caption, hashtags, first comment, publish status.

Scene-level craft rules from Studio docs:

- One scene prompt = one visible moment: subject, action, framing, emotion, product/reference use, ingredient-based dialogue. Example given: `@Actor speaks directly to camera with surprised energy and says @Hook while holding @Product near chest level. Tight vertical selfie framing.`
- Avoid cramming multiple camera moves, long scripts, or conflicting style refs into one scene; over-describing lighting/background fights the actor reference.
- Variants: generate 2-4 outputs per scene, compare, commit one to the timeline. Extend a scene to continue a clip rather than restarting.
- Editor Mode is separate from generation: timeline trim, captions (timed to speech), text overlays (manually placed, distinct from captions), music/SFX, ingredient swaps after generation, export.

### Planning / scheduling layer

Campaigns can run a **planner** (`plan_run`, 200 credits): researches what is working for the brand in the current period and drafts concepts for review — always draft mode, never produces media. Studio shows staged progress labels (e.g. "Researching what works", "Writing scripts"), concept counts by status, a `research_summary`, and a `strategy` (title, summary, `why[]` reasons). Agents page example weekly plan: Mon "Street Interview / 3 Hooks", Tue "2 Creators", Wed "Before / After", Thu "Split Screen", Fri "Founder Story / Rework Hook", with winners spawning "5 variants each".

## Research layer

This is Ava's differentiator vs. a pure generator, and it is a *scored corpus + tool* design, not just "ask an LLM to search the web".

### Corpus and tools (public API docs)

Ava maintains a scored short-form video corpus (TikTok-first). Five research tools, each 1 credit, each <60s, all read-only:

| Tool | What it returns |
|---|---|
| `research_trends` | Trending hashtags, sounds, formats, products, styles, ad archetypes, hook clusters for a niche/brand over 7/14/30 days: `velocity`, `acceleration`, `median_breakout`, `p90_views`, `median_engagement_rate`, relative `trend_score`, `sample_hooks`, `top_formats`, exemplar TikTok URLs, and an `as_of` snapshot date. |
| `research_formats` | Formats ranked by recent performance for a niche/brand (e.g. talking head, green screen, before/after): rank, score, volume, median breakout, p90 views, `rising` flag, velocity, exemplar URLs. |
| `research_hooks` | Top opening hooks grouped by pattern/cluster (e.g. pov, question, callout) with the hook text, format, product category, video count, median breakout, top views, and `hook_strength: low|medium|high`, plus example URLs. |
| `research_search` | Keyword search over the corpus with filters: format, min views, min breakout, region, recency (days), sort by breakout/views/recent. |
| `research_breakouts` | Videos that recently broke out far above *their creator's own baseline* — positioned as the best starting references for drafting. |
| `research_similar` / `research_my_ads` (referenced) | Similar videos to a reference; and, when Meta is connected, the brand's own ads ranked next to the market. |

Every video record carries: original platform URL, cover image, public creator handle (poster only — "never commenters"), caption, analysed `hook_text`, transcript excerpt (<=200 chars), format, product category/name, style tags, `is_ad` + ad brand, duration, post date, views (rounded to 2 sig. figs.), and `breakout_ratio` = views relative to that creator's baseline (1 decimal, >1 = outperformed).

Every insight is scored on multiple low/medium/high bands: `overall`, `clonability`, `hook_strength`, `performance`, `engagement_quality`, `ad_conversion`, `product_fit`, `pacing_fit`, `freshness`.

### Evidence discipline (consistent across docs + blog)

- "Every example comes with its TikTok link; always show those links to the user next to each insight." Citations are a product requirement, not decoration.
- Results carry an `as_of` corpus-snapshot date; blog posts date both the post date *and* the date metrics were checked, and repeatedly state that lifetime play counts establish observed reach — not installs, sales, profitability, or that a hook caused the result.
- Observation vs. hypothesis is kept separate: a reference worksheet captures Source / Audience / Opening (exact first line + first visual) / What the video shows / Structure (when product appears, CTA) / Visible response (with observation date) / Unknowns (spend, targeting, conversions, unverifiable claims) / Idea to test. Only then is a hypothesis written and a single-variable test proposed.
- Privacy/safety framing on the Agents page: "Research only reads public videos. Nothing is posted, liked or changed on TikTok or Meta." and "Research results leave out commenter handles, contact emails and raw video files. You just get public links."
- Campaign research in Studio is prompt-driven in the same spirit: good prompts include category + target market + platform + question (docs example: "Find TikTok UGC ads for skincare products targeting women 25 to 40, then summarize the top hook patterns and CTA styles."). Output is judged by whether it leads to a template/project decision — research is the "what should we make?" step, not a report.

### Brand research (the other half of the research layer)

`brand_create` researches a brand from its website (40 credits, 1-2 min job) and saves a structured profile; `brand_get` shows its shape:

- **Identity/products:** name (+pronunciation), URL, category, industry, research `brief`, differentiator, products[].
- **Audience/insights:** `target_audience`, `tone[]`, `competitors[]`, and `customer_insights[]`, each insight typed as `need | objection | desired_outcome | switching_trigger | customer_language`, with a summary, `creative_use` (how a hook/script should use it), `footage_suggestion`, active/excluded status, and evidence (source URL + verbatim quote).
- **Claims governance:** `claims[]` hold verbatim first-party claim copy with status `suggested | approved | rejected`. "Only approved claims are used in drafted ad copy." Claim text itself cannot be edited via API, only approved/rejected.
- **Sources:** website / app store / reviews / discussion / social / web excerpts with collection dates.
- **Visual/media readiness:** analysed media is labelled (broll / product / lifestyle / screenshot / logo; logos are never placed as B-roll or product shots). `media_readiness` is `good` only with 3+ analysed videos *and* 3+ analysed product/lifestyle/screenshot/hero images; `thin`/`none` below that, in which case "videos get no B-roll and AI-generated product shots" and the product prompts the user to add real media first. Only analysed media is used in productions.
- **Market:** country, region, market, language, locale(s), platforms, linked Instagram/TikTok accounts, preferred actors, preview hooks. Profile is exportable as `brand.md` / JSON.

Briefs then carry their provenance explicitly (`rationale`): `test_hypothesis`, audience with `basis: observed|inferred`, `why_now`, evidence with `provenance: verified|computed|estimated`, `predicted_strength: High|Medium|Low` + why, `basis: pattern|competitor|trend|first`, and `source.kind: ugc_recreate|competitor_recreate|original` with the source URL/video/competitor brand.

## Hooks/formats

### How hooks are surfaced

- As *data*, not just copywriting: hook clusters from the corpus with pattern name, median breakout, and strength band; and as *ingredients*: multiple `@Hook` text ingredients per ad so the rest of the structure stays stable while openings are compared.
- Docs guidance (`prompting/hooks.md`): hook earns the first few seconds; make it specific, direct, audience-relevant — name a problem, belief, result, or surprising observation. Examples: "I wish I knew this before buying another running supplement", "Stop doing this if your app onboarding leaks users", "I tested three meal planning apps so you do not have to." Avoid generic hype ("This product changed my life") unless the next scene immediately proves it. "Specificity beats hype."
- Agents-page variant mechanic: "Take our best brief and make 6 versions with different hooks and creators. Same offer, same CTA." / "6 hooks from 1 brief". One variable at a time, everything else held constant.

### Formats and structures

- Corpus format taxonomy (from research + templates): talking head, green screen, before/after, testimonial, founder story, street interview, split screen, POV, unboxing, listicle, skit/comedy, tutorial/how-to, voiceover explainer, screen-recording explainer, product pitch, direct pitch, text-overlay + reaction, myth busting, comparison.
- Canonical UGC structures (`prompting/ugc-ad-structures.md`): `hook -> problem -> product -> proof -> CTA`; `hook -> demo -> benefit -> CTA`; founder testimonial; before/after; myth busting; POV; listicle; comparison; unboxing; screen-recording explainer. Timing guide: 15s ad = 2s hook + 5s demo + 4s proof/benefit + 4s CTA; 30s adds one body/b-roll proof scene.
- Structure choice is tied to buyer awareness: problem unknown -> problem/solution; category known -> comparison/proof; visual product -> demo + B-roll. (Directly transferable to Talla's category logic.)
- Blog "This Week in UGC" posts are the content-marketing version of the same layer: 3-4 *real* linked TikToks per post, each reduced to one testable framing — e.g. audience-situation opening, personal-reaction opening, concrete-task opening; or "worth the money" list framings (specific shortlist promise, verdict with a point of view/constraint, cross-category shortlist around one judgment, easy-to-grasp scope).

### Templates and creators

- Templates = reusable ad structures with scenes, prompts, ingredient slots, and editor setup pre-built; structure is separated from specifics so one template works across products. Public template browser (app shell) filters by: Format, Niche, Content Style, Platform, Language, Target Market, Video Length. Docs taxonomy example of a useful tag set: "Beauty/skincare testimonial for TikTok, under 30 seconds" (vs. useless: "Cool ad").
- Template cart/queue: collect several templates, compare, remove weak fits, tweak ingredients once per template, generate a coordinated batch. Project naming convention suggested: `Campaign - Hook Angle - Actor - CTA - v01`.
- Creators/actors: actor ingredients built from stock actors or uploaded images (clear face, front-facing, good light, minimal occlusion); `@Actor speaks to camera ... and says @Hook`. Creator style is a research output ("Find creators with high engagement in skincare") as well as a test variable (swap `@Actor` only). Identity drift is a documented failure mode with fixes (simplify prompt, cleaner reference, reference-stronger model).
- Ingredients are the underlying abstraction: reusable `@`-referenced variables — `@Actor`, `@Product`, `@Hook`, `@Body_...`, `@CTA`, `@Broll_Demo` — across text/image/video. Swapping an ingredient after generation updates that variable while preserving project structure; this is what makes hook/actor/CTA testing cheap.

## Inputs

### Onboarding / first-run input flow

1. Paste brand URL into the prompt box (onboarding). Ava researches the site and builds the brand profile, then *suggests completed, ready-to-use ads* — the user starts from output, not a blank canvas.
2. Brand profile can also be built/edited in words: product name, website, category, target audience, value proposition, brand tone, primary offer, CTA, claims Ava can use / must avoid, plus visual context (logo, product images, packaging, app screenshots, screen recordings, demo videos, landing pages, guidelines, prior ads).
3. First-video checklist (docs): brand profile saved, product reference uploaded, audience + CTA clear, at least one hook direction selected, required ingredients filled.

### Campaign / brief inputs

Brief checklist (docs): audience, pain point, product promise, proof point, offer, CTA, tone, do-not-say rules, required assets. Assets can be images, videos, PDFs, text files, brand documents — clearly named so they can become ingredients later. Worked example: "Create UGC-style app install ads for busy parents who want easier family meal planning. The offer is a free 7-day trial. CTA: Download the app. Tone: practical, warm, and direct."

### Other input surfaces

- **Plain-language create:** outcome description + format chips; or a pasted reference video URL / uploaded MP4-MOV for cloning (TikTok/Reel/Shorts; clone sources up to 2 min; if a URL fails, upload the file where you have rights).
- **Prompt box (agent/chat):** the Agents surface lets users drive the whole flow conversationally via Claude/ChatGPT/Claude Code/Cursor/VS Code/Codex (MCP, Streamable HTTP; OAuth sign-in or API key). Example public prompts: "What's breaking out on TikTok for skincare this week? Show me the hooks." / "Write a brief from the top breakout for Lumen Serum, then score it against similar winners." / "Plan next week's creative tests for Lumen. Show me the concepts before you make anything."
- **Permissions + budget as inputs:** each connection/key is scoped (`research`, `drafts:write`, `production`, campaign management; full / read-only / custom — e.g. "let one agent research but never spend on production"), with a monthly credit budget per key/connection, revocable instantly. Research tools declare their `next_steps` so agents chain research -> brief -> score -> estimate -> produce, asking before spending.

### Pricing / credits (public information only)

No dollar plan table was publicly reachable on 2026-10-28 (`https://avastudio.com/pricing` returned 404; the app shell links to an in-app "Subscribe" surface, and docs describe plans generically). Do not quote Ava dollar prices from memory — they are not in the public docs fetched here. What *is* public:

- Model: plans include monthly credits + feature/brand/API limits; add-on credit packs top up without changing plan; enterprise tier for volume/API/onboarding. Credits are consumed by video/image/voice/music/SFX generation and some export upgrades (e.g. watermark/outro removal). Cost varies by model, mode, duration, resolution, and number of variants.
- Agents/API require a **paid plan** and spend the same credit balance as Studio ("a generation that costs 40 credits in the app costs 40 through the API" — no API markup).
- Published per-tool credit prices (API docs): reads are free; `research_*` = 1 credit each; `brand_create` = 40; `draft_briefs` = 10/brief + tokens (typically ~25 total/brief); `draft_clone` = 10 + tokens (~25); `draft_iterate` = 8 + tokens (~15); `draft_check` = 3 + tokens (~4); `plan_run` = 200 (charged only when a new run starts); `creative_produce` = 50 + media credits; `ava_ask` = 40/message + tokens.
- Cost-control mechanics worth copying: `models_list` and `generation_estimate` (up to 20 generations quoted at once) are **free**; every result reports `credits_charged` / `media_credits_charged`; jobs show `credits_held` / `media_credits_estimate` while running; credits are held up front and unused holds released on finish/failure (media already produced can still be charged); same `idempotency_key` retries never double-charge; connected apps default to a 1,000-credit monthly budget.
- Video models offered (docs list, availability varies): Seedance 2.0 / 2.0 Fast (default recommendation for UGC + fast iteration), Kling 3.0 / O3 (cinematic / reference-heavy multi-shot), Veo 3.1 / Fast (cinematic + audio), Sora 2, Hailuo 2.3; image models incl. Nano Banana Pro / GPT Image family. Agents page claims "30+ models" / "8 models" for shot prompts — vendor marketing numbers, treat as unverified.
- Creative Partner Program (blog, Aug 2025): application describes free monthly credits + early feature access + possible featuring; no amount specified, no acceptance guarantee.
- Docs also stress *cost per usable video* over headline price: count all generations/revisions (incl. failures) divided by videos you'd actually use, plus human review/edit time. Their A/B guide applies the same discipline to media spend (pre-defined hypothesis, spend cap, test window, activated-signup metric, inconclusive as a valid outcome).

## What Talla should adopt

Talla already has the right skeleton (Researcher -> Storyboard -> Scriptwriter -> Critic in `worker/src/agents.js`, with Firecrawl scrape + Exa search enrichment and provider credit charging). Ava suggests upgrading the *shape* of each step, in this order of value:

1. **Evidence-linked research output.** Every hook/format Talla surfaces should carry its source (original TikTok/IG/WhatsApp-forward URL where available), the creator, post date, date checked, visible metrics, and an explicit `breakout`-style normalisation (performance vs. that creator's baseline) rather than raw view counts. Nigerian adaptation: prioritise Nigerian creators/categories and normalise for follower-count skew — a 200k-view video from a small Lagos skincare seller is a stronger signal than 2M views from a celebrity. Label everything `observed` vs `inferred`, exactly as Ava separates worksheet observations from hypotheses.
2. **Hook *patterns*, not hook lines.** Group hooks into named Nigerian-context clusters (price shock — "₦X for this?!"; trust/scam-fear — "I almost no buy am because..."; proof-first — "watch as I test am live"; comparison — old way vs new way; identity callout — "Lagos mums / NYSC members / traders wey dey...") with counts and strength, then generate lines per pattern. This makes Pidgin/Yoruba/Hausa/Igbo hook generation systematic instead of three one-off strings.
3. **Brand profile as structured, claim-governed memory.** One reusable seller profile: products, audience, tone, offer, CTA (WhatsApp-first for Nigeria — "DM / chat on WhatsApp to order"), competitors, market (Nigeria, language/locale), and *approved claims only* feeding the Scriptwriter. Add a media-readiness gate: if the seller has no real product photos/demo clips, say so and generate with AI product shots flagged as such, rather than silently faking proof.
4. **Customer-insight taxonomy.** Replace free-form pain points with typed insights — need / objection / desired outcome / switching trigger / customer language — each with `creative_use` and a footage suggestion. In Nigeria the objection type will usually dominate (fear of paying for what they won't get, delivery trust, "na original?"), which maps directly onto Talla's existing demo pain points.
5. **Score-before-spend gate.** Add an Ava-`draft_check` equivalent between Scriptwriter and generation: score the brief/script against the research patterns (hook strength, product fit, pacing, claim risk), show strengths/risks, allow one plain-language revision ("make the hook punchier", "switch to Pidgin") — and only then show the credit estimate and generate. Keeps Talla's credit charging honest and cuts wasted renders. Keep Ava's honesty label: an AI judgment, not a performance prediction.
6. **Ingredients-style variables.** Treat hook, actor/creator persona, product, proof/B-roll, and CTA as swappable slots. Then "6 hooks from 1 brief, same offer, same CTA" and batch variants (same demo, new opening) become cheap — critical for Nigerian sellers who need volume to find one winner, and for testing language (same video, Pidgin vs Nigerian English CTA).
7. **Template cart + taxonomy for Nigeria.** A small, opinionated template library filtered by format, category (beauty, fashion, food, phones/gadgets, home goods), style (talking-head testimonial, before/after, POV unboxing, street-style interview), platform (TikTok/IG/WhatsApp Status), language, and length (<15s/<30s) — pre-filled with Nigerian settings, prices-in-naira proof moments, and WhatsApp CTAs. Naming convention `Seller - HookPattern - Persona - CTA - v01` for batch review.
8. **Free estimates + visible credit holds.** Before any paid step, show the estimated credits (and naira equivalent if Talla prices that way); report `credits_charged` per step (research / storyboard / script / render / retries) and never double-charge an idempotent retry. Publish Talla's own "cost per usable video" so sellers compare on finished, postable videos — not headline price.
9. **Weekly plan surface (light version).** For repeat sellers: a simple weekly slate (Mon hook test, Wed before/after, Fri founder/owner story) where winners automatically spawn variants. This is Ava's retention loop; Talla's version can be WhatsApp-delivered ("your 3 videos for this week are ready") given Nigerian sellers live on WhatsApp, not dashboards.

## What to avoid

1. **Do not copy the "viral" promise.** Ava's own current blog/docs are careful: views ≠ sales, a high-view video is not a "winning ad", brief scores are not calibrated predictions. Talla should never market "viral-ready" outcomes to Nigerian sellers whose real metric is WhatsApp orders. Sell *tested, trustworthy, postable* videos; measure chats/orders, not views.
2. **Do not clone creators.** Ava's rule — clone format, pacing, and hook mechanic, never a creator's identity, footage, claims, or a fake firsthand experience. Especially avoid AI presenters scripted as fake Nigerian customer testimonials ("I bought this and it cured...") without a real, authorised customer. That is both a trust killer in a low-trust market and an ad-disclosure risk.
3. **Do not invent claims, prices, or proof.** Ava gates drafted copy to approved claims and demands real product footage for feature claims. Talla must not generate fake before/after results, fake prices/scarcity, or AI "product demos" that misrepresent what a seller actually delivers — Nigerian buyers already assume online sellers exaggerate.
4. **Do not build a 30-model, MCP-first platform before the core loop works.** Ava's breadth (30+ models, API/CLI/MCP, planner, campaigns) reflects a funded platform. Talla's replicable core is narrow: research -> brief -> storyboard -> script -> scored check -> generate -> WhatsApp-ready export. Add model choice only where it changes outcomes (e.g. fast/cheap vs. high-quality tier).
5. **Do not hide costs behind credits alone.** Ava pairs credits with free estimates, per-step reporting, budgets, and caps. A credits-only balance with surprise render charges (especially failed-generation charges) will churn Nigerian sellers fast. State failed-generation and retry policy in plain language up front.
6. **Do not import Ava's category assumptions.** Ava's corpus, examples, and blog skew to US SaaS/app ads (app installs, activated signups). The mechanics transfer; the content does not. Talla needs its own Nigerian corpus (physical goods, services, food, beauty, fashion), Nigerian proof formats (live test, unboxing, delivery receipt, customer pickup), and CTAs (WhatsApp chat, DM, call, visit shop) — not "download the app".
7. **Do not let research become a report.** Ava treats research output that doesn't end in a chosen template/project as waste. If Talla's Researcher output can't be clicked into a storyboard, it is decoration. Also mirror Ava's research hygiene: public links only, poster handles only (never commenters' personal data), no raw scraping of private feeds.

## Prompt implications

Current state (`talla/worker/src/agents.js:27-51`): `researchAgent` scrapes the product URL via Firecrawl and runs one Exa search (`"<name> Nigeria customer reviews problems UGC video hooks"`), then the Researcher system prompt asks for bare JSON `{pain_points[], desires[], hooks[3], formats[], recommended_language, tone_notes, visual_notes}` with "ground hooks in Nigerian buying behaviour". `demoResearch` mirrors the same flat shape. Five concrete upgrades, in priority order:

1. **Return evidence, not just lines (schema change).** Change `hooks[3]` (strings) to hook objects and add a sources array, e.g. `{text, pattern, format, language, source_url, creator, observed_metric, metric_checked_at, basis: "observed"|"inferred"}`. Add to the system prompt: *"For every hook and format, cite the specific source it came from (URL from the web enrichment) or set basis to inferred. Separate what sources show from what you are guessing. Never present inferred hooks as observed winners."* This is Ava's worksheet + `rationale.evidence.provenance` discipline, and it makes the UI able to show "why this hook" — currently impossible with the flat schema.
2. **Add a Nigerian customer-insight taxonomy + claims guardrail.** Replace/extend `pain_points[]`/`desires[]` with typed insights: `insights: [{kind: "need|objection|desired_outcome|switching_trigger|customer_language", summary, creative_use, footage_suggestion}]`, plus `claims_used[]` and `do_not_say[]`. Prompt addition: *"Only state product facts present in the product description, URL scrape, or sources. Put any unverifiable benefit, price, delivery, or result claim in do_not_say, never in a hook. Prioritise trust objections (paying for what they will not get, original vs fake, delivery) where the category has them."* Prevents the Scriptwriter from inheriting invented claims — a current gap, since nothing in the pipeline distinguishes verified facts from plausible copy.
3. **Make every research run end in a testable brief.** Add `test_hypothesis`, `recommended_format_rationale`, and `unknowns[]` (what the research could not verify: spend, conversions, real customer results) to the Researcher output, plus `predicted_strength: {level: "High|Medium|Low", why}` per recommended hook/format. Prompt addition: *"End with one test_hypothesis: the single audience response this video should test, what stays constant, and what one thing changes (hook only, by default). List unknowns explicitly instead of filling gaps."* This gives `storyboardAgent`/`scriptAgent` a decision to execute instead of vibes, and mirrors Ava's brief `rationale` without copying its scoring claims.
4. **Score the hook set before storyboard spend (Critic-style pre-check inside Researcher output).** Ask the Researcher to self-rank its own hooks with risks: `hooks[].strength: "low|medium|high"`, `hooks[].risk` (e.g. "claims a result we cannot prove", "too generic", "English hook for a Pidgin-first audience"). Prompt addition: *"Score each hook low/medium/high for specificity (names a problem, person, price context, or visible proof in the first 3 seconds). Downgrade generic hype such as 'this product changed my life' unless the next scene proves it. Flag any hook whose promise the product demo cannot show."* Cheap quality gate before Baseten storyboard/script credits are spent downstream.
5. **Tighten language grounding.** Current prompt says "suggest Pidgin/Yoruba/Hausa/Igbo/Nigerian English where natural" but the schema only returns a single `recommended_language`. Change to per-hook language + a `language_rationale`, and add: *"Write each hook in the exact language tagged (pidgin | yoruba | hausa | igbo | nigerian-english) as a Nigerian creator would actually say it — short, spoken, one idea. If a hook only works in English, keep it in English and say why. Never mix languages inside one hook unless that mix is how the audience speaks."* Also feed the Exa query the chosen category + Nigerian platforms explicitly (e.g. append `TikTok Nigeria OR Instagram Nigeria OR WhatsApp seller reviews`) so enrichment returns citable Nigerian examples rather than generic web text.
