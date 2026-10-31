import { useEffect, useRef, useState } from "react";
import { ACCESS_REQUIRED_MSG, OFFLINE_MSG, api, getAccessCode, getLastProject, getStoredJob, isPlayable, mediaUrl,
  setAccessCode, setLastProject, setStoredJob } from "./api.js";
import Home, { Logo } from "./Home.jsx";
import { AGENTS, EMPTY_FORM, ENGINES, FORMATS, LANGS, LANG_LABELS, MODEL_BADGES, PERSONAS, SAMPLE_PRODUCT,
  STAGE_LABELS } from "./content.js";

const POLL_MS = 5000;
const clampSeconds = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(15, Math.max(3, Math.round(n))) : 6; };
const withCleanSeconds = (sb) => ({ ...sb, scenes: (sb?.scenes || []).map((s) => ({ ...s, seconds: clampSeconds(s.seconds) })) });
const jobStart = (j) => { const t = j?.created_at ?? j?.started_at; const ms = typeof t === "number" ? t : Date.parse(t || ""); return Number.isFinite(ms) ? ms : Date.now(); };
const fmtElapsed = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const personaInitials = (p) => {
  const m = String(p?.label || "").match(/\(([^)]+)\)/);
  const name = (m ? m[1] : String(p?.label || "")).trim();
  const parts = name.split(/[\s—–-]+/).filter(Boolean);
  const init = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  return init || "•";
};

const agentImgOf = (k) => (AGENTS.find((a) => a.key === k) || AGENTS[0]).img;

function Skeleton({ cards = 3, tall = false }) {
  return (<div className={"skel-grid" + (tall ? " tall" : "")} aria-hidden="true">
    {Array.from({ length: cards }).map((_, i) => (
      <div className="skel-card" key={i} style={{ "--i": i }}>
        {tall && <div className="skel thumb" />}
        <div className="skel line w40" /><div className="skel line w90" /><div className="skel line w75" /><div className="skel line w60" />
      </div>))}
  </div>);
}

function StageHead({ n, title, sub, agent, model, extra, working, headRef }) {
  return (<header className="stage-head">
    <p className="stage-eyebrow">Step {n + 1} of 6</p>
    <h1 className="stage-title" tabIndex={-1} ref={headRef}>{title}</h1>
    {sub && <p className="stage-sub">{sub}</p>}
    {(agent || model || extra) && <div className="stage-meta">
      {agent && <span className={"agent-chip" + (working ? " working" : "")}><img src={agentImgOf(agent)} alt="" width="40" height="40" />{AGENTS.find((a) => a.key === agent)?.name}</span>}
      {model && <span className="pill">{model}</span>}
      {extra}
    </div>}
  </header>);
}

