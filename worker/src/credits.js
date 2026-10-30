// Credit manager — protects the hackathon budgets.
// Rules: Baseten first for LLM work; Meta credits only for Muse Image + final
// high-stakes calls; cache everything; critic retries capped; 768p first.

// Hard caps set by the user: $50 TOTAL for the whole project.
// (The hackathon issued more credit than this; we deliberately spend $50 max.)
export const TOTAL_BUDGET_USD = 50;
export const BUDGETS_USD = {
  baseten: 20,    // Muse Spark Open: research, storyboard, script, critic
  meta: 15,       // Muse Image keyframes + character regeneration + finals
  modal: 10,      // GPU media — Wan/LTX cold starts are the risk; see CREDITS.md
  firecrawl: 5,   // research enrichment (Exa skipped — key pending)
};

// Estimated cost per operation (USD). Update with real provider pricing.
// The modal:* video/voice/stitch figures are ESTIMATES pending calibration
// (no measured invoice yet): wan_clip assumes one 720x1280 Wan 2.2 clip on
// an H100 incl. a share of cold start; ltx_clip a ~10 s LTX clip; tts_scene
// one YarnGPT2/MMS line; stitch one ffmpeg composite. Deliberately on the
// HIGH side so the $50 guard trips early rather than late.
export const COSTS_USD = {
  "baseten:research": 0.02, "baseten:storyboard": 0.015, "baseten:script": 0.02,
  "baseten:critic": 0.01, "baseten:export": 0.01, "meta:muse_image": 0.01, "meta:spark_final": 0.05,
  "meta:muse_transcribe": 0.01, "meta:spark_polish": 0.03, "meta:sam_segment": 0.02,
  "modal:h3_clip": 0.9, // PARKED legacy estimate — no route submits H3 (see worker index.js)
  "modal:wan_clip": 1.20, // 720p H100 estimate, UNCALIBRATED
  "modal:ltx_clip": 0.60, // estimate, uncalibrated
  "modal:tts_scene": 0.03, // estimate, uncalibrated
  "modal:stitch": 0.03, // estimate, uncalibrated
  "firecrawl:scrape": 0.005, "exa:search": 0.005,
};

export const LIMITS = {
  criticRetriesPerScene: 2,
  regenerationsPerProject: 2,
  softCapPct: 0.8, // warn at 80% of any budget
};

// Spend totals. When D1 is bound, refreshTotals() reloads them from
// credit_log at the start of every request, so the guard sees spend from
// EVERY isolate/poll (an in-memory log alone reset on each Workers cold
// start and let the $50 cap be exceeded). Locally (no DB) the totals simply
// accumulate in-process. charge() also bumps the snapshot so several paid
// calls inside one request see each other.
const totals = { source: "memory", spent: {}, calls: 0, refreshed_at: null };
const cache = new Map(); // hash -> result, prevents paying twice for same input

const normProvider = (p) => (p === "exa" ? "firecrawl" : p); // Firecrawl + Exa share the research cap
const costOf = (provider, operation) =>
  COSTS_USD[`${provider}:${operation}`] ?? COSTS_USD[`exa:${operation}`] ?? 0;

/** Cache key over the FULL input. The old key truncated the joined string
 * to 500 chars, so two long keyframe prompts that only differed after char
 * 500 (e.g. the scene visual) collided and returned the wrong still. Two
 * FNV-1a passes with different offsets -> 64 bits + length. */
export function cacheKey(...parts) {
  const joined = parts.map((x) => (x == null ? "" : String(x))).join("|");
  return `${String(parts[0] ?? "")}:${contentHash(joined)}:${contentHash("salt2|" + joined)}`;
}

/** Stable short content fingerprint (FNV-1a hex). Used so content-addressed
 * caches (SAM QC, keyframes) are keyed by the image itself, not by a URL
 * suffix that a regenerated still could share with its predecessor. */
