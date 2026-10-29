// External provider calls. Every function degrades gracefully:
// no key -> caller falls back to labelled demo output. Nothing runs locally
// except tiny JSON API calls; all heavy media work is Modal/Cloudflare.

export function has(env, key) { return Boolean(env?.[key]); }

export async function basetenChat(env, messages, { json = true } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const msgs = attempt === 1 ? messages : [
      ...messages,
      { role: "system", content: "IMPORTANT: Return ONLY valid JSON. Escape every double quote inside strings. No markdown, no commentary." },
    ];
    const res = await fetch(`${env.BASETEN_BASE_URL || "https://inference.baseten.co/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BASETEN_API_KEY}` },
      body: JSON.stringify({
        model: env.BASETEN_MODEL || "meta-models/muse-spark-open-1026",
        messages: msgs, temperature: attempt === 1 ? 0.7 : 0.3, max_tokens: 4000,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Baseten ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    const text = msg.content || msg.reasoning_content || "{}";
    if (!json) return text;
    try {
      // Models often fence JSON in ```json blocks — strip before parsing.
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
      return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`Baseten returned invalid JSON after 3 attempts: ${lastErr?.message}`);
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

/** Async Modal job: POST spawns (returns {call_id}), then poll the paired
 * result endpoint until complete. Required for multi-minute GPU work —
 * Modal's HTTP gateway times out long synchronous requests. */
export async function modalJobCall(spawnEndpoint, resultEndpoint, payload, { pollMs = 10000, timeoutMs = 1200000 } = {}) {
  const spawn = await modalCall(spawnEndpoint, payload);
  if (!spawn.call_id) return spawn; // sync-style endpoint, already the result
  if (!resultEndpoint) throw new Error("Missing Modal result endpoint for async job");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const res = await fetch(`${resultEndpoint}?call_id=${encodeURIComponent(spawn.call_id)}`);
    if (!res.ok) continue; // transient gateway blip while polling
    const out = await res.json();
    if (out.status === "complete") return out;
    if (out.status === "error") throw new Error(out.error || "Modal job failed");
  }
  throw new Error(`Modal job timed out after ${Math.round(timeoutMs / 60000)} min (call ${spawn.call_id})`);
}

/** Muse Voice Transcribe 1.0 via Meta Model API — VERIFY stage.
 *  One-shot probe: we post the WAV (multipart or JSON-b64) and TOLERATE the
 *  response shape, since the exact transcription wire format is not yet
 *  documented against our key. Never let this throw into generation. */
export async function museTranscribe(env, wavB64, { language } = {}) {
  const base = (env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  const body = { model: env.MUSE_TRANSCRIBE_MODEL || "muse-voice-transcribe-1.0",
    file: wavB64, ...(language ? { language } : {}), response_format: "json" };
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.META_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MuseTranscribe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.text || data.transcript || data.data?.text || data.output_text || "";
  const words = data.words || data.data?.words || null; // word-level timestamps when provided
  return { text, words: Array.isArray(words) ? words : null };
}

/** SAM 3.1 via Meta Model API Responses — QC / segmentation stage.
 *  One short noun phrase per call ("person", "phone"); returns bounding
 *  boxes with confidences. Docs: dev.meta.ai/docs/sam/overview — model
 *  sam-3.1 over POST /v1/responses, same Bearer key as the rest of the API.
 *  NON-STREAMING probe: we tolerate the response shape and only count
 *  detections from the output_text lane. Never throws into generation. */
export async function samSegment(env, imageDataUrl, phrase) {
  const base = (env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "");
  // NOTE: no include_confidence — live probe 2026-10-29: this deploy rejects
  // it ("unknown parameter"), despite the docs marking it optional.
  const body = {
    model: env.SAM_MODEL || "sam-3.1",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: phrase },
      { type: "input_image", image_url: imageDataUrl },
    ] }],
  };
  const res = await fetch(`${base}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.META_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SAM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  AC_SAM_COUNT += 1;
  // Responses API: output[].content[] with type output_text; tolerate the
  // shorthand output_text lane too.
  let text = "";
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") text += part.text;
    }
  }
  if (typeof data.output_text === "string") text += data.output_text;
  // Each detection record pairs one <|box;...|> token; count = detections.
  const boxes = [...text.matchAll(/<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g)]
    .map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], frame_w: +m[5], frame_h: +m[6],
      confidence: m[7] ? Number(m[7]) : null }));
  return { phrase, detections: boxes.length, boxes, raw_len: text.length };
}

let AC_SAM_COUNT = 0;
export function samCallCount() { return AC_SAM_COUNT; }

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

/** Ask a Modal web endpoint to do GPU work; returns parsed JSON.
 * Retries transient gateway/cold-start failures (Modal endpoints can 5xx
 * while a GPU container schedules). Business errors in the JSON body are
 * returned by callers, not retried here beyond HTTP level. */
export async function modalCall(endpoint, payload, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return res.json();
      const body = await res.text();
      if (res.status < 500 && res.status !== 429) throw new Error(`Modal ${res.status}: ${body}`);
      lastErr = new Error(`Modal ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      if (e.message?.startsWith("Modal 4")) throw e;
      lastErr = e;
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, i * 5000));
  }
  throw lastErr || new Error("Modal call failed");
}