function Studio({ go }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [project, setProject] = useState(null);
  const [job, setJob] = useState(null);
  const [jobStarted, setJobStarted] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [pollError, setPollError] = useState("");
  const [frames, setFrames] = useState([]);
  const [engine, setEngine] = useState("wan");
  const [voicePreview, setVoicePreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthOk, setHealthOk] = useState(null);
  const [pkg, setPkg] = useState(null);
  const [copied, setCopied] = useState("");
  const [lastCopied, setLastCopied] = useState("");
  const [checkState, setCheckState] = useState({});
  const [qcRun, setQcRun] = useState(null);
  const [sbDirty, setSbDirty] = useState(false);
  const [openingPick, setOpeningPick] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const [accessInput, setAccessInput] = useState("");
  const [accessMsg, setAccessMsg] = useState("");
  const [hasCode, setHasCode] = useState(() => !!getAccessCode());
  const pollRef = useRef(null);
  const pollToken = useRef(0);
  // App-shell view state (presentation only — no API behaviour).
  const [stage, setStage] = useState(0);
  const [dir, setDir] = useState("fwd");
  const [openScene, setOpenScene] = useState(-1);
  const [showModels, setShowModels] = useState(false);
  const [actOpen, setActOpen] = useState(false);
  const stageHead = useRef(null);

  const refreshCredits = () => api("/api/credits").then(setCredits).catch(() => {});
  const loadHealth = () => api("/api/health").then((h) => { setHealth(h); setHealthOk(true); }).catch(() => setHealthOk(false));

  const stopPolling = () => { pollToken.current += 1; if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  const startPolling = (jid, pid, started = Date.now()) => {
    stopPolling();
    const token = pollToken.current;
    setStoredJob(pid, { id: jid, started });
    setJobStarted(started); setPollError("");
    let inFlight = false;
    const tick = async () => {
      if (inFlight || pollToken.current !== token) return;
      inFlight = true;
      try {
        const j = await api(`/api/jobs/${jid}`);
        if (pollToken.current !== token) return;
        setJob(j); setPollError("");
        if (j.status === "complete" || j.status === "error") { stopPolling(); setStoredJob(pid, null); refreshCredits(); }
      } catch (e) {
        if (pollToken.current !== token) return;
        if (e.status === 404) { stopPolling(); setStoredJob(pid, null); setError("That film job no longer exists on the server."); }
        else setPollError(e.message);
      } finally { inFlight = false; }
    };
    tick();
    pollRef.current = setInterval(tick, POLL_MS);
  };

  // Everything tied to one project is cleared here — and only here.
  const resetProjectState = () => {
    stopPolling();
    setJob(null); setJobStarted(null); setPollError(""); setFrames([]); setVoicePreview(null);
    setQcRun(null); setPkg(null); setCopied(""); setSbDirty(false);
  };

  useEffect(() => {
    refreshCredits();
    loadHealth();
    // Resume the last project (and any in-flight film job) after a reload.
    const pid = getLastProject();
    if (pid) api(`/api/projects/${pid}`).then((p) => {
      setProject(p);
      setForm((f) => ({ ...f, language: p.language || f.language, persona: p.persona || f.persona, format: p.storyboard?.format || f.format }));
      const stored = getStoredJob(p.id);
      if (stored) startPolling(stored.id, p.id, stored.started || Date.now());
    }).catch(() => setLastProject(""));
    return stopPolling;
  }, []);

  useEffect(() => {
    if (!project?.id) return;
    setDir("fwd"); setStage(project.script ? 3 : project.storyboard ? 2 : 1);
  }, [project?.id]);

  const filming = job?.status === "running";
  useEffect(() => {
    if (!filming) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [filming]);

  const live = health?.mode === "live";
  const locked = health?.access ? !health.access.authorized : false;
  const needAccess = () => { setShowAccess(true); setError(ACCESS_REQUIRED_MSG); };

  async function run(label, fn) {
    setBusy(label); setError("");
    try { const out = await fn(); refreshCredits(); return out; }
    catch (e) {
      setError(e.message);
      if (e.status === 401 && e.code === "access_required") { setShowAccess(true); loadHealth(); }
    } finally { setBusy(""); }
  }
  const paid = (label, fn) => () => (locked ? needAccess() : run(label, fn));

  const saveAccess = async (e) => {
    e.preventDefault();
    const code = accessInput.trim();
    if (!code) return;
    setAccessCode(code); setAccessInput(""); setAccessMsg("Checking…");
    try {
      const r = await api("/api/access/check", { method: "POST", body: "{}" });
      if (!r.authorized) throw Object.assign(new Error("not accepted"), { status: 401 });
      setHasCode(true); setAccessMsg("Access code accepted — live mode unlocked."); setShowAccess(false); setError("");
    } catch (err) {
      if (err.status === 401) { setAccessCode(""); setHasCode(false); setAccessMsg("That access code was not accepted. You are still in demo mode."); }
      else setAccessMsg(err.message);
    }
    loadHealth(); refreshCredits();
  };
  const clearAccess = () => { setAccessCode(""); setHasCode(false); setAccessMsg("Access code removed — demo mode."); loadHealth(); };

  const create = () => run("create", async () => {
    resetProjectState();
    const p = await api("/api/projects", { method: "POST", body: JSON.stringify(form) });
    setProject(p); setLastProject(p.id);
  });
  const research = () => run("research", async () =>
    setProject(await api(`/api/projects/${project.id}/research`, { method: "POST", body: "{}" })));
  const updateScene = (i, patch) => {
    setSbDirty(true);
    setProject((p) => {
      const scenes = (p.storyboard?.scenes || []).map((s, j) => (j === i ? { ...s, ...patch } : s));
      return { ...p, storyboard: { ...p.storyboard, scenes } };
    });
  };
  const putStoryboard = async () => {
    const out = await api(`/api/projects/${project.id}/storyboard`, { method: "PUT", body: JSON.stringify({ storyboard: withCleanSeconds(project.storyboard), format: form.format }) });
    setProject(out.project || out); setSbDirty(false); setFrames([]); setQcRun(null);
  };
  const saveEdits = () => run("save", putStoryboard);
  const regenerate = () => {
    if (sbDirty && !window.confirm("Regenerating asks the agent for a new storyboard and replaces your unsaved edits. Continue?")) return;
    run("storyboard", async () => {
      setProject(await api(`/api/projects/${project.id}/storyboard`, { method: "POST", body: JSON.stringify({ format: form.format }) }));
      setSbDirty(false); setFrames([]); setQcRun(null);
    });
  };
  const writeScript = () => run("script", async () => {
    if (sbDirty) await putStoryboard();
    setProject(await api(`/api/projects/${project.id}/script`, { method: "POST", body: "{}" }));
  });
  const generate = paid("generate", async () => {
    const pid = project.id;
    try {
      const j = await api(`/api/projects/${pid}/generate`, { method: "POST", body: JSON.stringify({ engine, persona: form.persona, limit: Number(form.sceneLimit) || 0 }) });
      setJob(j); startPolling(j.id, pid, jobStart(j));
    } catch (e) {
      const jid = e.data?.job_id || e.data?.job?.id;
      if (e.status === 409 && jid) { if (e.data?.job) setJob(e.data.job); startPolling(jid, pid, jobStart(e.data?.job)); return; }
      throw e;
    }
  });
  const previewVoice = paid("voice", async () =>
    setVoicePreview(await api(`/api/projects/${project.id}/voice-preview`, { method: "POST", body: JSON.stringify({ persona: form.persona }) })));
  const keyframes = paid("keyframes", async () => {
    const out = await api(`/api/projects/${project.id}/keyframes`, { method: "POST", body: JSON.stringify({ persona: form.persona }) });
    setFrames(out.keyframes || []);
    setQcRun(null);
  });
  const runQC = paid("qc", async () => setQcRun(await api(`/api/projects/${project.id}/qc`, { method: "POST", body: JSON.stringify({ force: false }) })));
  // Proof overlay upload (WP-G): a REAL asset (rcpt screen recording or
  // before/after image, max 8 MB) attached to a scene. Stored in R2 under the
  // project; stitch composites the real card. Free to attach.
  const uploadOverlay = (sceneN) => run("overlay", async () => {
    const file = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "video/mp4,video/webm,image/png,image/jpeg,image/webp";
      input.onchange = () => resolve(input.files?.[0] || null); input.click();
    });
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("Proof asset must be 8 MB or less — trim the recording and try again."); return; }
    const asset = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || "")); r.onerror = () => reject(new Error("Could not read that file."));
      r.readAsDataURL(file);
    });
    const out = await api(`/api/projects/${project.id}/overlays`, { method: "POST", body: JSON.stringify({ scene: sceneN, asset }) });
    if (out?.overlay) setProject((p) => ({
      ...p, storyboard: { ...p.storyboard, scenes: (p.storyboard?.scenes || []).map((s) => (s.n === sceneN ? { ...s, overlay: out.overlay } : s)) },
    }));
  });
  const buildExport = () => run("export", async () => {
    const out = await api(`/api/projects/${project.id}/export`, { method: "POST", body: JSON.stringify({ job_id: job?.id }) });
    setPkg(out.posting_package);
  });
  const pp = pkg || job?.posting_package || null;
  const copyText = async (label, text) => {
    if (label === "hook") {
      // "Use as opening" from Research: UI-only convenience affordance.
      // It copies the hook into the clipboard / openingPick so the owner can
      // paste it into scene 1's storyboard line. No API call, no new endpoint.
      setOpeningPick(text);
      setCopied("hook");
      try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked — pick still shown below */ }
      setTimeout(() => setCopied(""), 2000);
      return;
    }
    try { await navigator.clipboard.writeText(text); setCopied(label); setLastCopied(text); setTimeout(() => setCopied(""), 2000); } catch { setError("Copy failed — select the text and copy manually."); }
  };
  // Posting checklist: local state only, keyed by project. Nothing is sent
  // to the API — ticking boxes never costs credits or changes the package.
  const toggleCheck = (pid, item) => setCheckState((prev) => ({ ...prev, [pid]: { ...(prev[pid] || {}), [item]: !(prev[pid] || {})[item] } }));
  const downloadPkg = () => {
    if (!pp) return;
    const text = `TALLA POSTING PACKAGE\nProduct: ${form.name || project?.name || "—"} · Language: ${pp.language}\nVideo: ${mediaUrl(pp.video_url) || "see Studio job"}\n\nCAPTION\n${pp.caption}\n\nHASHTAGS\n${(pp.hashtags || []).join(" ")}\n\nCHECKLIST\n${(pp.checklist || []).map((x) => "☐ " + x).join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "talla-posting-package.txt"; a.click(); URL.revokeObjectURL(a.href);
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const active = !project ? 0 : job ? 5 : project.script ? 4 : project.storyboard ? 3 : project.research ? 2 : 1;
  const selectedPersona = PERSONAS.find((p) => p.id === (project?.persona || form.persona)) || PERSONAS[0];
  const scriptByScene = new Map((project?.script?.lines || []).map((line) => [line.scene, line]));
  const shownFrames = frames.length ? frames : (project?.keyframes || []);
  const segByScene = new Map(((qcRun?.segmentation || project?.segmentation || [])).map((row) => [row.scene, row]));
  const providerCount = Object.entries(health?.providers || {}).filter(([k, v]) => v === true && !k.includes("h3")).length;
  const healthClass = healthOk === false ? "fail" : health && providerCount > 0 ? "pass" : "demo";
  const healthText = health ? `${providerCount} provider${providerCount === 1 ? "" : "s"} configured` : healthOk === false ? OFFLINE_MSG : "connecting…";
  const lockNote = locked ? " (needs access code)" : "";
  const engineInfo = ENGINES.find((e) => e.id === (job?.engine || engine)) || ENGINES[0];
  const activeRunText = busy === "research" ? "Researcher is studying your market…"
    : busy === "storyboard" ? "Storyboard artist is building the shot plan…"
    : busy === "save" ? "Saving your storyboard edits…"
    : busy === "script" ? "Scriptwriter is writing in " + (LANG_LABELS[form.language] || form.language) + "…"
    : busy === "keyframes" ? "Muse Image is photographing your creator…"
    : busy === "qc" ? "SAM 3.1 is checking the faces and phones…"
    : busy === "voice" ? "Voice artist is reading your creator's test line…"
    : busy === "generate" ? "Starting your film run…"
    : busy === "export" ? "Preparing your caption and hashtags…"
    : busy === "create" ? "Creating your project…"
    : "";

  // Job view helpers (job.models = { stage: { model, used, detail? } }).
  const modelEntries = Object.entries(job?.models || {}).filter(([, v]) => asObj(v) && "model" in v);
  const kfStatus = asObj(job?.keyframe_status) || asObj(job?.models?.keyframe?.detail) || asObj(job?.models?.keyframe_status);
  const segStatus = asObj(job?.segment_status) || asObj(job?.models?.segment?.detail) || asObj(job?.models?.segment_status);
  const progress = Math.max(0, Math.min(100, Number(job?.progress) || 0));
  const jobClass = job?.status === "complete" ? "pass" : job?.status === "error" ? "fail" : "demo";
  const finalSrc = isPlayable(job?.final_media_url) ? mediaUrl(job.final_media_url)
    : isPlayable(job?.final_video_url) && /^(https?:|\/api\/)/.test(job.final_video_url) ? mediaUrl(job.final_video_url) : null;

  const STEPS = [
    { label: "Product", sub: "What you sell", agent: null, icon: "+" },
    { label: "Research", sub: "Market & hooks", agent: "researcher" },
    { label: "Storyboard", sub: "Scene plan", agent: "scriptwriter" },
    { label: "Script", sub: "Local-language lines", agent: "voice" },
    { label: "Film", sub: "Stills, voice, video", agent: "editor" },
    { label: "Post", sub: "Caption & hashtags", agent: null, icon: "↗" },
  ];
  const agentImg = (k) => (AGENTS.find((a) => a.key === k) || AGENTS[0]).img;
  const reachableMax = !project ? 0 : project.script ? 5 : active;
  const busyStage = ({ create: 0, research: 1, storyboard: 2, save: 2, script: 3, voice: 4, keyframes: 4, qc: 4, generate: 4, export: 5 })[busy] ?? (filming ? 4 : -1);
  const stepDone = [!!project, !!project?.research, !!project?.storyboard, !!project?.script, job?.status === "complete", !!pp];
  const stepState = (i) => (busyStage === i ? "running" : stepDone[i] ? "done" : i <= reachableMax ? "ready" : "waiting");
  const stateText = { running: "Working…", done: "Done", ready: "Ready", waiting: "Waiting" };
  const goStage = (i) => {
    if (i < 0 || i > 5 || i > reachableMax) return;
    setDir(i >= stage ? "fwd" : "back"); setStage(i);
    requestAnimationFrame(() => stageHead.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const viewStage = Math.min(stage, reachableMax);
  const totalSecs = (project?.storyboard?.scenes || []).reduce((a, s) => a + (Number(s.seconds) || 0), 0);
  const frameByScene = new Map(shownFrames.map((f) => [f.scene, f]));
  const langLabel = LANG_LABELS[project?.language || form.language] || project?.language || form.language;
  const working = (k) => busyStage >= 0 && STEPS[busyStage]?.agent === k || (filming && k !== "researcher");

  const activity = (<>
    {project?.research && <div className="bubble"><img src="/agents/researcher-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Researcher</b>
      Found {project.research.pain_points?.length || 0} pain points. Top hook: “{project.research.hooks?.[0] || "—"}”</div></div>}
    {project?.storyboard && <div className="bubble"><img src="/agents/scriptwriter-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Scriptwriter</b>
      Storyboard ready — {project.storyboard.scenes.length} scenes, about {totalSecs} seconds. Review it before we film.</div></div>}
    {project?.script && <div className="bubble"><img src="/agents/voice-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Voice</b>
      Script written in {LANG_LABELS[project.script.language] || project.script.language}. I will speak it with open Nigerian TTS on Modal.</div></div>}
    {shownFrames.length > 0 && <div className="bubble"><img src="/agents/editor-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Editor</b>
      {shownFrames.length} Muse Image keyframe{shownFrames.length > 1 ? "s" : ""} ready. Hit Generate video — any missing still is created automatically inside the run.</div></div>}
    {job && <div className="bubble"><img src="/agents/critic-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Critic · advisory</b>
      Left advisory notes on {job.scenes?.length || 0} scene{job.scenes?.length === 1 ? "" : "s"}&apos; plan and script ({health?.models?.critic || MODEL_BADGES.critic}). SAM QC: {segStatus?.checked ? `${segStatus.checked} frame(s) checked` : "not reported"}. Speech check (first voiced scene): {job.verification?.status || "pending"}.</div></div>}
    {busy && <div className="bubble typing-bubble"><img src={agentImg(STEPS[Math.max(1, busyStage)]?.agent || "researcher")} alt="" width="44" height="44" /><div className="msg"><span className="dots" aria-hidden="true"><span></span><span></span><span></span></span> {activeRunText}</div></div>}
    {!project?.research && !busy && <p className="hint">Your team is waiting. Run research and their updates will appear here.</p>}
  </>);

  return (<div className="studio-page">
    <header className="site-nav"><div className="nav-inner">
      <Logo onClick={() => go("home")} label="Talla — back to home" />
      <span className="studio-tag">Studio</span>
      <div className="nav-tools">
        <span className={"pill status " + healthClass}>{healthText}</span>
        <button type="button" className="btn small ghost" aria-expanded={showAccess} aria-controls="access-panel"
          onClick={() => { setShowAccess((v) => !v); setAccessMsg(""); }}>{hasCode && !locked ? "Access code ✓" : "Access code"}</button>
      </div></div></header>

    <div className="studio-shell">
      {/* ---------- Left rail: pipeline with live state ---------- */}
      <nav className="rail" aria-label="Studio steps">
        <p className="rail-title">Your pipeline</p>
        <ol className="rail-steps">
          {STEPS.map((s, i) => { const st = stepState(i); return (
            <li key={s.label}>
              <button type="button" className={"rail-step " + st + (viewStage === i ? " current" : "")} disabled={i > reachableMax}
                aria-current={viewStage === i ? "step" : undefined} onClick={() => goStage(i)}>
                <span className="rail-avatar">{s.agent ? <img src={agentImg(s.agent)} alt="" width="40" height="40" /> : <span className="rail-icon" aria-hidden="true">{s.icon}</span>}
                  <span className={"rail-dot " + st} aria-hidden="true" /></span>
                <span className="rail-text"><b>{s.label}</b><small>{stateText[st]} · {s.sub}</small></span>
                {st === "running" && <span className="rail-progress" aria-hidden="true"><span /></span>}
              </button>
            </li>); })}
        </ol>
        <div className="rail-team">
          <p className="rail-title">Your team</p>
          <div className="rail-heads">{AGENTS.map((a) => (
            <span key={a.key} className={"rail-head" + (working(a.key) ? " working" : "")} title={a.name}><img src={a.img} alt={a.name} width="40" height="40" /></span>))}</div>
        </div>
        {credits && <div className="rail-credits"><p className="rail-title">Credit guard</p>
          {(credits.providers || []).map((p) => (
            <div className="credit-row" key={p.provider}>
              <div className="credit-top"><span>{p.provider}</span><span>${p.estimated_used_usd} / ${p.budget_usd} ({p.pct_used}%)</span></div>
              <div className="credit-bar"><span style={{ transform: `scaleX(${Math.min(1, (Number(p.pct_used) || 0) / 100)})` }} /></div>
            </div>))}
          <p className="hint">Baseten runs the brain first; Meta credits are kept for Muse Image and final passes. Cached stages cost $0.</p>
        </div>}
      </nav>

      {/* ---------- Main workspace: one stage at a time ---------- */}
      <main className="workspace">
        {showAccess && <form id="access-panel" className="access-form" onSubmit={saveAccess}>
          <label htmlFor="access-code">Access code</label>
          <div className="access-row">
            <input id="access-code" type="password" autoComplete="off" value={accessInput} onChange={(e) => setAccessInput(e.target.value)} placeholder="Enter the code you were given" />
            <button className="btn small" type="submit" disabled={!accessInput.trim()}>Unlock live mode</button>
            {hasCode && <button className="btn small ghost" type="button" onClick={clearAccess}>Forget code</button>}
          </div>
          <p className="hint">Stored only in this browser. Without it everything runs in demo mode and no credits are spent.</p>
        </form>}
        {accessMsg && <p className="hint" role="status">{accessMsg}</p>}
        {health && <div className={"mode-banner " + (live ? "live" : "demo")} role="status">
          <span className="mode-dot" aria-hidden="true" />
          {live ? <><b>Live mode</b> — paid models run on your requests. Every paid call is checked against the credit budget.</>
            : <><b>Demo mode</b> — no credits spent. Enter an access code to run live.</>}</div>}
        <div aria-live="polite">{busy && <div className="working-bar"><span className="spinner" aria-hidden="true" />{activeRunText}<span className="dots" aria-hidden="true"><span></span><span></span><span></span></span></div>}</div>
        {error && <div className="err" role="alert"><b>Something needs attention.</b> {error}</div>}

        <div className={"stage stage-" + dir} key={viewStage}>
          {/* ===== 0. Product ===== */}
          {viewStage === 0 && <>
            <StageHead headRef={stageHead} working={busyStage === 0} n={0} title={project ? "Your product" : "What are we advertising today?"}
              sub="A name and description, a URL, or just a category. No link hunting — your Researcher does that work." />
            {!project && <div className="welcome card">
              <div className="welcome-heads" aria-hidden="true">{AGENTS.map((a, i) => <img key={a.key} src={a.img} alt="" width="64" height="64" style={{ "--i": i }} />)}</div>
              <div className="welcome-copy">
                <h2>Your team is ready when you are</h2>
                <ol className="welcome-steps"><li><b>Describe</b> what you sell</li><li><b>Approve</b> the research &amp; storyboard</li><li><b>Film</b> in your customers&apos; language</li></ol>
              </div>
              <button type="button" className="btn ghost" onClick={() => setForm({ ...SAMPLE_PRODUCT })}>Try a sample product</button>
            </div>}
            {project && <div className="current-project card">
              <span className="eyebrow">Current project</span>
              <b>{project.name || project.category || project.id}</b>
              <span className="hint">{LANG_LABELS[project.language] || project.language} · {selectedPersona.label}</span>
              <button type="button" className="btn small" onClick={() => goStage(reachableMax)}>Continue where you left off →</button>
              <button type="button" className="btn small ghost" onClick={() => setForm({ ...SAMPLE_PRODUCT })}>Try a sample product</button>
            </div>}

            <section className="card form-card"><h2 className="card-title">The product</h2>
              <div className="row"><div><label htmlFor="f-name">Product / brand name</label>
                <input id="f-name" value={form.name} onChange={set("name")} placeholder="e.g. Ori Glow shea butter" /></div>
                <div><label htmlFor="f-url">Or product / brand URL</label>
                  <input id="f-url" type="url" value={form.url} onChange={set("url")} placeholder="https://…" /></div></div>
              <label htmlFor="f-desc">What does it do? Who is it for?</label>
              <textarea id="f-desc" value={form.description} onChange={set("description")} placeholder="Describe the product, its promise, and the customer…" />
              <label htmlFor="f-cat">Or just a category</label>
              <input id="f-cat" value={form.category} onChange={set("category")} placeholder="e.g. skincare, hair, food delivery" />
            </section>

            <section className="card form-card"><h2 className="card-title">Who it&apos;s for</h2>
              <label htmlFor="f-aud">Who is it for? (audience)</label>
              <input id="f-aud" value={form.audience} onChange={set("audience")} placeholder="e.g. Instagram/WhatsApp buyers in Lagos" />
              <fieldset className="lang-pills"><legend id="lang-legend">Language your customers speak</legend>
                <div className="lang-row" role="group" aria-labelledby="lang-legend">{LANGS.map((l) => (
                  <button type="button" key={l} aria-pressed={form.language === l} className={"lang-pill" + (form.language === l ? " selected" : "")}
                    onClick={() => setForm({ ...form, language: l })}>{LANG_LABELS[l] || l}</button>))}
                </div>
              </fieldset>
            </section>

            <section className="card form-card"><h2 className="card-title" id="format-label">Video format — how the story is told</h2>
              <div className="choice-grid" role="group" aria-labelledby="format-label">{FORMATS.map((f) => (
                <button type="button" key={f.id} aria-pressed={form.format === f.id} className={"choice-card" + (form.format === f.id ? " selected" : "")}
                  onClick={() => setForm({ ...form, format: f.id })}><b>{f.label}</b><span>{f.blurb}</span></button>))}
              </div>
            </section>

            <section className="card form-card"><h2 className="card-title" id="persona-label">Your creator — face, motion prompt and voice stay locked together</h2>
              <div className="choice-grid persona-grid" role="group" aria-labelledby="persona-label">{PERSONAS.map((p) => (
                <button type="button" key={p.id} aria-pressed={form.persona === p.id} className={"choice-card persona-card" + (form.persona === p.id ? " selected" : "")}
                  onClick={() => setForm({ ...form, persona: p.id })}>
                  {p.img
                    ? <img className="persona-face" src={p.img} alt="" width="64" height="64" loading="lazy" />
                    : <span className="persona-face persona-initials" aria-hidden="true">{personaInitials(p)}</span>}
                  <span className="persona-copy"><b>{p.label}</b><span>{p.blurb}</span></span></button>))}
              </div>
              <div className="creator-lock"><span>Locked creator</span><b>{selectedPersona.label}</b><p>{selectedPersona.blurb}</p></div>
            </section>

            <div className="stage-actions">
              <span className="hint">Creating a project is free — nothing paid runs until you film.</span>
              <button className="btn accent" disabled={!!busy} onClick={create}>{busy === "create" ? "Creating…" : project ? "Create a fresh project" : "Create project →"}</button>
            </div>
          </>}

          {/* ===== 1. Research ===== */}
          {viewStage === 1 && project && <>
            <StageHead headRef={stageHead} working={busyStage === 1} n={1} title="Research brief" sub="What your buyers feel, want and respond to — the raw material for every scene."
              agent="researcher" model={health?.models?.research || MODEL_BADGES.research}
              extra={project.research?.mode === "demo" && <span className="pill demo">demo</span>} />
            {!project.research && busy === "research" && <Skeleton cards={4} />}
            {!project.research && busy !== "research" && <div className="empty-stage card">
              <img src={agentImg("researcher")} alt="" width="96" height="96" className="empty-head" />
              <h2>Ready to study your market</h2>
              <p className="hint">Your Researcher looks for pain points, desires, opening hooks and video angles for {project.name || project.category || "your product"}.</p>
            </div>}
            {project.research && <div className="research-grid">
              <section className="card r-card r-pain" style={{ "--i": 0 }}><h2 className="card-title">Customer pain points</h2>
                <ol className="pain-list">{(project.research.pain_points || []).map((x, i) => <li key={x}><span className="pain-n">{i + 1}</span>{x}</li>)}</ol></section>
              <section className="card r-card" style={{ "--i": 1 }}><h2 className="card-title">What they want</h2>
                <div className="chip-wrap">{(project.research.desires || []).map((x) => <span className="chip" key={x}>{x}</span>)}</div></section>
              <section className="card r-card r-hooks" style={{ "--i": 2 }}><h2 className="card-title">Opening hooks</h2>
                {(project.research.hooks || []).map((x) => <figure className="hook" key={x}><blockquote>“{x}”</blockquote>
                  <figcaption><button type="button" className="hook-use" onClick={() => copyText("hook", x)}>Use as opening</button>
                    {copied === "hook" && openingPick === x && <span className="hook-note" role="status">Saved — paste it into scene 1&apos;s line</span>}</figcaption></figure>)}</section>
              <section className="card r-card" style={{ "--i": 3 }}><h2 className="card-title">Video angles</h2>
                <div className="chip-wrap">{(project.research.formats || []).map((x) => <span className="chip accent" key={x}>{x}</span>)}</div>
                <p className="r-voice">Recommended voice: <span className="chip">{LANG_LABELS[project.research.recommended_language] || project.research.recommended_language || form.language}</span></p>
                {project.research.tone_notes && <p className="r-note"><b>Tone</b>{project.research.tone_notes}</p>}
                {project.research.visual_notes && <p className="r-note"><b>Visuals</b>{project.research.visual_notes}</p>}</section>
            </div>}
            <div className="stage-actions">
              <button type="button" className="btn ghost" onClick={() => goStage(0)}>← Product</button>
              {!project.research
                ? <button className="btn accent" disabled={!!busy} onClick={research}>{busy === "research" ? "Researching…" : "Run research"}</button>
                : project.storyboard
                  ? <button type="button" className="btn accent" onClick={() => goStage(2)}>Review storyboard →</button>
                  : <button className="btn accent" disabled={!!busy} onClick={() => { goStage(2); regenerate(); }}>{busy === "storyboard" ? "Storyboarding…" : "Create storyboard →"}</button>}
            </div>
          </>}

          {/* ===== 2. Storyboard ===== */}
          {viewStage === 2 && project?.research && <>
            <StageHead headRef={stageHead} working={busyStage === 2} n={2} title="Storyboard — review before we film"
              sub="Your plan of the video. Edit any scene inline, then save. Nothing expensive runs until you film. Proof scenes carry a real-asset overlay (screen recording / before-after) composited at stitch — never AI-drawn."
              agent="scriptwriter" model={health?.models?.storyboard || MODEL_BADGES.storyboard}
              extra={project.storyboard?.format === "confession" && <span className="pill">confession format</span>} />
            {!project.storyboard && busy === "storyboard" && <Skeleton cards={6} tall />}
            {!project.storyboard && busy !== "storyboard" && <div className="empty-stage card">
              <img src={agentImg("scriptwriter")} alt="" width="96" height="96" className="empty-head" />
              <h2>No storyboard yet</h2>
              <p className="hint">Your team turns the research into a {form.format === "confession" ? "confession-format" : "standard"} shot plan you can edit.</p>
            </div>}
            {project.storyboard && <>
              <div className="story-summary"><span><b>{project.storyboard.scenes.length}</b> scenes</span><span><b>{totalSecs}s</b> planned film</span><span><b>{project.storyboard.scenes.filter((s) => s.overlay).length}</b> proof overlays</span>
                {sbDirty && <span className="unsaved-chip" role="status">Unsaved edits</span>}</div>
              <div className={"scene-grid" + (busy === "storyboard" ? " is-busy" : "")}>
                {project.storyboard.scenes.map((s, i) => { const f = frameByScene.get(s.n); const open = openScene === i; return (
                  <article className="scene-card card" key={`${s.n}-${i}`} style={{ "--i": i }}>
                    <div className="thumb">
                      {f?.keyframe_url ? <img src={mediaUrl(f.keyframe_url)} alt={`Scene ${s.n} keyframe`} loading="lazy" />
                        : <div className="thumb-empty"><span className="thumb-n">{s.n}</span><small>{s.shot || "shot"}</small><span className="thumb-ratio">9:16 · still pending</span></div>}
                      {s.overlay && <span className="thumb-badge">proof · {s.overlay.style || "pip"}</span>}
                    </div>
                    <div className="scene-body">
                      <div className="scene-top"><b>Scene {s.n} — {s.purpose}</b>
                        <label className="secs" htmlFor={`sc-${i}-secs`}><span className="sr-only">Seconds</span>
                          <input id={`sc-${i}-secs`} type="number" min="3" max="15" value={s.seconds ?? ""}
                            onChange={(e) => updateScene(i, { seconds: e.target.value === "" ? "" : Number(e.target.value) })}
                            onBlur={() => { const c = clampSeconds(s.seconds); if (c !== s.seconds) updateScene(i, { seconds: c }); }} /><span aria-hidden="true">s</span></label></div>
                      <label htmlFor={`sc-${i}-line`} className="mini-label">Spoken hook / action</label>
                      <textarea id={`sc-${i}-line`} className="inline-edit" value={s.key_line || ""} onChange={(e) => updateScene(i, { key_line: e.target.value })} />
                      <button type="button" className="expand-btn" aria-expanded={open} aria-controls={`sc-${i}-more`} onClick={() => setOpenScene(open ? -1 : i)}>
                        Camera &amp; shot <span className="chev" aria-hidden="true">▾</span></button>
                      <div className={"expand" + (open ? " open" : "")} id={`sc-${i}-more`}><div className="expand-inner">
                        <label htmlFor={`sc-${i}-visual`} className="mini-label">What the camera sees</label>
                        <textarea id={`sc-${i}-visual`} className="inline-edit" value={s.visual || ""} onChange={(e) => updateScene(i, { visual: e.target.value })} tabIndex={open ? 0 : -1} />
                        <label htmlFor={`sc-${i}-shot`} className="mini-label">Shot</label>
                        <input id={`sc-${i}-shot`} className="inline-input" value={s.shot || ""} onChange={(e) => updateScene(i, { shot: e.target.value })} tabIndex={open ? 0 : -1} />
                        {s.overlay && <div className="overlay-note"><b>Real proof overlay:</b> {typeof s.overlay === "object" && s.overlay.asset ? "real asset attached ✓" : (s.overlay.asset || "product asset")} — {s.overlay.note || "composited at stitch"} ({s.overlay.seconds || 3}s)
                          <div><button type="button" className="btn small ghost" disabled={!!busy} onClick={() => uploadOverlay(s.n)}>{busy === "overlay" ? "Attaching…" : (typeof s.overlay === "object" && s.overlay.real) ? "Replace proof asset" : "Attach real proof asset"}</button></div></div>}
                        {!s.overlay && <div className="overlay-note overlay-missing"><b>No proof asset yet.</b> This scene films without a proof card — or <button type="button" className="link-btn" disabled={!!busy} onClick={() => uploadOverlay(s.n)}>attach a real screen recording / photo</button> (max 8 MB, stored free).</div>}
                      </div></div>
                    </div>
                  </article>); })}
              </div>
              <p className="hint fine">“Save edits” stores your changes as-is — no agent call, no credits. Unsaved edits are also saved automatically before the script is written. Changing what the camera sees in a scene clears that scene&apos;s keyframe so it is re-shot. “Regenerate storyboard” asks the agent for a brand-new plan and replaces your edits.</p>
            </>}
            <div className="stage-actions">
              <button type="button" className="btn ghost" onClick={() => goStage(1)}>← Research</button>
              {!project.storyboard
                ? <button className="btn accent" disabled={!!busy} onClick={regenerate}>{busy === "storyboard" ? "Storyboarding…" : `Create storyboard (${form.format === "confession" ? "confession" : "standard"})`}</button>
                : <>
                  <button className="btn ghost small" disabled={!!busy} onClick={regenerate}>{busy === "storyboard" ? "Regenerating…" : "Regenerate storyboard"}</button>
                  <button className="btn small" disabled={!!busy || !sbDirty} onClick={saveEdits}>{busy === "save" ? "Saving…" : "Save edits"}</button>
                  {project.script && !sbDirty
                    ? <button type="button" className="btn accent" onClick={() => goStage(3)}>Review script →</button>
                    : <button className="btn accent" disabled={!!busy} onClick={() => { goStage(3); writeScript(); }}>{busy === "script" ? "Writing…" : sbDirty ? (project.script ? "Save edits & rewrite script →" : "Save edits & write script →") : "Write script →"}</button>}
                </>}
            </div>
          </>}

          {/* ===== 3. Script ===== */}
          {viewStage === 3 && project?.storyboard && <>
            <StageHead headRef={stageHead} working={busyStage === 3} n={3} title={`Script in ${langLabel}`} sub="One idea per scene, written for the creator to say out loud — then voiced with open Nigerian TTS."
              agent="scriptwriter" model={health?.models?.script || MODEL_BADGES.script}
              extra={<><span className={"agent-chip" + (busy === "voice" ? " working" : "")}><img src="/agents/voice-cut.webp" alt="" width="40" height="40" loading="lazy" /> Voice</span>
                <span className="pill">{health?.models?.voice || MODEL_BADGES.voice}</span></>} />
            {!project.script && busy === "script" && <div className="script-sheet card" aria-hidden="true">{[0, 1, 2, 3].map((i) => (
              <div className="skel-scene" key={i}><div className="skel line w40" /><div className="skel line w60 center" /><div className="skel line w75 center" /></div>))}</div>}
            {!project.script && busy !== "script" && <div className="empty-stage card">
              <img src={agentImg("scriptwriter")} alt="" width="96" height="96" className="empty-head" />
              <h2>The script comes from your storyboard</h2>
              <p className="hint">Each approved scene becomes a spoken line in {langLabel}.</p>
            </div>}
            {project.script && <div className="script-sheet card">
              <p className="sheet-title">{(project.name || project.category || "Untitled").toUpperCase()} — UGC ADVERT · {(LANG_LABELS[project.script.language] || project.script.language).toUpperCase()}</p>
              {project.storyboard.scenes.map((scene, i) => {
                const line = scriptByScene.get(scene.n);
                return <div className="sheet-scene" key={scene.n} style={{ "--i": i }}>
                  <div className="sheet-slug"><span>Scene {scene.n} — {scene.purpose}</span><span>{line?.seconds || scene.seconds}s</span></div>
                  {scene.visual && <p className="sheet-action">{scene.visual}</p>}
                  <p className="sheet-char">{selectedPersona.label.split(" (")[0].toUpperCase()} <span>(V.O.) · {LANG_LABELS[project.script.language] || project.script.language}</span></p>
                  <p className="sheet-line">“{line?.text || scene.key_line}”</p>
                </div>; })}
            </div>}
            <div className="stage-actions">
              <button type="button" className="btn ghost" onClick={() => goStage(2)}>← Storyboard</button>
              {!project.script
                ? <button className="btn accent" disabled={!!busy} onClick={writeScript}>{busy === "script" ? "Writing…" : sbDirty ? "Save edits & write script" : "Write script"}</button>
                : <>{sbDirty && <button className="btn small ghost" disabled={!!busy} onClick={writeScript}>Save edits &amp; rewrite script</button>}
                  <button type="button" className="btn accent" onClick={() => goStage(4)}>Go to filming →</button></>}
            </div>
          </>}

          {/* ===== 4. Film ===== */}
          {viewStage === 4 && project?.script && <>
            <StageHead headRef={stageHead} working={busyStage === 4} n={4} title="Film it" sub="Keyframes are automatic: every live video run first asks Muse Image 1.0 for any missing still. Preview them if you want to approve the face first."
              extra={<div className="film-team">{AGENTS.map((a) => (
                <span key={a.key} className={"agent-chip" + (filming ? " working" : "")}><img src={a.img} alt="" width="40" height="40" loading="lazy" />{a.name}</span>))}</div>} />
            {locked && <p className="hint locked-note">Keyframes, SAM QC, voice preview and filming spend real credits, so they need the access code. Research, storyboard and script work in demo mode.</p>}

            <div className="film-grid">
              <section className="card"><h2 className="card-title">Run settings</h2>
                <fieldset className="engine-picks"><legend id="engine-legend">Video engine</legend>
                  <div className="engine-row" role="group" aria-labelledby="engine-legend">{ENGINES.map((e) => {
                    const off = e.id === "talk" && !(health?.providers?.modal_talk);
                    return (
                    <button type="button" key={e.id} disabled={off} title={off ? "InfiniteTalk is keyed off until its smoke test passes" : e.label}
                      aria-pressed={engine === e.id} className={"engine-card" + (engine === e.id ? " selected" : "")}
                      onClick={() => setEngine(e.id)}><b>{e.short}</b><span>{e.blurb || e.label}</span></button>); })}
                  </div>
                </fieldset>
                <fieldset className="engine-picks"><legend id="calib-legend">Calibration scenes</legend>
                  <div className="calib-row" role="group" aria-labelledby="calib-legend">{[
                    ["0", "Full", "Full storyboard — all scenes"],
                    ["1", "Scene 1", "Calibration — scene 1 only"],
                    ["2", "First 2", "Calibration — first 2 scenes"],
                    ["3", "First 3", "Calibration — first 3 scenes"],
                  ].map(([v, b, d]) => (
                    <button type="button" key={v} aria-pressed={String(form.sceneLimit) === v} title={d} className={"calib-card" + (String(form.sceneLimit) === v ? " selected" : "")}
                      onClick={() => setForm({ ...form, sceneLimit: v })}><b>{b}</b></button>))}
                  </div>
                </fieldset>
                <p className="hint">Use calibration first: prove one talking-head beat looks right before spending on the full video.</p>
              </section>
              <section className="card"><h2 className="card-title">Your creator&apos;s voice</h2>
                <p className="hint">Wan/LTX generate silent motion — your local Nigerian voice (YarnGPT2 / MMS) is generated first and muxed onto the picture at stitch, so the words are exactly your script, spoken by your chosen creator. That is the winning-UGC voiceover format: continuous talk + proof cutaways.</p>
                <button className="btn ghost" disabled={!!busy} onClick={previewVoice}>{busy === "voice" ? "Voicing…" : `▶ Preview my creator's voice${lockNote}`}</button>
                {voicePreview && <div className="scene"><b>Voice preview</b> <span className="pill">{voicePreview.engine} · {voicePreview.voice || "fixed speaker"}</span>
                  {voicePreview.plan && <p className="hint">Plan: {voicePreview.plan}</p>}
                  {voicePreview.warning && <p className="hint">⚠ {voicePreview.warning}</p>}
                  {isPlayable(voicePreview.audio_url) && <audio controls src={mediaUrl(voicePreview.audio_url)} />}
                  {String(voicePreview.audio_url || "").startsWith("modal-volume://") && <p className="hint">Voice generated into the Modal volume ({voicePreview.audio_url}) — playback needs the media proxy.</p>}
                </div>}
              </section>
            </div>

            <section className="card"><button type="button" className="expand-btn big" aria-expanded={showModels} aria-controls="film-models" onClick={() => setShowModels((v) => !v)}>
              Models in this run <span className="chev" aria-hidden="true">▾</span></button>
              <div className={"expand" + (showModels ? " open" : "")} id="film-models"><div className="expand-inner">
                <div className="credits-bar">
                  <span className="credit-chip">Keyframe · {health?.models?.keyframe || MODEL_BADGES.keyframe}</span>
                  <span className="credit-chip">QC · {health?.models?.segment || MODEL_BADGES.segment}</span>
                  <span className="credit-chip">Voice · {health?.models?.voice || MODEL_BADGES.voice}</span>
                  <span className="credit-chip">Video · {ENGINES.find((e) => e.id === engine)?.short}</span>
                  <span className="credit-chip">Critic (advisory) · {health?.models?.critic || MODEL_BADGES.critic}</span>
                  <span className="credit-chip">Stitch · {health?.models?.stitch || MODEL_BADGES.stitch}</span>
                  <span className="credit-chip">Verify (first voiced scene) · {health?.models?.verify || MODEL_BADGES.verify}</span>
                </div></div></div>
            </section>

            {busy === "keyframes" && <Skeleton cards={3} tall />}
            {shownFrames.length > 0 && <div className="keyframe-grid">{shownFrames.map((f, i) => { const seg = segByScene.get(f.scene); return (
              <div className="keyframe-card card" key={f.scene} style={{ "--i": i }}>
                <div className="scene-head"><b>Scene {f.scene}</b><span className="pill">{f.source === "seeded" ? "seeded still" : "Muse Image 1.0"}</span></div>
                {f.keyframe_url ? <img src={mediaUrl(f.keyframe_url)} alt={`Scene ${f.scene} keyframe`} loading="lazy" /> : <p className="hint">Keyframe stored on the server.</p>}
                {seg ? <p className={"qc-line " + (seg.person_ok ? "ok" : "warn")}>{seg.person_ok ? "✓ SAM QC: creator detected" : "⚠ SAM QC: no creator detected"}{seg.detections ? ` · person ${seg.detections.person ?? "—"} · phone ${seg.detections.phone ?? "—"}` : ""}</p> : <p className="hint">SAM QC has not checked this frame yet.</p>}
                {seg?.note && <p className="hint">{seg.note}</p>}
              </div>); })}
            </div>}
            {qcRun?.qc?.error && <p className="hint">⚠ {qcRun.qc.error}</p>}
            {qcRun?.qc && !qcRun.qc.error && <p className="hint">SAM QC checked {qcRun.qc.checked} frame(s). It is advisory — a warning helps you fix a bad still before filming, it never blocks the run.</p>}
            {sbDirty && <p className="hint unsaved">Unsaved storyboard edits are not used for filming — save them and rewrite the script first.</p>}

            {job && <section className="card job-box">
              <div aria-live="polite">
                <div className="scene-head"><span className={"pill " + jobClass}>Job {job.id} — {job.status} ({progress}%)</span>
                  <span className="pill demo">engine: {engineInfo.short}</span>
                  {filming && jobStarted && <span className="hint">Elapsed {fmtElapsed(now - jobStarted)}</span>}</div>
                <div className={"progress" + (filming ? " live" : "")} role="progressbar" aria-label="Film progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
                {job.step && <p className="job-step">{job.step}</p>}
              </div>
              {filming && <p className="hint">Checking every 5 seconds — each check moves the run forward a step, so keep this tab open. If you reload, the Studio picks this job back up.</p>}
              {pollError && <p className="hint">⚠ Last status check failed ({pollError}) — retrying.</p>}
              {job.error && <div className="err" role="alert"><b>The run stopped.</b> {job.error}</div>}
              {job.stitch_error && <div className="err" role="alert"><b>Stitching failed.</b> {job.stitch_error} Scene clips below are preserved.</div>}
              {modelEntries.length > 0 && <div className="credits-bar" style={{ marginTop: 10 }}>
                {modelEntries.map(([stageKey, v]) => (
                  <span key={stageKey} className={"credit-chip" + (v.used ? "" : " off")} title={typeof v.detail === "string" ? v.detail : undefined}>
                    {STAGE_LABELS[stageKey] || stageKey} · {v.model}{v.used ? "" : " — not used"}</span>))}
              </div>}
              {kfStatus?.created?.length > 0 && <p className="hint">Muse Image created {kfStatus.created.length} keyframe(s) inside this run (scenes {kfStatus.created.join(", ")}) — no manual step needed.</p>}
              {kfStatus?.error && <p className="hint">⚠ {kfStatus.error}</p>}
              {segStatus?.results?.length > 0 && <div className="qc-strip">
                <b>SAM 3.1 keyframe QC</b>
                {segStatus.results.map((row) => <span key={row.scene} className={"qc-item " + (row.person_ok ? "ok" : "warn")}>Scene {row.scene}: {row.person_ok ? "creator ✓" : "check frame ⚠"}{row.detections ? ` · person ${row.detections.person ?? "—"} · phone ${row.detections.phone ?? "—"}` : ""}</span>)}
                <small>SAM only checks that the right objects are in frame. It is advisory and does not generate video.</small>
              </div>}
              {segStatus?.error && <p className="hint">⚠ {segStatus.error}</p>}
              {job.verification && <div className="verify-strip">
                <b>Speech check (first voiced scene{job.verification.scope && job.verification.scope.startsWith("scene") ? ` — ${job.verification.scope.split(" vs ")[0]}` : ""}) — {job.verification.status}</b>
                {typeof job.verification.similarity === "number" && <span>{Math.round(job.verification.similarity * 100)}% script-word overlap</span>}
                {job.verification.heard && <p>Heard: “{job.verification.heard}”</p>}
                <small>{job.verification.note || "Muse Voice Transcribe transcribed the first voiced scene and compared it with its own script line. Other scenes are not checked."}</small>
              </div>}
              {job.note && <p className="hint" style={{ marginTop: 12 }}>{job.note}</p>}
              {finalSrc && <div className="final-video"><b>Your finished film</b><video controls playsInline preload="metadata" src={finalSrc} /></div>}
              {!finalSrc && String(job.final_video_url || "").startsWith("modal-volume://") && <p className="hint">Final video saved in the private Modal volume ({job.final_video_url}) — playback needs the media proxy.</p>}
              {!finalSrc && !job.final_video_url && !job.stitch_error && job.status === "complete" && <p className="hint">The run completed, but no stitched film came back. Scene outputs below are preserved.</p>}
              {job.failed_scenes?.length > 0 && <div className="err" role="alert"><b>Some scenes did not render.</b> You get the film from the scenes that worked — nothing already paid for was thrown away.
                <ul>{job.failed_scenes.map((f, i) => <li key={i}>Scene {f.scene ?? f}{f.error ? ` — ${f.error}` : ""}</li>)}</ul></div>}
              <div className="clip-grid">{job.scenes?.map((s) => <div className="scene" key={s.scene}><b>Scene {s.scene}</b>{" "}
                {s.critic && <span className="pill">critic (advisory): {s.critic.verdict}{s.critic.score != null ? ` (${s.critic.score}/10)` : ""}</span>}{" "}
                <span className={"pill " + (s.mode === "failed" ? "fail" : "demo")}>{s.mode}</span>
                {s.voice && <span className="pill">voice: {s.voice.engine}{s.voice.voice ? ` · ${s.voice.voice}` : ""}</span>}
                {s.overlay && <span className="pill">📎 proof: {typeof s.overlay === "object" ? `${s.overlay.asset} · ${s.overlay.style}` : "attached"}</span>}
                {s.critic?.note && <p>{s.critic.note}</p>}
                {s.voice?.warning && <p className="hint">⚠ {s.voice.warning}</p>}
                {s.mode === "failed" && <p className="hint">⚠ This scene failed to render and was left out of the stitched film — the rest of the run was preserved.</p>}
                {isPlayable(s.clip_url) && <video controls playsInline preload="metadata" src={mediaUrl(s.clip_url)} />}
                {String(s.clip_url || "").startsWith("modal-volume://") && <p className="hint">Clip saved in the private Modal volume: {s.clip_url}.</p>}</div>)}</div>
              {job.overlays_applied != null && <p className="hint">Proof overlays composited into the final film: {job.overlays_applied}. (Editorial overlay intent is recorded per scene; real uploaded assets are required before a card can be composited.)</p>}
            </section>}

            <div className="stage-actions">
              <button className="btn ghost small" disabled={!!busy} onClick={keyframes}>{busy === "keyframes" ? "Generating keyframes…" : `Preview keyframes${lockNote}`}</button>
              <button className="btn ghost small" disabled={!!busy || !shownFrames.length} onClick={runQC}>{busy === "qc" ? "Checking frames…" : `Run SAM 3.1 QC${lockNote}`}</button>
              <button className="btn accent" disabled={!!busy || filming} onClick={generate}>{busy === "generate" ? "Starting…" : filming ? "Your team is filming…" : (form.sceneLimit === "0" ? "Generate full video" : `Generate ${form.sceneLimit}-scene calibration`) + lockNote}</button>
              <button type="button" className="btn small" onClick={() => goStage(5)}>Posting →</button>
            </div>
          </>}

          {/* ===== 5. Post ===== */}
          {viewStage === 5 && project?.script && <>
            <StageHead headRef={stageHead} working={busyStage === 5} n={5} title="Export for posting" sub={`After your video is stitched with the AI-generated label, we prepare a ready-to-post package: a caption in your video's language (${LANG_LABELS[project.language] || project.language}) plus 5–8 hashtags. No auto-posting — copy it and post it yourself.`}
              model={health?.models?.export || MODEL_BADGES.export} extra={<span className="pill demo">optional</span>} />
            {busy === "export" && !pp && <Skeleton cards={1} />}
            {!pp && busy !== "export" && <div className="empty-stage card">
              <img src={agentImg("editor")} alt="" width="96" height="96" className="empty-head" />
              <h2>Your caption and hashtags, ready to paste</h2>
              <p className="hint">Prepare the package any time after the script — refresh it once your film is stitched.</p>
            </div>}
            {pp && (() => { const full = pp.caption + "\n\n" + (pp.hashtags || []).join(" "); const video = mediaUrl(pp.video_url); const checked = checkState[project.id] || {}; return (
              <section className="card post-card">
                <div className="scene-head"><h2 className="card-title">Posting package</h2><span><span className="pill">{pp.language}</span> {pp.mode === "demo" && <span className="pill demo">demo</span>}</span></div>
                <p className="post-caption">{pp.caption}</p>
                <div className="chip-wrap">{(pp.hashtags || []).map((h) => <button type="button" className="chip accent hashtag" key={h} title="Copy this hashtag" onClick={() => copyText("tag", h)}>{copied === "tag" && lastCopied === h ? "Copied ✓" : h}</button>)}</div>
                <p className="hint">Video: {/^https?:/.test(video || "") ? <a href={video} target="_blank" rel="noreferrer">{video}</a> : video || "your finished video (Studio job above)"}</p>
                <ul className="checklist">{(pp.checklist || []).map((x, i) => { const id = `check-${i}`; return (
                  <li key={x}><label className="check-item" htmlFor={id}>
                    <input id={id} type="checkbox" checked={!!checked[x]} onChange={() => toggleCheck(project.id, x)} />
                    <span>{x}</span></label></li>); })}</ul>
                {pp.note && <p className="hint">{pp.note}</p>}
                <div className="post-actions">
                  <button className="btn small" onClick={() => copyText("caption", pp.caption)}>{copied === "caption" ? "Copied ✓" : "Copy caption"}</button>
                  <button className="btn small ghost" onClick={() => copyText("tags", (pp.hashtags || []).join(" "))}>{copied === "tags" ? "Copied ✓" : "Copy hashtags"}</button>
                  <button className="btn small ghost" onClick={() => copyText("full", full)}>{copied === "full" ? "Copied ✓" : "Copy caption + hashtags"}</button>
                  <button className="btn small ghost" onClick={downloadPkg}>Download package (.txt)</button>
                </div>
              </section>); })()}
            <div className="stage-actions">
              <button type="button" className="btn ghost" onClick={() => goStage(4)}>← Film</button>
              <button className="btn accent" disabled={!!busy} onClick={buildExport}>{busy === "export" ? "Preparing package…" : pp ? "Refresh posting package" : "Prepare posting package"}</button>
            </div>
          </>}
        </div>
      </main>

      {/* ---------- Right panel: team activity ---------- */}
      <aside className={"activity" + (actOpen ? " open" : "")} aria-label="Team activity">
        <button type="button" className="activity-toggle" aria-expanded={actOpen} aria-controls="activity-feed" onClick={() => setActOpen((v) => !v)}>
          <span>Team activity</span><span className="chev" aria-hidden="true">▾</span></button>
        <h2 className="activity-title">Team activity</h2>
        <div className="activity-body" id="activity-feed"><div className="activity-inner">{activity}</div></div>
      </aside>
    </div>
  </div>);
}

export default function App() {
  const [view, setView] = useState("home");
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  return view === "home" ? <Home go={setView} /> : <Studio go={setView} />;
}
