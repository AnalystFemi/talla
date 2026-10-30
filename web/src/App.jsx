import { useEffect, useRef, useState } from "react";
import { ACCESS_REQUIRED_MSG, OFFLINE_MSG, api, getAccessCode, getLastProject, getStoredJob, isPlayable, mediaUrl,
  setAccessCode, setLastProject, setStoredJob } from "./api.js";
import { AGENTS, EMPTY_FORM, ENGINES, FORMATS, LANGS, LANG_LABELS, MODEL_BADGES, PERSONAS, PIPELINE, SAMPLE_PRODUCT,
  STAGE_LABELS } from "./content.js";

const POLL_MS = 5000;
const clampSeconds = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(15, Math.max(3, Math.round(n))) : 6; };
const withCleanSeconds = (sb) => ({ ...sb, scenes: (sb?.scenes || []).map((s) => ({ ...s, seconds: clampSeconds(s.seconds) })) });
const jobStart = (j) => { const t = j?.created_at ?? j?.started_at; const ms = typeof t === "number" ? t : Date.parse(t || ""); return Number.isFinite(ms) ? ms : Date.now(); };
const fmtElapsed = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

function Home({ go }) {
  return (<>
    <div className="wrap">
      <nav><div className="logo">talla<span>.</span></div>
        <div><button className="btn small ghost" onClick={() => go("studio")}>Open Studio</button>{" "}
        <button className="btn small" onClick={() => go("studio")}>Start creating</button></div></nav>
      <div className="hero">
        <span className="badge">Built for Nigerian businesses & creators</span>
        <h1>Your product, <img className="agent-inline" src="/agents/researcher.webp" alt="" width="320" height="320" /> researched,<br />
          storyboarded <img className="agent-inline" src="/agents/scriptwriter.webp" alt="" width="320" height="320" /> and filmed<br />
          by your AI <img className="agent-inline" src="/agents/voice.webp" alt="" width="320" height="320" /> UGC team</h1>
        <p>Talla turns a product, brand or category into a high-converting UGC video — in Pidgin, Yoruba, Hausa, Igbo and Nigerian English. No creator fees. No filming. No editing.</p>
        <button className="btn accent" onClick={() => go("studio")}>Create my first video</button>{" "}
        <button className="btn ghost" onClick={() => document.getElementById("team").scrollIntoView({ behavior: "smooth" })}>Meet the team</button>
        <img className="team-hero reveal" src="/agents/team.webp" alt="The Talla agent team" width="1440" height="960" />
        <div className="marquee"><div className="marquee-track">
          {[...AGENTS, ...AGENTS].map((a, i) => (
            <span className="chip" key={i} aria-hidden={i >= AGENTS.length ? "true" : undefined}>
              <img src={a.img} alt="" width="36" height="36" loading="lazy" />{a.name} · {a.color} team</span>))}
        </div></div>
      </div>

      <section><h2>Your team&apos;s already on it</h2>
        <p className="sub">They don&apos;t wait to be asked. Describe your product and they come back with research, a storyboard and a film plan.</p>
        <div className="chat">
          <p className="hint chat-note">Illustrative example of the notes your team leaves — not a live run.</p>
          <div className="bubble"><img src="/agents/researcher.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Researcher</b>
            I checked your market. Buyers fear fake and bleaching creams, so scene two must show the jar label and the texture close-up.</div></div>
          <div className="bubble"><img src="/agents/scriptwriter.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Scriptwriter</b>
            Hook written in Pidgin: “Harmattan don dry my skin finish — na this shea butter rescue me.”</div></div>
          <div className="bubble"><img src="/agents/critic.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Critic · advisory</b>
            Note on the plan: scene 3&apos;s line is long for a ~5 second clip — trim it so the voice doesn&apos;t rush.</div></div>
          <div className="bubble"><img src="/agents/editor.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Editor</b>
            <span className="dots" aria-hidden="true"><span></span><span></span><span></span></span> Stitching your scenes with captions…</div></div>
        </div></section>

      <section id="team"><h2>Meet your team</h2>
        <p className="sub">Five specialists that hand work to each other — like a Riverside studio crew, but for UGC adverts. Talla means “advertisement” in Hausa. Under the hood: Muse Spark Open plans, Muse Image 1.0 shoots the stills, SAM 3.1 checks the stills, Wan 2.2 brings them to life, and Muse Spark leaves advisory notes on every scene&apos;s plan and script.</p>
        <div className="grid">{AGENTS.map((a) => (
          <div className="card" key={a.key}><img src={a.img} alt="" width="94" height="94" loading="lazy" /><h3>{a.name}</h3><p>{a.job}</p></div>))}
        </div></section>

      <section><h2>Watch a product become a video</h2>
        <p className="sub">Every stage is visible and reviewable. You approve the storyboard before a single credit is spent on video.</p>
        <div className="pipe">{PIPELINE.map(([t, d], i) => (
          <div className="step" key={t}><b>{i + 1}. {t}</b><span>{d}</span></div>))}
        </div></section>

      <section><h2>What you can hand off</h2>
        <div className="grid">
          {[["No more creator hunting", "Your team researches what sells in your category, then writes and films it — you just approve."],
             ["Speak like your customers", "Pidgin, Yoruba, Hausa, Igbo or Nigerian English — voiced by open Nigerian TTS, with the first voiced scene transcribed and checked against your script."],
             ["Review before you pay", "You approve the storyboard before any paid video runs. The Critic leaves advisory notes on each scene's plan and script, and SAM 3.1 flags stills where your creator isn't clearly in frame."],
             ["Ready to post", "Captions burnt in, AI-generated label included, sized 9:16 for TikTok, Reels and Shorts."]]
            .map(([t, d]) => <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div></section>

      <div className="cta"><h2>Your next advert is one product away</h2>
        <p>Describe what you sell. Your team handles research, script, voice and film.</p>
        <button className="btn accent" onClick={() => go("studio")}>Start creating — it&apos;s free to try</button></div>

      <div className="wordmark" aria-label="talla">ta<img src="/agents/voice.webp" alt="" width="320" height="320" loading="lazy" />lla</div>
      <footer><span>© 2026 Talla — AI-generated content, always labelled.</span>
        <span>Research in detail. Film in your language.</span></footer>
    </div>
  </>);
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
  const [qcRun, setQcRun] = useState(null);
  const [sbDirty, setSbDirty] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [accessInput, setAccessInput] = useState("");
  const [accessMsg, setAccessMsg] = useState("");
  const [hasCode, setHasCode] = useState(() => !!getAccessCode());
  const pollRef = useRef(null);
  const pollToken = useRef(0);

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
  const buildExport = () => run("export", async () => {
    const out = await api(`/api/projects/${project.id}/export`, { method: "POST", body: JSON.stringify({ job_id: job?.id }) });
    setPkg(out.posting_package);
  });
  const pp = pkg || job?.posting_package || null;
  const copyText = async (label, text) => { try { await navigator.clipboard.writeText(text); setCopied(label); } catch { setError("Copy failed — select the text and copy manually."); } };
  const downloadPkg = () => {
    if (!pp) return;
    const text = `TALLA POSTING PACKAGE\nProduct: ${form.name || project?.name || "—"} · Language: ${pp.language}\nVideo: ${mediaUrl(pp.video_url) || "see Studio job"}\n\nCAPTION\n${pp.caption}\n\nHASHTAGS\n${(pp.hashtags || []).join(" ")}\n\nCHECKLIST\n${(pp.checklist || []).map((x) => "☐ " + x).join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "talla-posting-package.txt"; a.click(); URL.revokeObjectURL(a.href);
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const crumbs = ["Product", "Research", "Storyboard", "Script", "Film", "Post"];
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

  return (<div className="wrap studio">
    <nav><button type="button" className="logo" aria-label="Talla — back to home" onClick={() => go("home")}>talla<span>.</span></button>
      <div className="nav-tools">
        <span className={"pill " + healthClass}>{healthText}</span>
        <button type="button" className="btn small ghost" aria-expanded={showAccess} aria-controls="access-panel"
          onClick={() => { setShowAccess((v) => !v); setAccessMsg(""); }}>{hasCode && !locked ? "Access code ✓" : "Access code"}</button>
      </div></nav>
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
      {live ? <><b>Live mode</b> — paid models run on your requests. Every paid call is checked against the credit budget.</>
        : <><b>Demo mode</b> — no credits spent. Enter an access code to run live.</>}</div>}
    <h2>Studio</h2>
    <p className="sub">Create a project → your Researcher investigates → approve the storyboard → your team films it.</p>
    <div className="crumbs">{crumbs.map((cname, i) => <span key={cname} className={"crumb" + (i <= active ? " on" : "")}>{i + 1}. {cname}</span>)}</div>
    <div aria-live="polite">{busy && <div className="working-bar"><span className="spinner" aria-hidden="true" />{activeRunText}<span className="dots" aria-hidden="true"><span></span><span></span><span></span></span></div>}</div>
    {error && <div className="err" role="alert"><b>Something needs attention.</b> {error}</div>}

    {credits && <div className="panel"><h3>Credit guard</h3>
      <p className="hint">Estimated burn vs hackathon budgets. Baseten runs the brain first; Meta credits are preserved for Muse Image and final passes. Cached stages cost $0.</p>
      <div className="credits-bar">{(credits.providers || []).map((p) => (
        <span className="credit-chip" key={p.provider}>{p.provider}: ${p.estimated_used_usd} / ${p.budget_usd} ({p.pct_used}%)</span>))}</div></div>}

    <div className="panel"><h3>1. Your product</h3>
      <p className="hint">A name and description, a URL, or just a category — no link hunting, your Researcher does that work.{" "}
        <button type="button" className="btn small ghost" onClick={() => setForm({ ...SAMPLE_PRODUCT })}>Try a sample product</button></p>
      <div className="row"><div><label htmlFor="f-name">Product / brand name</label>
        <input id="f-name" value={form.name} onChange={set("name")} placeholder="e.g. Ori Glow shea butter" /></div>
        <div><label htmlFor="f-url">Or product / brand URL</label>
          <input id="f-url" type="url" value={form.url} onChange={set("url")} placeholder="https://…" /></div></div>
      <label htmlFor="f-desc">What does it do? Who is it for?</label>
      <textarea id="f-desc" value={form.description} onChange={set("description")} placeholder="Describe the product, its promise, and the customer…" />
      <div className="row"><div><label htmlFor="f-cat">Or just a category</label>
        <input id="f-cat" value={form.category} onChange={set("category")} placeholder="e.g. skincare, hair, food delivery" /></div>
        <div><label htmlFor="f-lang">Language your customers speak</label>
          <select id="f-lang" value={form.language} onChange={set("language")}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_LABELS[l] || l}</option>)}</select></div></div>
      <label htmlFor="f-aud">Who is it for? (audience)</label>
      <input id="f-aud" value={form.audience} onChange={set("audience")} placeholder="e.g. Instagram/WhatsApp buyers in Lagos" />
      <span className="field-label" id="format-label">Video format — how the story is told</span>
      <div className="choice-grid" role="group" aria-labelledby="format-label">{FORMATS.map((f) => (
        <button type="button" key={f.id} aria-pressed={form.format === f.id} className={"choice-card" + (form.format === f.id ? " selected" : "")}
          onClick={() => setForm({ ...form, format: f.id })}><b>{f.label}</b><span>{f.blurb}</span></button>))}
      </div>
      <span className="field-label" id="persona-label">Your creator — face, motion prompt and voice stay locked together</span>
      <div className="choice-grid persona-grid" role="group" aria-labelledby="persona-label">{PERSONAS.map((p) => (
        <button type="button" key={p.id} aria-pressed={form.persona === p.id} className={"choice-card" + (form.persona === p.id ? " selected" : "")}
          onClick={() => setForm({ ...form, persona: p.id })}><b>{p.label}</b><span>{p.blurb}</span></button>))}
      </div>
      <div className="creator-lock"><span>Locked creator</span><b>{selectedPersona.label}</b><p>{selectedPersona.blurb}</p></div>
      <button className="btn accent" disabled={!!busy} onClick={create}>{busy === "create" ? "Creating…" : project ? "Create a fresh project" : "Create project"}</button>
      {project && <p className="hint">Current project: <b>{project.name || project.category || project.id}</b> · {LANG_LABELS[project.language] || project.language} · {selectedPersona.label}</p>}
    </div>

    {project && <>
      <div className="panel"><h3>2. Research brief</h3>
        <div className="agents-row"><span className={"agent-chip" + (busy === "research" ? " working" : "")}>
          <img src="/agents/researcher.webp" alt="" width="40" height="40" loading="lazy" /> Researcher {project.research?.mode === "demo" && <span className="pill demo">demo</span>}</span>
          <span className="pill">{health?.models?.research || MODEL_BADGES.research}</span></div>
        {!project.research
          ? <button className="btn" disabled={!!busy} onClick={research}>{busy === "research" ? "Researching…" : "Run research"}</button>
          : <div className="brief-grid">
              <div className="brief-card"><b>Customer pain points</b>{(project.research.pain_points || []).map((x) => <p key={x}>• {x}</p>)}</div>
              <div className="brief-card"><b>What they want</b>{(project.research.desires || []).map((x) => <p key={x}>• {x}</p>)}</div>
              <div className="brief-card"><b>Opening hooks</b>{(project.research.hooks || []).map((x) => <p key={x}>“{x}”</p>)}</div>
              <div className="brief-card"><b>Video angles</b>{(project.research.formats || []).map((x) => <span className="pill" key={x}>{x}</span>)}
                <p className="hint">Recommended voice: {LANG_LABELS[project.research.recommended_language] || project.research.recommended_language || form.language}</p>
                {project.research.tone_notes && <p>{project.research.tone_notes}</p>}
                {project.research.visual_notes && <p>{project.research.visual_notes}</p>}</div>
            </div>}
      </div>

      {project.research && <div className="panel"><h3>3. Storyboard — review before we film {project.storyboard?.format === "confession" && <span className="pill">confession format</span>}</h3>
        <p className="hint">This is your plan of the video. Edit any scene, then save. Nothing expensive runs until you film. Proof scenes carry a real-asset overlay (screen recording / before-after) composited at stitch — never AI-drawn. <span className="pill">{health?.models?.storyboard || MODEL_BADGES.storyboard}</span></p>
        {!project.storyboard
          ? <button className="btn" disabled={!!busy} onClick={regenerate}>{busy === "storyboard" ? "Storyboarding…" : `Create storyboard (${form.format === "confession" ? "confession" : "standard"})`}</button>
          : <><div className="story-summary"><span><b>{project.storyboard.scenes.length}</b> scenes</span><span><b>{project.storyboard.scenes.reduce((a, s) => a + (Number(s.seconds) || 0), 0)}s</b> planned film</span><span><b>{project.storyboard.scenes.filter((s) => s.overlay).length}</b> proof overlays</span></div>
            {project.storyboard.scenes.map((s, i) => (
              <div className="scene editor-scene" key={`${s.n}-${i}`}>
                <div className="scene-head"><b>Scene {s.n} — {s.purpose}</b><span className="pill">{s.shot}</span>{s.overlay && <span className="pill gold">proof · {s.overlay.style || "pip"}</span>}</div>
                <div className="row">
                  <div><label htmlFor={`sc-${i}-line`}>Spoken hook / action</label><textarea id={`sc-${i}-line`} className="small-textarea" value={s.key_line || ""} onChange={(e) => updateScene(i, { key_line: e.target.value })} /></div>
                  <div><label htmlFor={`sc-${i}-visual`}>What the camera sees</label><textarea id={`sc-${i}-visual`} className="small-textarea" value={s.visual || ""} onChange={(e) => updateScene(i, { visual: e.target.value })} /></div>
                </div>
                <div className="row">
                  <div><label htmlFor={`sc-${i}-shot`}>Shot</label><input id={`sc-${i}-shot`} value={s.shot || ""} onChange={(e) => updateScene(i, { shot: e.target.value })} /></div>
                  <div><label htmlFor={`sc-${i}-secs`}>Seconds</label><input id={`sc-${i}-secs`} type="number" min="3" max="15" value={s.seconds ?? ""}
                    onChange={(e) => updateScene(i, { seconds: e.target.value === "" ? "" : Number(e.target.value) })}
                    onBlur={() => { const c = clampSeconds(s.seconds); if (c !== s.seconds) updateScene(i, { seconds: c }); }} /></div>
                </div>
                {s.overlay && <div className="overlay-note"><b>Real proof overlay:</b> {s.overlay.asset || "product asset"} — {s.overlay.note || "editor note to be completed at stitch"} ({s.overlay.seconds || 3}s)</div>}
              </div>))}
            <p className="hint">“Save edits” stores your changes as-is — no agent call, no credits. Unsaved edits are also saved automatically before the script is written. Changing what the camera sees in a scene clears that scene&apos;s keyframe so it is re-shot. “Regenerate storyboard” asks the agent for a brand-new plan and replaces your edits.</p>
            {sbDirty && <p className="hint unsaved" role="status">You have unsaved storyboard edits.</p>}
            <button className="btn small" disabled={!!busy || !sbDirty} onClick={saveEdits}>{busy === "save" ? "Saving…" : "Save edits"}</button>{" "}
            <button className="btn ghost small" disabled={!!busy} onClick={regenerate}>{busy === "storyboard" ? "Regenerating…" : "Regenerate storyboard"}</button></>}
      </div>}

      {project.storyboard && <div className="panel"><h3>4. Script in {LANG_LABELS[project.language] || project.language}</h3>
        <div className="agents-row"><span className={"agent-chip" + (busy === "script" ? " working" : "")}>
          <img src="/agents/scriptwriter.webp" alt="" width="40" height="40" loading="lazy" /> Scriptwriter</span>
          <span className="pill">{health?.models?.script || MODEL_BADGES.script}</span>
          <span className="agent-chip"><img src="/agents/voice.webp" alt="" width="40" height="40" loading="lazy" /> Voice</span>
          <span className="pill">{health?.models?.voice || MODEL_BADGES.voice}</span></div>
        {!project.script
          ? <button className="btn" disabled={!!busy} onClick={writeScript}>{busy === "script" ? "Writing…" : sbDirty ? "Save edits & write script" : "Write script"}</button>
          : <><div className="script-list">{project.storyboard.scenes.map((scene) => {
              const line = scriptByScene.get(scene.n);
              return <div className="script-line" key={scene.n}><span>Scene {scene.n}</span><div><b>{scene.purpose}</b><p>“{line?.text || scene.key_line}”</p><small>{line?.seconds || scene.seconds}s · {LANG_LABELS[project.script.language] || project.script.language}</small></div></div>;
            })}</div>
            {sbDirty && <button className="btn small ghost" disabled={!!busy} onClick={writeScript} style={{ marginTop: 12 }}>Save edits & rewrite script</button>}</>}
      </div>}

      {project && <div className="panel"><h3>Team activity</h3>
        <div>
          {project.research && <div className="bubble"><img src="/agents/researcher.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Researcher</b>
            Found {project.research.pain_points?.length || 0} pain points. Top hook: “{project.research.hooks?.[0] || "—"}”</div></div>}
          {project.storyboard && <div className="bubble"><img src="/agents/scriptwriter.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Scriptwriter</b>
            Storyboard ready — {project.storyboard.scenes.length} scenes, about {project.storyboard.scenes.reduce((a, s) => a + (Number(s.seconds) || 0), 0)} seconds. Review it above before we film.</div></div>}
          {project.script && <div className="bubble"><img src="/agents/voice.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Voice</b>
            Script written in {LANG_LABELS[project.script.language] || project.script.language}. I will speak it with open Nigerian TTS on Modal.</div></div>}
          {shownFrames.length > 0 && <div className="bubble"><img src="/agents/editor.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Editor</b>
            {shownFrames.length} Muse Image keyframe{shownFrames.length > 1 ? "s" : ""} ready. Hit Generate video — any missing still is created automatically inside the run.</div></div>}
          {job && <div className="bubble"><img src="/agents/critic.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Critic · advisory</b>
            Left advisory notes on {job.scenes?.length || 0} scene{job.scenes?.length === 1 ? "" : "s"}&apos; plan and script ({health?.models?.critic || MODEL_BADGES.critic}). SAM QC: {segStatus?.checked ? `${segStatus.checked} frame(s) checked` : "not reported"}. Speech check (first voiced scene): {job.verification?.status || "pending"}.</div></div>}
          {!project.research && <p className="hint">Your team is waiting. Run research and their updates will appear here.</p>}
        </div></div>}

      {project.script && <div className="panel"><h3>5. Film it</h3>
        <div className="agents-row">{AGENTS.map((a) => (
          <span key={a.key} className={"agent-chip" + (filming ? " working" : "")}><img src={a.img} alt="" width="40" height="40" loading="lazy" />{a.name}</span>))}</div>
        {locked && <p className="hint locked-note">Keyframes, SAM QC, voice preview and filming spend real credits, so they need the access code. Research, storyboard and script work in demo mode.</p>}
        <label htmlFor="f-engine">Video engine</label>
        <select id="f-engine" value={engine} onChange={(e) => setEngine(e.target.value)}>
          {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <label htmlFor="f-limit">Calibration scenes</label>
        <select id="f-limit" value={form.sceneLimit} onChange={set("sceneLimit")}>
          <option value="0">Full storyboard — all scenes</option>
          <option value="1">Calibration — scene 1 only</option>
          <option value="2">Calibration — first 2 scenes</option>
          <option value="3">Calibration — first 3 scenes</option>
        </select>
        <p className="hint">Use calibration first: prove one talking-head beat looks right before spending on the full video.</p>
        <div className="credits-bar" style={{ marginTop: 10 }}>
          <span className="credit-chip">Keyframe · {health?.models?.keyframe || MODEL_BADGES.keyframe}</span>
          <span className="credit-chip">QC · {health?.models?.segment || MODEL_BADGES.segment}</span>
          <span className="credit-chip">Voice · {health?.models?.voice || MODEL_BADGES.voice}</span>
          <span className="credit-chip">Video · {ENGINES.find((e) => e.id === engine)?.short}</span>
          <span className="credit-chip">Critic (advisory) · {health?.models?.critic || MODEL_BADGES.critic}</span>
          <span className="credit-chip">Stitch · {health?.models?.stitch || MODEL_BADGES.stitch}</span>
          <span className="credit-chip">Verify (first voiced scene) · {health?.models?.verify || MODEL_BADGES.verify}</span>
        </div>
        <p className="hint">How voice works: Wan/LTX generate silent motion — your local Nigerian voice (YarnGPT2 / MMS) is generated first and muxed onto the picture at stitch, so the words are exactly your script, spoken by your chosen creator. That is the winning-UGC voiceover format: continuous talk + proof cutaways.</p>
        <button className="btn ghost" disabled={!!busy} onClick={previewVoice}>{busy === "voice" ? "Voicing…" : `▶ Preview my creator's voice${lockNote}`}</button>
        {voicePreview && <div className="scene"><b>Voice preview</b> <span className="pill">{voicePreview.engine} · {voicePreview.voice || "fixed speaker"}</span>
          {voicePreview.plan && <p className="hint">Plan: {voicePreview.plan}</p>}
          {voicePreview.warning && <p className="hint">⚠ {voicePreview.warning}</p>}
          {isPlayable(voicePreview.audio_url) && <audio controls src={mediaUrl(voicePreview.audio_url)} />}
          {String(voicePreview.audio_url || "").startsWith("modal-volume://") && <p className="hint">Voice generated into the Modal volume ({voicePreview.audio_url}) — playback needs the media proxy.</p>}
        </div>}
        <p className="hint">Keyframes are automatic: every live video run first asks Muse Image 1.0 for any missing still. Preview them below if you want to approve the face first.</p>
        <button className="btn" disabled={!!busy} onClick={keyframes}>{busy === "keyframes" ? "Generating keyframes…" : `Preview keyframes (Muse Image)${lockNote}`}</button>{" "}
        <button className="btn ghost" disabled={!!busy || !shownFrames.length} onClick={runQC}>{busy === "qc" ? "Checking frames…" : `Run SAM 3.1 QC${lockNote}`}</button>{" "}
        <button className="btn accent" disabled={!!busy || filming} onClick={generate}>{busy === "generate" ? "Starting…" : filming ? "Your team is filming…" : (form.sceneLimit === "0" ? "Generate full video" : `Generate ${form.sceneLimit}-scene calibration`) + lockNote}</button>
        {sbDirty && <p className="hint unsaved">Unsaved storyboard edits are not used for filming — save them and rewrite the script first.</p>}
        {shownFrames.length > 0 && <div className="keyframe-grid">{shownFrames.map((f) => { const seg = segByScene.get(f.scene); return (
          <div className="keyframe-card" key={f.scene}>
            <div className="scene-head"><b>Scene {f.scene}</b><span className="pill">{f.source === "seeded" ? "seeded still" : "Muse Image 1.0"}</span></div>
            {f.keyframe_url ? <img src={mediaUrl(f.keyframe_url)} alt={`Scene ${f.scene} keyframe`} loading="lazy" /> : <p className="hint">Keyframe stored on the server.</p>}
            {seg ? <p className={"qc-line " + (seg.person_ok ? "ok" : "warn")}>{seg.person_ok ? "✓ SAM QC: creator detected" : "⚠ SAM QC: no creator detected"}{seg.detections ? ` · person ${seg.detections.person ?? "—"} · phone ${seg.detections.phone ?? "—"}` : ""}</p> : <p className="hint">SAM QC has not checked this frame yet.</p>}
            {seg?.note && <p className="hint">{seg.note}</p>}
          </div>); })}
        </div>}
        {qcRun?.qc?.error && <p className="hint">⚠ {qcRun.qc.error}</p>}
        {qcRun?.qc && !qcRun.qc.error && <p className="hint">SAM QC checked {qcRun.qc.checked} frame(s). It is advisory — a warning helps you fix a bad still before filming, it never blocks the run.</p>}

        {job && <div className="job-box">
          <div aria-live="polite">
            <div className="scene-head"><span className={"pill " + jobClass}>Job {job.id} — {job.status} ({progress}%)</span>
              <span className="pill demo">engine: {engineInfo.short}</span>
              {filming && jobStarted && <span className="hint">Elapsed {fmtElapsed(now - jobStarted)}</span>}</div>
            <div className="progress" role="progressbar" aria-label="Film progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
            {job.step && <p className="job-step">{job.step}</p>}
          </div>
          {filming && <p className="hint">Checking every 5 seconds — each check moves the run forward a step, so keep this tab open. If you reload, the Studio picks this job back up.</p>}
          {pollError && <p className="hint">⚠ Last status check failed ({pollError}) — retrying.</p>}
          {job.error && <div className="err" role="alert"><b>The run stopped.</b> {job.error}</div>}
          {job.stitch_error && <div className="err" role="alert"><b>Stitching failed.</b> {job.stitch_error} Scene clips below are preserved.</div>}
          {modelEntries.length > 0 && <div className="credits-bar" style={{ marginTop: 10 }}>
            {modelEntries.map(([stage, v]) => (
              <span key={stage} className={"credit-chip" + (v.used ? "" : " off")} title={typeof v.detail === "string" ? v.detail : undefined}>
                {STAGE_LABELS[stage] || stage} · {v.model}{v.used ? "" : " — not used"}</span>))}
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
            <b>Speech check (first voiced scene) — {job.verification.status}</b>
            {typeof job.verification.similarity === "number" && <span>{Math.round(job.verification.similarity * 100)}% script-word overlap</span>}
            {job.verification.heard && <p>Heard: “{job.verification.heard}”</p>}
            <small>{job.verification.note || "Muse Voice Transcribe transcribed the first voiced scene and compared it with the script."}</small>
          </div>}
          {job.note && <p className="hint" style={{ marginTop: 12 }}>{job.note}</p>}
          {finalSrc && <div className="final-video"><b>Your finished film</b><video controls playsInline preload="metadata" src={finalSrc} /></div>}
          {!finalSrc && String(job.final_video_url || "").startsWith("modal-volume://") && <p className="hint">Final video saved in the private Modal volume ({job.final_video_url}) — playback needs the media proxy.</p>}
          {!finalSrc && !job.final_video_url && !job.stitch_error && job.status === "complete" && <p className="hint">The run completed, but no stitched film came back. Scene outputs below are preserved.</p>}
          {job.failed_scenes?.length > 0 && <div className="err" role="alert"><b>Some scenes did not render.</b> You get the film from the scenes that worked — nothing already paid for was thrown away.
            <ul>{job.failed_scenes.map((f, i) => <li key={i}>Scene {f.scene ?? f}{f.error ? ` — ${f.error}` : ""}</li>)}</ul></div>}
          {job.scenes?.map((s) => <div className="scene" key={s.scene}><b>Scene {s.scene}</b>{" "}
            {s.critic && <span className="pill">critic (advisory): {s.critic.verdict}{s.critic.score != null ? ` (${s.critic.score}/10)` : ""}</span>}{" "}
            <span className={"pill " + (s.mode === "failed" ? "fail" : "demo")}>{s.mode}</span>
            {s.voice && <span className="pill">voice: {s.voice.engine}{s.voice.voice ? ` · ${s.voice.voice}` : ""}</span>}
            {s.overlay && <span className="pill">📎 proof: {typeof s.overlay === "object" ? `${s.overlay.asset} · ${s.overlay.style}` : "attached"}</span>}
            {s.critic?.note && <p>{s.critic.note}</p>}
            {s.voice?.warning && <p className="hint">⚠ {s.voice.warning}</p>}
            {s.mode === "failed" && <p className="hint">⚠ This scene failed to render and was left out of the stitched film — the rest of the run was preserved.</p>}
            {isPlayable(s.clip_url) && <video controls playsInline preload="metadata" src={mediaUrl(s.clip_url)} />}
            {String(s.clip_url || "").startsWith("modal-volume://") && <p className="hint">Clip saved in the private Modal volume: {s.clip_url}.</p>}</div>)}
          {job.overlays_applied != null && <p className="hint">Proof overlays composited into the final film: {job.overlays_applied}. (Editorial overlay intent is recorded per scene; real uploaded assets are required before a card can be composited.)</p>}
        </div>}
      </div>}

      {project.script && <div className="panel"><h3>6. Export for Posting <span className="pill demo">optional</span></h3>
        <p className="hint">After your video is stitched with the AI-generated label, we prepare a ready-to-post package: a caption in your video&apos;s language ({LANG_LABELS[project.language] || project.language}) plus 5–8 hashtags. No auto-posting — copy it and post it yourself. <span className="pill">{health?.models?.export || MODEL_BADGES.export}</span></p>
        <button className="btn" disabled={!!busy} onClick={buildExport}>{busy === "export" ? "Preparing package…" : pp ? "Refresh posting package" : "Prepare posting package"}</button>
        {pp && (() => { const full = pp.caption + "\n\n" + (pp.hashtags || []).join(" "); const video = mediaUrl(pp.video_url); return (
          <div className="scene" style={{ marginTop: 12 }}>
            <b>Posting package</b> <span className="pill">{pp.language}</span> {pp.mode === "demo" && <span className="pill demo">demo</span>}
            <p style={{ whiteSpace: "pre-wrap" }}>{pp.caption}</p>
            <p>{(pp.hashtags || []).map((h) => <span className="pill" key={h}>{h}</span>)}</p>
            <p className="hint">Video: {/^https?:/.test(video || "") ? <a href={video} target="_blank" rel="noreferrer">{video}</a> : video || "your finished video (Studio job above)"}</p>
            {(pp.checklist || []).map((x) => <p className="hint" key={x}>☐ {x}</p>)}
            {pp.note && <p className="hint">{pp.note}</p>}
            <button className="btn small" onClick={() => copyText("caption", pp.caption)}>{copied === "caption" ? "Copied ✓" : "Copy caption"}</button>{" "}
            <button className="btn small ghost" onClick={() => copyText("tags", (pp.hashtags || []).join(" "))}>{copied === "tags" ? "Copied ✓" : "Copy hashtags"}</button>{" "}
            <button className="btn small ghost" onClick={() => copyText("full", full)}>{copied === "full" ? "Copied ✓" : "Copy caption + hashtags"}</button>{" "}
            <button className="btn small ghost" onClick={downloadPkg}>Download package (.txt)</button>
          </div>); })()}
      </div>}
    </>}
  </div>);
}

export default function App() {
  const [view, setView] = useState("home");
  return view === "home" ? <Home go={setView} /> : <Studio go={setView} />;
}
