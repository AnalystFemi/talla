// External provider calls. Every function degrades gracefully:
// no key -> caller falls back to labelled demo output. Nothing runs locally
// except tiny JSON API calls; all heavy media work is Modal/Cloudflare.

export function has(env, key) { return Boolean(env?.[key]); }

export async function basetenChat(env, messages, { json = true } = {}) {
  const res = await fetch(`${env.BASETEN_BASE_URL || "https://inference.baseten.co/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BASETEN_API_KEY}` },
    body: JSON.stringify({
      model: env.BASETEN_MODEL || "meta-models/muse-spark-open-1026",
      messages, temperature: 0.7, max_tokens: 2500,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Baseten ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const text = msg.content || msg.reasoning_content || "{}";
  if (!json) return text;
  // Models often fence JSON in ```json blocks — strip before parsing.
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
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

/** Muse Image 1.0 via Meta Model API (OpenAI-compatible). $0.01/image. */
export async function museImage(env, prompt, { size = "1024x1536" } = {}) {
  const base = (env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.META_API_KEY}` },
    body: JSON.stringify({
      model: env.MUSE_IMAGE_MODEL || "muse-image-1.0", prompt, n: 1, size,
      reasoning_strength: "low",
      tool_enablement: { enable_web_search: false, enable_image_search: false, enable_shell: false },
    }),
  });
  if (!res.ok) throw new Error(`Muse Image ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const item = data.data?.[0] || {};
  return item.b64_json ? `data:image/webp;base64,${item.b64_json}` : item.url;
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
