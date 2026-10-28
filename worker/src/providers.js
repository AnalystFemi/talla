// External provider calls. Every function degrades gracefully:
// no key -> caller falls back to labelled demo output. Nothing runs locally
// except tiny JSON API calls; all heavy media work is Modal/Cloudflare.

export function has(env, key) { return Boolean(env?.[key]); }

export async function basetenChat(env, messages, { json = true } = {}) {
  const res = await fetch(`${env.BASETEN_BASE_URL || "https://inference.baseten.co/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BASETEN_API_KEY}` },
    body: JSON.stringify({
      model: env.BASETEN_MODEL || "meta/muse-spark-open",
      messages, temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Baseten ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  return json ? JSON.parse(text) : text;
}

export async function firecrawlScrape(env, url) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
  const data = await res.json();
  return (data.data?.markdown || "").slice(0, 6000);
}

export async function exaSearch(env, query) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.EXA_API_KEY },
    body: JSON.stringify({ query, numResults: 5, contents: { text: { maxCharacters: 1500 } } }),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({ title: r.title, url: r.url, text: (r.text || "").slice(0, 800) }));
}

/** Ask a Modal web endpoint to do GPU work; returns parsed JSON. */
export async function modalCall(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Modal ${res.status}: ${await res.text()}`);
  return res.json();
}