export function contentHash(input) {
  const s = String(input || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "h" + h.toString(16).padStart(8, "0") + "-" + s.length;
}
export function cacheGet(key) { return cache.get(key); }
export function cacheSet(key, value) { cache.set(key, value); return value; }

/** Reload per-provider totals from D1 (one GROUP BY query). Called once per
 * request by the API middleware. A D1 failure keeps the last snapshot and
 * is logged — it never silently zeroes the spend. */
export async function refreshTotals(env) {
  if (!env?.DB) return totals;
  try {
    const { results } = await env.DB.prepare(
      "SELECT provider, SUM(estimated_usd) AS used, COUNT(*) AS n FROM credit_log GROUP BY provider"
    ).all();
    const spent = {}; let calls = 0;
    for (const r of results || []) {
      const prov = normProvider(r.provider);
      spent[prov] = (spent[prov] || 0) + Number(r.used || 0);
      calls += Number(r.n || 0);
    }
    totals.spent = spent; totals.calls = calls; totals.source = "d1"; totals.refreshed_at = new Date().toISOString();
  } catch (e) { console.error("[credits] D1 totals refresh failed:", e?.message || e); }
  return totals;
}

export async function charge(env, provider, operation, projectId, { cached = false } = {}) {
  provider = normProvider(provider);
  const estimated = cached ? 0 : costOf(provider, operation);
  const entry = { provider, operation, estimated_usd: estimated, project_id: projectId || null, cached: cached ? 1 : 0 };
  totals.spent[provider] = (totals.spent[provider] || 0) + estimated;
  totals.calls += 1;
  if (env?.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO credit_log (provider, operation, estimated_usd, project_id, cached) VALUES (?1,?2,?3,?4,?5)"
      ).bind(provider, operation, estimated, entry.project_id, entry.cached).run();
    } catch (e) { console.error("[credits] D1 credit_log insert failed:", e?.message || e); } // never break generation, but never hide it
  }
  return entry;
}

export function creditSummary() {
  const spent = totals.spent;
  // Union of capped providers + anything actually spent (e.g. a late Exa key)
  // so the $50 global total can never be under-counted.
  const allProviders = { ...BUDGETS_USD };
  for (const k of Object.keys(spent)) if (!(k in allProviders)) allProviders[k] = 0;
  const providers = Object.entries(allProviders).map(([provider, budget]) => {
    const used = +(spent[provider] || 0).toFixed(4);
    return { provider, budget_usd: budget, estimated_used_usd: used,
      remaining_usd: +(budget - used).toFixed(4), pct_used: budget ? Math.round((used / budget) * 100) : 0,
      warning: used >= budget * LIMITS.softCapPct };
  });
  const totalUsed = +providers.reduce((a, p) => a + p.estimated_used_usd, 0).toFixed(4);
  return { providers, limits: LIMITS, calls_logged: totals.calls, source: totals.source, refreshed_at: totals.refreshed_at,
    estimates_note: "modal:* costs are estimates pending calibration",
    total: { budget_usd: TOTAL_BUDGET_USD, estimated_used_usd: totalUsed,
      remaining_usd: +(TOTAL_BUDGET_USD - totalUsed).toFixed(4),
      warning: totalUsed >= TOTAL_BUDGET_USD * LIMITS.softCapPct } };
}

/** Hard guard for an explicit USD amount: throws BUDGET_EXHAUSTED when the
 * provider cap OR the $50 global cap cannot cover it. */
export function assertBudgetUsd(provider, usd, label = "") {
  provider = normProvider(provider);
  const summary = creditSummary();
  const need = Math.max(Number(usd) || 0, 0);
  if (summary.total.remaining_usd < need || summary.total.remaining_usd <= 0)
    throw new Error(`BUDGET_EXHAUSTED:total_$${TOTAL_BUDGET_USD}${label ? ` (${label} needs ~$${need.toFixed(2)})` : ""}`);
  const s = summary.providers.find((p) => p.provider === provider);
  if (s && (s.remaining_usd < need || s.remaining_usd <= 0))
    throw new Error(`BUDGET_EXHAUSTED:${provider}${label ? ` (${label} needs ~$${need.toFixed(2)})` : ""}`);
  return s;
}

/** Hard guard before ONE paid operation: remaining must cover ITS cost
 * (the old check only refused once remaining hit <= 0, so the call that
 * crossed the cap always went through). */
export function assertBudget(provider, operation) {
  return assertBudgetUsd(provider, operation ? costOf(normProvider(provider), operation) : 0, operation);
}

export function estimateCost(provider, operation) { return costOf(normProvider(provider), operation); }
