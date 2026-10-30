// API helper + client-side storage for the Talla Studio.
// VITE_API_URL points the production build at the Worker (e.g. https://talla-api.<acct>.workers.dev).
// Locally it is empty and Vite proxies /api to the Worker on :8787.
export const API = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export const OFFLINE_MSG = import.meta.env.DEV
  ? "API offline — start the Worker on localhost:8787"
  : "API offline — please try again in a moment";

export const ACCESS_REQUIRED_MSG =
  "This step spends real credits, so it needs an access code. Enter it under “Access code” at the top of the Studio — everything else keeps working in demo mode.";

const ACCESS_KEY = "talla_access_code";
const LAST_PROJECT_KEY = "talla_last_project";
const jobKey = (pid) => `talla_job_${pid}`;

function readStore(key) { try { return window.localStorage.getItem(key) || ""; } catch { return ""; } }
function writeStore(key, value) {
  try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* storage blocked — ignore */ }
}

export const getAccessCode = () => readStore(ACCESS_KEY);
export const setAccessCode = (code) => writeStore(ACCESS_KEY, String(code || "").trim());
export const getLastProject = () => readStore(LAST_PROJECT_KEY);
export const setLastProject = (pid) => writeStore(LAST_PROJECT_KEY, pid);

// In-flight job per project: { id, started } so polling resumes after a reload.
export function getStoredJob(pid) {
  try { const v = JSON.parse(readStore(jobKey(pid)) || "null"); return v && v.id ? v : null; } catch { return null; }
}
export const setStoredJob = (pid, value) => writeStore(jobKey(pid), value ? JSON.stringify(value) : "");

export class ApiError extends Error {
  constructor(message, status, code, data) { super(message); this.status = status; this.code = code; this.data = data; }
}

export async function api(path, opts = {}) {
  const code = getAccessCode();
  const headers = { "Content-Type": "application/json", ...(code ? { "X-Talla-Access": code } : {}), ...(opts.headers || {}) };
  let res;
  try { res = await fetch(API + path, { ...opts, headers }); }
  catch { throw new ApiError(OFFLINE_MSG, 0, "offline", null); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.message || data.error || `Request failed (${res.status})`;
    if (res.status === 401 && data.error === "access_required") msg = ACCESS_REQUIRED_MSG;
    if (res.status === 402) msg = "Budget guard stopped this run — " + (data.message || data.error || "the remaining hackathon credit is lower than this step would cost.");
    throw new ApiError(msg, res.status, data.error, data);
  }
  return data;
}

// Worker media paths (/api/media/file/…, /api/media/r2/…) live on the API origin.
export const mediaUrl = (u) => (typeof u === "string" && u.startsWith("/api/") ? API + u : u);
export const isPlayable = (u) => typeof u === "string" && !!u && !u.startsWith("modal-volume://");
