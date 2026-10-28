// Credit manager — protects the hackathon budgets.
// Rules: Baseten first for LLM work; Meta credits only for Muse Image + final
// high-stakes calls; cache everything; critic retries capped; 768p first.

export const BUDGETS_USD = {
  baseten: 100,   // confirmed $100, Muse Spark Open
  meta: 150,      // confirmed $150, preserve for Muse Image + final passes
  modal: 30,      // assumed free-tier/recurring — CONFIRM actual Modal credit
  firecrawl: 10,
  exa: 10,
};

// Estimated cost per operation (USD). Update with real provider pricing.
export const COSTS_USD = {
  "baseten:research": 0.02, "baseten:storyboard": 0.015, "baseten:script": 0.02,
  "baseten:critic": 0.01, "meta:muse_image": 0.01, "meta:spark_final": 0.05,
  "modal:h3_clip": 0.35, "modal:wan_clip": 0.08, "modal:liveportrait_clip": 0.01,
  "modal:ltx_clip": 0.02, "modal:tts_scene": 0.01, "modal:stitch": 0.02,
  "firecrawl:scrape": 0.005, "exa:search": 0.005,
};

export const LIMITS = {
  criticRetriesPerScene: 2,
  regenerationsPerProject: 2,
  softCapPct: 0.8, // warn at 80% of any budget
};

const log = []; // local fallback; mirrored to D1 credit_log when DB bound
const cache = new Map(); // hash -> result, prevents paying twice for same input

export function cacheKey(...parts) {
  return parts.join("|").slice(0, 500);
}
export function cacheGet(key) { return cache.get(key); }
export function cacheSet(key, value) { cache.set(key, value); return value; }

export async function charge(env, provider, operation, projectId, { cached = false } = {}) {
  const estimated = cached ? 0 : (COSTS_USD[`${provider}:${operation}`] ?? 0);
  const entry = { provider, operation, estimated_usd: estimated, project_id: projectId || null, cached: cached ? 1 : 0 };
  log.push(entry);
  if (env?.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO credit_log (provider, operation, estimated_usd, project_id, cached) VALUES (?1,?2,?3,?4,?5)"
      ).bind(provider, operation, estimated, entry.project_id, entry.cached).run();
    } catch { /* local dev without D1 must never break generation */ }
  }
  return entry;
}

export function creditSummary() {
  const spent = {};
  for (const e of log) spent[e.provider] = (spent[e.provider] || 0) + e.estimated_usd;
  const providers = Object.entries(BUDGETS_USD).map(([provider, budget]) => {
    const used = +(spent[provider] || 0).toFixed(4);
    return { provider, budget_usd: budget, estimated_used_usd: used,
      remaining_usd: +(budget - used).toFixed(4), pct_used: budget ? Math.round((used / budget) * 100) : 0,
      warning: used >= budget * LIMITS.softCapPct };
  });
  return { providers, limits: LIMITS, calls_logged: log.length };
}

/** Hard guard: throws when a provider budget is exhausted. */
export function assertBudget(provider) {
  const s = creditSummary().providers.find((p) => p.provider === provider);
  if (s && s.remaining_usd <= 0) throw new Error(`BUDGET_EXHAUSTED:${provider}`);
  return s;
}
