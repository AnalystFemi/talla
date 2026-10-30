// External provider calls. Every function degrades gracefully:
// no key -> caller falls back to labelled demo output. Nothing runs locally
// except tiny JSON API calls; all heavy media work is Modal/Cloudflare.
//
// Hardening rules (review 2026-10-30):
//  - every fetch carries AbortSignal.timeout, so a hung provider can never
//    pin a Worker request (or a job lock) forever;
//  - raw provider error BODIES are logged with console.error, never put in
//    the thrown message — route handlers echo e.message to clients and a
//    body can leak prompts, keys-in-echo, or internal stack text;
//  - Modal POSTs are NOT retried: a 5xx/timeout after the gateway accepted
//    the request may already have spawned a paid GPU call, and a retry
//    would bill twice. Only result polls (idempotent reads) retry.

export function has(env, key) { return Boolean(env?.[key]); }

const T = { llm: 90000, image: 120000, sam: 90000, transcribe: 120000, search: 30000,
  modalSpawn: 60000, modalPoll: 20000, voice: 180000, file: 30000 };

async function failBody(name, res) {
  // Log the provider's body for the operator; return only the status.
  const body = await res.text().catch(() => "");
  console.error(`[${name}] HTTP ${res.status}: ${body.slice(0, 600)}`);
  return body;
}

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
      signal: AbortSignal.timeout(T.llm),
    });
    if (!res.ok) { await failBody("baseten", res); throw new Error(`Baseten ${res.status}`); }
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
  console.error("[baseten] invalid JSON after 3 attempts:", lastErr?.message);
  throw new Error("Baseten returned invalid JSON after 3 attempts");
}

export async function firecrawlScrape(env, url) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal: AbortSignal.timeout(T.search),
  });
  if (!res.ok) { await failBody("firecrawl", res); throw new Error(`Firecrawl ${res.status}`); }
  const data = await res.json();
  return (data.data?.markdown || "").slice(0, 6000);
}

export async function exaSearch(env, query) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.EXA_API_KEY },
    body: JSON.stringify({ query, numResults: 5, contents: { text: { maxCharacters: 1500 } } }),
    signal: AbortSignal.timeout(T.search),
  });
  if (!res.ok) { await failBody("exa", res); throw new Error(`Exa ${res.status}`); }
  const data = await res.json();
  return (data.results || []).map((r) => ({ title: r.title, url: r.url, text: (r.text || "").slice(0, 800) }));
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
    signal: AbortSignal.timeout(T.transcribe),
  });
  if (!res.ok) { await failBody("muse-transcribe", res); throw new Error(`MuseTranscribe ${res.status}`); }
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
 *  detections from the output_text lane. */
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
    signal: AbortSignal.timeout(T.sam),
  });
  if (!res.ok) { await failBody("sam", res); throw new Error(`SAM ${res.status}`); }
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

/** Muse Image 1.0 via Meta Model API (OpenAI-compatible). $0.01/image.
 *  A content-policy rejection is thrown with e.code = "content_policy" so
 *  the caller can retry with safer wording without parsing a body. */
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
    signal: AbortSignal.timeout(T.image),
  });
  if (!res.ok) {
    const body = await failBody("muse-image", res);
    const policy = /content_policy/i.test(body);
    const err = new Error(`Muse Image ${res.status}${policy ? ": content_policy" : ""}`);
    if (policy) err.code = "content_policy";
    throw err;
  }
  const data = await res.json();
  const item = data.data?.[0] || {};
  return item.b64_json ? `data:image/webp;base64,${item.b64_json}` : item.url;
}

// ---------------------------------------------------------------- Modal ---
// Every Modal web endpoint is token-gated (contract §4): the Worker sends
// X-Talla-Token = env.MODAL_ENDPOINT_TOKEN on every call, poll and file read.
function modalHeaders(env, extra = {}) {
  const h = { ...extra };
  if (env?.MODAL_ENDPOINT_TOKEN) h["X-Talla-Token"] = env.MODAL_ENDPOINT_TOKEN;
  return h;
}

/** POST to a Modal web endpoint (spawn, or a synchronous voice call);
 * returns parsed JSON. ONE attempt only — see header note. Errors carry
 * e.ambiguous = true when the request may have reached Modal (timeout,
 * network drop, 5xx), so callers can record the charge conservatively. */
export async function modalCall(env, endpoint, payload, { timeoutMs = T.modalSpawn } = {}) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST", headers: modalHeaders(env, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = new Error(e?.name === "TimeoutError" ? `Modal timed out after ${Math.round(timeoutMs / 1000)}s` : "Modal unreachable");
    err.ambiguous = true;
    console.error("[modal] call failed:", e?.message || e);
    throw err;
  }
  if (!res.ok) {
    await failBody("modal", res);
    const err = new Error(res.status === 401 ? "Modal 401 (endpoint token rejected)" : `Modal ${res.status}`);
    err.ambiguous = res.status >= 500;
    throw err;
  }
  return res.json();
}

/** ONE non-blocking result check for a spawned Modal call (contract §3:
 * result endpoints answer immediately). Returns {status:"running"} |
 * {status:"complete",...} | {status:"error",error}. Transient poll
 * failures retry once, then report "running" with poll_error set so the
 * step machine simply tries again on the next client poll. */
export async function modalPollOnce(env, resultEndpoint, callId) {
  const url = `${resultEndpoint}?call_id=${encodeURIComponent(callId)}`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: modalHeaders(env), signal: AbortSignal.timeout(T.modalPoll) });
      if (res.ok) return await res.json();
      await failBody("modal-poll", res);
      if (res.status === 401) return { status: "error", error: "Modal 401 (endpoint token rejected)" };
      lastErr = `Modal poll ${res.status}`;
    } catch (e) { lastErr = e?.name === "TimeoutError" ? "Modal poll timed out" : "Modal poll unreachable"; }
  }
  return { status: "running", poll_error: lastErr };
}

/** Fetch one finished file from the talla-outputs volume via the token-gated
 * stitch_app file_http endpoint. Returns the raw Response (streamable). The
 * timeout guards only the wait for HEADERS — a long video body may stream
 * to the browser for longer than that. */
export async function modalFile(env, name, { range } = {}) {
  if (!env?.MODAL_FILE_ENDPOINT) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), T.file);
  try {
    return await fetch(`${env.MODAL_FILE_ENDPOINT}?name=${encodeURIComponent(name)}`, {
      headers: modalHeaders(env, range ? { Range: range } : {}), signal: ac.signal,
    });
  } finally { clearTimeout(timer); }
}

export const VOICE_TIMEOUT_MS = T.voice;

// Workers-safe base64 (no Node Buffer, so no nodejs_compat flag): chunked
// String.fromCharCode keeps the argument list under engine limits.
export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
