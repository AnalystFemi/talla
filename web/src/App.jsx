import { useEffect, useState } from "react";

const API = "";
const AGENTS = [
  { key: "researcher", name: "Researcher", img: "/agents/researcher.webp", color: "Blue", job: "Analyses trends, competitors and what Nigerian buyers actually want" },
  { key: "scriptwriter", name: "Scriptwriter", img: "/agents/scriptwriter.webp", color: "Orange", job: "Writes hooks and scripts in Pidgin, Yoruba, Hausa, Igbo & Nigerian English" },
  { key: "voice", name: "Voice", img: "/agents/voice.webp", color: "Pink", job: "Speaks your script with open Nigerian TTS — YarnGPT2 / MMS on Modal" },
  { key: "critic", name: "Critic", img: "/agents/critic.webp", color: "Green", job: "Quality gate — Muse Spark scores every scene for realism and natural speech" },
  { key: "editor", name: "Editor", img: "/agents/editor.webp", color: "Purple", job: "Stitches clips, burns captions, adds the AI-generated label, final polish" },
];
const PIPELINE = [
  ["Research", "Pain points, hooks, formats · Muse Spark Open"], ["Storyboard", "You review the scenes before money moves · Muse Spark Open"],
  ["Script", "Local-language lines, one idea per scene · Muse Spark Open"], ["Keyframe", "Persona-locked photoreal stills · Muse Image 1.0"],
  ["Keyframe QC", "Person + phone check before filming · SAM 3.1"], ["Voice", "Open Nigerian speech · YarnGPT2 / MMS"],
  ["Video", "Silent motion + voice stitched on · Wan 2.2 / LTX"], ["Critic", "Realism + language score per scene · Muse Spark Open"],
  ["Verify", "Spoken lines checked vs script · Muse Voice Transcribe"], ["Film", "25–40s captioned video + AI label · ffmpeg"],
  ["Export", "Caption + 5–8 hashtags, ready to paste · Muse Spark Open"],
];
// Stays in sync with MODEL_MAP in worker/src/index.js (also served at /api/health).
const MODEL_BADGES = { research: "Muse Spark Open (Baseten)", storyboard: "Muse Spark Open (Baseten)",
  script: "Muse Spark Open (Baseten)", keyframe: "Muse Image 1.0 (Meta)", segment: "SAM 3.1 (Meta, keyframe QC)",
  voice: "YarnGPT2 / MMS (Modal)", video: "Wan 2.2 (Modal, primary)", critic: "Muse Spark Open (Baseten)",
  stitch: "ffmpeg composite (Modal)", verify: "Muse Voice Transcribe 1.0 (Meta, verify stage)" };
const LANGS = ["pidgin", "yoruba", "hausa", "igbo", "nigerian-english"];
const LANG_LABELS = { pidgin: "Pidgin", yoruba: "Yoruba", hausa: "Hausa", igbo: "Igbo", "nigerian-english": "Nigerian English" };
const FORMATS = [
  { id: "standard", label: "Standard UGC", blurb: "Hook → pain → proof → testimonial → CTA (5 scenes)" },
  { id: "confession", label: "Confession — winning format", blurb: "“I stopped using X…” → pain → switch → proof-stack → copy-me CTA (6 scenes + proof overlays)" },
];
const PERSONAS = [
  { id: "female-creator", label: "Female creator (Aisha)", blurb: "Woman, late 20s, braids — voice: Idera (YarnGPT2)" },
  { id: "female-creator-2", label: "Female creator 2 (Funmi) — locked", blurb: "Light-skinned Nigerian woman, black knotless braids, upscale Lagos flat — Yoruba calibration, voice: yoruba_female2" },
  { id: "male-creator", label: "Male creator", blurb: "Man, early 30s, fade + beard — voice: Jude (YarnGPT2)" },
  { id: "male-creator-dark", label: "Male creator — dark skin (Ebuka)", blurb: "Dark-skinned man, early 30s, fade + neat beard — voice: Jude (YarnGPT2) · avatar pending approval" },
  { id: "male-creator-light", label: "Male creator — light skin (Tunde)", blurb: "Light-skinned man, late 20s, short waves — voice: Jude (YarnGPT2) · avatar pending approval" },
];

async function api(path, opts) {
  const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Home({ go }) {
  return (<>
    <div className="wrap">
      <nav><div className="logo">talla<span>.</span></div>
        <div><button className="btn small ghost" onClick={() => go("studio")}>Sign in</button>{" "}
        <button className="btn small" onClick={() => go("studio")}>Start creating</button></div></nav>
      <div className="hero">
        <span className="badge">Built for Nigerian businesses & creators</span>
        <h1>Your product, <img className="agent-inline" src="/agents/researcher.webp" alt="Researcher" /> researched,<br />
          storyboarded <img className="agent-inline" src="/agents/scriptwriter.webp" alt="Scriptwriter" /> and filmed<br />
          by your AI <img className="agent-inline" src="/agents/voice.webp" alt="Voice" /> UGC team</h1>
        <p>Talla turns a product, brand or category into a high-converting UGC video — in Pidgin, Yoruba, Hausa, Igbo and Nigerian English. No creator fees. No filming. No editing.</p>
        <button className="btn accent" onClick={() => go("studio")}>Create my first video</button>{" "}
        <button className="btn ghost" onClick={() => document.getElementById("team").scrollIntoView({ behavior: "smooth" })}>Meet the team</button>
        <img className="team-hero reveal" src="/agents/team.webp" alt="The Talla agent team" />
        <div className="marquee"><div className="marquee-track">
          {[...AGENTS, ...AGENTS].map((a, i) => (
            <span className="chip" key={i}><img src={a.img} alt="" />{a.name} · {a.color} team</span>))}
        </div></div>
      </div>

      <section><h2>Your team&apos;s already on it</h2>
        <p className="sub">They don&apos;t wait to be asked. Describe your product and they come back with research, a storyboard and a film plan.</p>
        <div className="chat">
          <div className="bubble"><img src="/agents/researcher.webp" alt="" /><div className="msg"><b>Researcher</b>
            I checked your market. Buyers fear fake alerts, so verse two must show the QR proof close-up.</div></div>
          <div className="bubble"><img src="/agents/scriptwriter.webp" alt="" /><div className="msg"><b>Scriptwriter</b>
            Hook written in Pidgin: “Stop losing customers because your receipt no look serious.”</div></div>
          <div className="bubble"><img src="/agents/critic.webp" alt="" /><div className="msg"><b>Critic</b>
            Rejected take 1 — skin looked plastic. Regenerating with natural light, pores visible.</div></div>
          <div className="bubble"><img src="/agents/editor.webp" alt="" /><div className="msg"><b>Editor</b>
            <span className="dots"><span></span><span></span><span></span></span> Stitching your 5 scenes with captions…</div></div>
        </div></section>

      <section id="team"><h2>Meet your team</h2>
        <p className="sub">Five specialists that hand work to each other — like a Riverside studio crew, but for UGC adverts. Talla means “advertisement” in Hausa. Under the hood: Muse Spark Open plans, Muse Image 1.0 shoots the stills, SAM 3.1 checks the stills, Wan 2.2 brings them to life, Muse Spark critic-scores every scene.</p>
        <div className="grid">{AGENTS.map((a) => (
          <div className="card" key={a.key}><img src={a.img} alt={a.name} /><h3>{a.name}</h3><p>{a.job}</p></div>))}
        </div></section>

      <section><h2>Watch a product become a video</h2>
        <p className="sub">Every stage is visible and reviewable. You approve the storyboard before a single credit is spent on video.</p>
        <div className="pipe">{PIPELINE.map(([t, d], i) => (
          <div className="step" key={t}><b>{i + 1}. {t}</b><span>{d}</span></div>))}
        </div></section>

      <section><h2>What you can hand off</h2>
        <div className="grid">
          {[["No more creator hunting", "Your team researches what sells in your category, then writes and films it — you just approve."],
             ["Speak like your customers", "Pidgin, Yoruba, Hausa, Igbo or Nigerian English — voiced by open Nigerian TTS, checked for naturalness."],
             ["Proof before you pay more", "The Critic rejects plastic skin, bad lip-sync and wrong products before anything reaches you."],
             ["Ready to post", "Captions burnt in, AI-generated label included, sized 9:16 for TikTok, Reels and Shorts."]]
            .map(([t, d]) => <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}
        </div></section>

      <div className="cta"><h2>Your next advert is one product away</h2>
        <p>Describe what you sell. Your team handles research, script, voice and film.</p>
        <button className="btn accent" onClick={() => go("studio")}>Start creating — it&apos;s free to try</button></div>

      <div className="wordmark">ta<img src="/agents/voice.webp" alt="" />lla</div>
      <footer><span>© 2026 Talla — AI-generated content, always labelled.</span>
        <span>Research in detail. Film in your language.</span></footer>
    </div>
  </>);
}

function Studio({ go }) {
  const [form, setForm] = useState({ name: "", description: "", url: "", category: "", audience: "", language: "pidgin", persona: "female-creator", format: "confession", sceneLimit: "0" });
  const [project, setProject] = useState(null);
  const [job, setJob] = useState(null);
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

  const refreshCredits = () => api("/api/credits").then(setCredits).catch(() => {});
  useEffect(() => {
    refreshCredits();
    api("/api/health").then((h) => { setHealth(h); setHealthOk(true); }).catch(() => setHealthOk(false));
  }, []);

  async function run(label, fn) {
    setBusy(label); setError("");
    try { const out = await fn(); refreshCredits(); return out; }
    catch (e) { setError(e.message); } finally { setBusy(""); }
  }
  const create = () => run("create", async () => {
    setJob(null); setFrames([]); setVoicePreview(null); setQcRun(null);
    setProject(await api("/api/projects", { method: "POST", body: JSON.stringify(form) }));
  });
  const stage = (name) => run(name, async () =>
    setProject(await api(`/api/projects/${project.id}/${name}`, { method: "POST", body: JSON.stringify({ storyboard: project.storyboard, format: form.format }) })));
  const updateScene = (i, patch) => setProject((p) => {
    const scenes = (p.storyboard?.scenes || []).map((s, j) => (j === i ? { ...s, ...patch } : s));
    return { ...p, storyboard: { ...p.storyboard, scenes } };
  });
  const generate = () => run("generate", async () =>
    setJob(await api(`/api/projects/${project.id}/generate`, { method: "POST", body: JSON.stringify({ engine, persona: form.persona, limit: Number(form.sceneLimit) || 0 }) })));
  const previewVoice = () => run("voice", async () =>
    setVoicePreview(await api(`/api/projects/${project.id}/voice-preview`, { method: "POST", body: JSON.stringify({ persona: form.persona }) })));
  const keyframes = () => run("keyframes", async () => {
    const out = await api(`/api/projects/${project.id}/keyframes`, { method: "POST", body: JSON.stringify({ persona: form.persona }) });
    setFrames(out.keyframes || []);
    setQcRun(null);
  });
  const runQC = () => run("qc", async () => setQcRun(await api(`/api/projects/${project.id}/qc`, { method: "POST", body: JSON.stringify({ force: false }) })));
  const buildExport = () => run("export", async () => {
    const out = await api(`/api/projects/${project.id}/export`, { method: "POST", body: JSON.stringify({ job_id: job?.id }) });
    setPkg(out.posting_package);
  });
  const copyText = async (label, text) => { try { await navigator.clipboard.writeText(text); setCopied(label); } catch { setError("Copy failed — select the text and copy manually."); } };
  const downloadPkg = () => {
    const pp = job?.posting_package || pkg; if (!pp) return;
    const text = `TALLA POSTING PACKAGE\nProduct: ${form.name || "—"} · Language: ${pp.language}\nVideo: ${pp.video_url || "see Studio job (Modal volume until R2 keys are set)"}\n\nCAPTION\n${pp.caption}\n\nHASHTAGS\n${(pp.hashtags || []).join(" ")}\n\nCHECKLIST\n${(pp.checklist || []).map((x) => "☐ " + x).join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "talla-posting-package.txt"; a.click(); URL.revokeObjectURL(a.href);
  };

  const crumbs = ["Product", "Research", "Storyboard", "Script", "Film", "Post"];
  const active = !project ? 0 : job ? 5 : project.script ? 4 : project.storyboard ? 3 : project.research ? 2 : 1;
  const selectedPersona = PERSONAS.find((p) => p.id === (project?.persona || form.persona)) || PERSONAS[0];
  const scriptByScene = new Map((project?.script?.lines || []).map((line) => [line.scene, line]));
  const framesByScene = new Map(frames.map((frame) => [frame.scene, frame]));
  const segByScene = new Map(((qcRun?.segmentation || project?.segmentation || [])).map((row) => [row.scene, row]));
  const activeRunText = busy === "research" ? "Researcher is studying your market…"
    : busy === "storyboard" ? "Storyboard artist is building the shot plan…"
    : busy === "script" ? "Scriptwriter is writing in " + (LANG_LABELS[form.language] || form.language) + "…"
    : busy === "keyframes" ? "Muse Image is photographing your creator…"
    : busy === "qc" ? "SAM 3.1 is checking the faces and phones…"
    : busy === "voice" ? "Voice artist is reading your creator's test line…"
    : busy === "generate" ? "Your crew is filming, voicing and stitching. Keep this tab open…"
    : busy === "export" ? "Preparing your caption and hashtags…"
    : "";

  return (<div className="wrap studio">
    <nav><div className="logo" style={{ cursor: "pointer" }} onClick={() => go("home")}>talla<span>.</span></div>
      <span className={"pill " + (healthOk ? "pass" : "")}>{health ? Object.entries(health.providers || {}).filter(([, v]) => v).length + " providers configured" : healthOk === false ? "API offline — check localhost:8787" : "connecting…"}</span></nav>
    <h2>Studio</h2>
    <p className="sub">Create a project → your Researcher investigates → approve the storyboard → your team films it.</p>
    <div className="crumbs">{crumbs.map((cname, i) => <span key={cname} className={"crumb" + (i <= active ? " on" : "")}>{i + 1}. {cname}</span>)}</div>
    {busy && <div className="working-bar"><span className="spinner" />{activeRunText}<span className="dots"><span></span><span></span><span></span></span></div>}
    {error && <div className="err"><b>Something needs attention.</b> {error}</div>}

    {credits && <div className="panel"><h3>Credit guard</h3>
      <p className="hint">Estimated burn vs hackathon budgets. Baseten runs the brain first; Meta credits are preserved for Muse Image and final passes. Cached stages cost $0.</p>
      <div className="credits-bar">{credits.providers.map((p) => (
        <span className="credit-chip" key={p.provider}>{p.provider}: ${p.estimated_used_usd} / ${p.budget_usd} ({p.pct_used}%)</span>))}</div></div>}

    <div className="panel"><h3>1. Your product</h3>
      <p className="hint">A name and description, a URL, or just a category — no link hunting, your Researcher does that work.</p>
      <div className="row"><div><label>Product / brand name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. rcpt — receipts for Nigerian vendors" /></div>
        <div><label>Or product / brand URL</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div></div>
      <label>What does it do? Who is it for?</label>
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the product, its promise, and the customer…" />
      <div className="row"><div><label>Or just a category</label>
        <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. skincare, hair, food delivery" /></div>
        <div><label>Language your customers speak</label>
          <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_LABELS[l] || l}</option>)}</select></div></div>
      <label>Who is it for? (audience)</label>
      <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="e.g. Instagram/WhatsApp vendors" />
      <label>Video format — how the story is told</label>
      <div className="choice-grid">{FORMATS.map((f) => (
        <button type="button" key={f.id} className={"choice-card" + (form.format === f.id ? " selected" : "")}
          onClick={() => setForm({ ...form, format: f.id })}><b>{f.label}</b><span>{f.blurb}</span></button>))}
      </div>
      <label>Your creator — face, motion prompt and voice stay locked together</label>
      <div className="choice-grid persona-grid">{PERSONAS.map((p) => (
        <button type="button" key={p.id} className={"choice-card" + (form.persona === p.id ? " selected" : "")}
          onClick={() => setForm({ ...form, persona: p.id })}><b>{p.label}</b><span>{p.blurb}</span></button>))}
      </div>
      <div className="creator-lock"><span>Locked creator</span><b>{selectedPersona.label}</b><p>{selectedPersona.blurb}</p></div>
      <button className="btn accent" disabled={!!busy} onClick={create}>{busy === "create" ? "Creating…" : project ? "Create a fresh project" : "Create project"}</button>
      {project && <p className="hint">Current project: <b>{project.name || project.category || project.id}</b> · {LANG_LABELS[project.language] || project.language} · {selectedPersona.label}</p>}
    </div>

    {project && <>
      <div className="panel"><h3>2. Research brief</h3>
        <div className="agents-row"><span className={"agent-chip" + (busy === "research" ? " working" : "")}>
          <img src="/agents/researcher.webp" alt="" /> Researcher {project.research?.mode === "demo" && <span className="pill demo">demo</span>}</span>
          <span className="pill">{health?.models?.research || MODEL_BADGES.research}</span></div>
        {!project.research
          ? <button className="btn" disabled={!!busy} onClick={() => stage("research")}>{busy === "research" ? "Researching…" : "Run research"}</button>
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
        <p className="hint">This is your plan of the video. Edit any scene, then approve it. Nothing expensive runs until you do. Proof scenes carry a real-asset overlay (screen recording / before-after) composited at stitch — never AI-drawn. <span className="pill">{health?.models?.storyboard || MODEL_BADGES.storyboard}</span></p>
        {!project.storyboard
          ? <button className="btn" disabled={!!busy} onClick={() => stage("storyboard")}>{busy === "storyboard" ? "Storyboarding…" : `Create storyboard (${form.format === "confession" ? "confession" : "standard"})`}</button>
          : <><div className="story-summary"><span><b>{project.storyboard.scenes.length}</b> scenes</span><span><b>{project.storyboard.scenes.reduce((a, s) => a + (Number(s.seconds) || 0), 0)}s</b> planned film</span><span><b>{project.storyboard.scenes.filter((s) => s.overlay).length}</b> proof overlays</span></div>
            {project.storyboard.scenes.map((s, i) => (
              <div className="scene editor-scene" key={`${s.n}-${i}`}>
                <div className="scene-head"><b>Scene {s.n} — {s.purpose}</b><span className="pill">{s.shot}</span>{s.overlay && <span className="pill gold">proof · {s.overlay.style || "pip"}</span>}</div>
                <div className="row">
                  <div><label>Spoken hook / action</label><textarea className="small-textarea" value={s.key_line || ""} onChange={(e) => updateScene(i, { key_line: e.target.value })} /></div>
                  <div><label>What the camera sees</label><textarea className="small-textarea" value={s.visual || ""} onChange={(e) => updateScene(i, { visual: e.target.value })} /></div>
                </div>
                <div className="row">
                  <div><label>Shot</label><input value={s.shot || ""} onChange={(e) => updateScene(i, { shot: e.target.value })} /></div>
                  <div><label>Seconds</label><input type="number" min="3" max="15" value={s.seconds || 6} onChange={(e) => updateScene(i, { seconds: Number(e.target.value) })} /></div>
                </div>
                {s.overlay && <div className="overlay-note"><b>Real proof overlay:</b> {s.overlay.asset || "product asset"} — {s.overlay.note || "editor note to be completed at stitch"} ({s.overlay.seconds || 3}s)</div>}
              </div>))}
            <p className="hint">Edits stay on this project when you run the next stage. The Scriptwriter uses these scenes, and Generate follows the same approved order.</p>
            <button className="btn ghost small" disabled={!!busy} onClick={() => stage("storyboard")}>Save edits & refresh storyboard</button></>}
      </div>}

      {project.storyboard && <div className="panel"><h3>4. Script in {LANG_LABELS[project.language] || project.language}</h3>
        <div className="agents-row"><span className={"agent-chip" + (busy === "script" ? " working" : "")}>
          <img src="/agents/scriptwriter.webp" alt="" /> Scriptwriter</span>
          <span className="pill">{health?.models?.script || MODEL_BADGES.script}</span>
          <span className="agent-chip"><img src="/agents/voice.webp" alt="" /> Voice</span>
          <span className="pill">{health?.models?.voice || MODEL_BADGES.voice}</span></div>
        {!project.script
          ? <button className="btn" disabled={!!busy} onClick={() => stage("script")}>{busy === "script" ? "Writing…" : "Write script"}</button>
          : <div className="script-list">{project.storyboard.scenes.map((scene) => {
              const line = scriptByScene.get(scene.n);
              return <div className="script-line" key={scene.n}><span>Scene {scene.n}</span><div><b>{scene.purpose}</b><p>“{line?.text || scene.key_line}”</p><small>{line?.seconds || scene.seconds}s · {LANG_LABELS[project.script.language] || project.script.language}</small></div></div>;
            })}</div>}
      </div>}

      {project && <div className="panel"><h3>Team activity</h3>
        <div>
          {project.research && <div className="bubble"><img src="/agents/researcher.webp" alt="" /><div className="msg"><b>Researcher</b>
            Found {project.research.pain_points?.length || 0} pain points. Top hook: “{project.research.hooks?.[0] || "—"}”</div></div>}
          {project.storyboard && <div className="bubble"><img src="/agents/scriptwriter.webp" alt="" /><div className="msg"><b>Scriptwriter</b>
            Storyboard ready — {project.storyboard.scenes.length} scenes, about {project.storyboard.scenes.reduce((a, s) => a + (s.seconds || 0), 0)} seconds. Review it above before we film.</div></div>}
          {project.script && <div className="bubble"><img src="/agents/voice.webp" alt="" /><div className="msg"><b>Voice</b>
            Script written in {project.script.language}. I will speak it with open Nigerian TTS on Modal.</div></div>}
          {frames.length > 0 && <div className="bubble"><img src="/agents/editor.webp" alt="" /><div className="msg"><b>Editor</b>
            {frames.length} Muse Image keyframe{frames.length > 1 ? "s" : ""} ready. Hit Generate video — any missing still is created automatically inside the run.</div></div>}
          {job && <div className="bubble"><img src="/agents/critic.webp" alt="" /><div className="msg"><b>Critic</b>
            Checked {job.scenes?.length || 0} scenes on the {job.engine} engine ({health?.models?.critic || MODEL_BADGES.critic}). SAM QC: {job.models?.segment_status?.checked ? `${job.models.segment_status.checked} frame(s) checked` : "not reported"}. Verification: {job.verification?.status || "pending"}. Per-scene verdicts are listed below.</div></div>}
          {!project.research && <p className="hint">Your team is waiting. Run research and their updates will appear here.</p>}
        </div></div>}

      {project.script && <div className="panel"><h3>5. Film it</h3>
        <div className="agents-row">{AGENTS.map((a) => (
          <span key={a.key} className={"agent-chip" + (busy === "generate" ? " working" : "")}><img src={a.img} alt="" />{a.name}</span>))}</div>
        <label>Video engine</label>
        <select value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="wan">Wan 2.2 — best motion, silent video + local Nigerian voice</option>
          <option value="ltx">LTX 2.5 — faster/cheaper draft motion + local Nigerian voice</option>
        </select>
        <label>Calibration scenes</label>
        <select value={form.sceneLimit} onChange={(e) => setForm({ ...form, sceneLimit: e.target.value })}>
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
          <span className="credit-chip">Video · {engine === "wan" ? "Wan 2.2 (Modal)" : "LTX 2.5 (Modal)"}</span>
          <span className="credit-chip">Critic · {health?.models?.critic || MODEL_BADGES.critic}</span>
          <span className="credit-chip">Stitch · {health?.models?.stitch || MODEL_BADGES.stitch}</span>
          <span className="credit-chip">Verify · {health?.models?.verify || MODEL_BADGES.verify}</span>
        </div>
        <p className="hint">How voice works: Wan/LTX generate silent motion — your local Nigerian voice (YarnGPT2 / MMS) is generated first and muxed onto the picture at stitch, so the words are exactly your script, spoken by your chosen creator. That is the winning-UGC voiceover format: continuous talk + proof cutaways.</p>
        <button className="btn ghost" disabled={!!busy} onClick={previewVoice}>{busy === "voice" ? "Voicing…" : "▶ Preview my creator's voice"}</button>
        {voicePreview && <div className="scene"><b>Voice preview</b> <span className="pill">{voicePreview.engine} · {voicePreview.voice || "fixed speaker"}</span>
          {voicePreview.plan && <p className="hint">Plan: {voicePreview.plan}</p>}
          {voicePreview.warning && <p className="hint">⚠ {voicePreview.warning}</p>}
          {voicePreview.audio_url && !String(voicePreview.audio_url).startsWith("modal-volume://") && <audio controls src={voicePreview.audio_url} />}
          {String(voicePreview.audio_url || "").startsWith("modal-volume://") && <p className="hint">Voice generated into the Modal volume ({voicePreview.audio_url}) — public playback unlocks when R2 keys are set.</p>}
        </div>}
        <p className="hint">Keyframes are automatic: every live video run first asks Muse Image 1.0 for any missing still, so Meta is in every film. Preview them below if you want to approve the face first.</p>
        <button className="btn" disabled={!!busy} onClick={keyframes}>{busy === "keyframes" ? "Generating keyframes…" : "Preview keyframes (Muse Image)"}</button>{" "}
        <button className="btn ghost" disabled={!!busy || !frames.length} onClick={runQC}>{busy === "qc" ? "Checking frames…" : "Run SAM 3.1 QC"}</button>{" "}
        <button className="btn accent" disabled={!!busy} onClick={generate}>{busy === "generate" ? "Your team is filming…" : form.sceneLimit === "0" ? "Generate full video" : `Generate ${form.sceneLimit}-scene calibration`}</button>
        {frames.length > 0 && <div className="keyframe-grid">{frames.map((f) => { const seg = segByScene.get(f.scene); return (
          <div className="keyframe-card" key={f.scene}>
            <div className="scene-head"><b>Scene {f.scene}</b><span className="pill">Muse Image 1.0</span></div>
            <img src={f.keyframe_url} alt={`Scene ${f.scene} keyframe`} />
            {seg ? <p className={"qc-line " + (seg.person_ok ? "ok" : "warn")}>{seg.person_ok ? "✓ SAM QC: creator detected" : "⚠ SAM QC: no creator detected"}{seg.detections ? ` · person ${seg.detections.person ?? "—"} · phone ${seg.detections.phone ?? "—"}` : ""}</p> : <p className="hint">SAM QC has not checked this frame yet.</p>}
            {seg?.note && <p className="hint">{seg.note}</p>}
          </div>); })}
        </div>}
        {qcRun?.qc?.error && <p className="hint">⚠ {qcRun.qc.error}</p>}
        {qcRun?.qc && !qcRun.qc.error && <p className="hint">SAM QC checked {qcRun.qc.checked} frame(s). It is advisory — a warning helps you fix a bad still before filming, it never blocks the run.</p>}
        {job && <><br /><br />
          <span className="pill pass">Job {job.id} — {job.status} ({job.progress}%)</span>{" "}
          <span className="pill demo">engine: {job.engine}</span>
          {job.models && <div className="credits-bar" style={{ marginTop: 10 }}>
            <span className="credit-chip">Brain · {job.models.script}</span>
            <span className="credit-chip">Keyframe · {job.models.keyframe}</span>
            <span className="credit-chip">Voice · {job.models.voice}</span>
            <span className="credit-chip">Video · {job.models.video}</span>
            <span className="credit-chip">Critic · {job.models.critic}</span>
          </div>}
          {job.models?.keyframe_status?.created?.length > 0 && <p className="hint">Muse Image created {job.models.keyframe_status.created.length} keyframe(s) inside this run (scenes {job.models.keyframe_status.created.join(", ")}) — no manual step needed.</p>}
          {job.models?.keyframe_status?.error && <p className="hint">⚠ {job.models.keyframe_status.error}</p>}
          {job.models?.segment_status?.results?.length > 0 && <div className="qc-strip">
            <b>SAM 3.1 keyframe QC</b>
            {job.models.segment_status.results.map((row) => <span key={row.scene} className={"qc-item " + (row.person_ok ? "ok" : "warn")}>Scene {row.scene}: {row.person_ok ? "creator ✓" : "check frame ⚠"}{row.detections ? ` · person ${row.detections.person ?? "—"} · phone ${row.detections.phone ?? "—"}` : ""}</span>)}
            <small>SAM only checks that the right objects are in frame. It does not generate video.</small>
          </div>}
          {job.models?.segment_status?.error && <p className="hint">⚠ {job.models.segment_status.error}</p>}
          {job.verification && <div className="verify-strip">
            <b>Speech verification — {job.verification.status}</b>
            {typeof job.verification.similarity === "number" && <span>{Math.round(job.verification.similarity * 100)}% script-word overlap</span>}
            {job.verification.heard && <p>Heard: “{job.verification.heard}”</p>}
            <small>{job.verification.note || "Muse Voice Transcribe compared the shipped voice with the script."}</small>
          </div>}
          <p className="hint" style={{ marginTop: 12 }}>{job.note}</p>
          {job.scenes?.map((s) => <div className="scene" key={s.scene}><b>Scene {s.scene}</b>{" "}
            <span className="pill pass">critic: {s.critic?.verdict} ({s.critic?.score}/10)</span>{" "}
            <span className="pill demo">{s.mode}</span>
            {s.voice && <span className="pill">voice: {s.voice.engine}{s.voice.voice ? ` · ${s.voice.voice}` : ""}</span>}
            {s.overlay && <span className="pill">📎 proof: {typeof s.overlay === "object" ? `${s.overlay.asset} · ${s.overlay.style}` : "attached"}</span>}
            <p>{s.critic?.note}</p>
            {s.voice?.warning && <p className="hint">⚠ {s.voice.warning}</p>}
            {s.mode === "failed" && <p className="hint">⚠ This scene failed to render and was left out of the stitched film — the rest of the run was preserved.</p>}
            {s.clip_url && !String(s.clip_url).startsWith("modal-volume://") && <video controls playsInline preload="metadata" src={s.clip_url} />}
            {String(s.clip_url || "").startsWith("modal-volume://") && <p className="hint">Clip saved in the private Modal volume: {s.clip_url}. Connect public R2 media URLs to play it here.</p>}</div>)}
          {job.failed_scenes?.length > 0 && <p className="hint">⚠ Scenes {job.failed_scenes.map((f) => f.scene).join(", ")} did not render. You received the partial film from the scenes that worked — nothing already paid for was thrown away.</p>}
          {job.overlays_applied != null && <p className="hint">Proof overlays composited into the final film: {job.overlays_applied}. (Editorial overlay intent is recorded per scene; real uploaded assets are required before a card can be composited.)</p>}
          {job.final_video_url && !String(job.final_video_url).startsWith("modal-volume://") && <div className="final-video"><b>Your finished film</b><video controls playsInline preload="metadata" src={job.final_video_url} /></div>}
          {String(job.final_video_url || "").startsWith("modal-volume://") && <p className="hint">Final video saved in the private Modal volume: {job.final_video_url} (public playback unlocks when R2 media URLs are connected)</p>}
          {!job.final_video_url && job.status === "complete" && <p className="hint">The run completed, but no stitch URL came back. Scene outputs above are preserved; connect the stitch/R2 result before calling this a finished film.</p>}
        </>}
      </div>}

      {project.script && <div className="panel"><h3>6. Export for Posting <span className="pill demo">optional</span></h3>
        <p className="hint">After your video is stitched with the AI-generated label, we prepare a ready-to-post package: a caption in your video&apos;s language ({LANG_LABELS[project.language] || project.language}) plus 5–8 hashtags. The Studio shows the private Modal-volume reference until public R2 media URLs are connected. No auto-posting — copy it and post it yourself. <span className="pill">{health?.models?.export || "Muse Spark Open (Baseten)"}</span></p>
        <button className="btn" disabled={!!busy} onClick={buildExport}>{busy === "export" ? "Preparing package…" : (pkg || job?.posting_package) ? "Refresh posting package" : "Prepare posting package"}</button>
        {(job?.posting_package || pkg) && (() => { const pp = job?.posting_package || pkg; const full = pp.caption + "\n\n" + (pp.hashtags || []).join(" "); return (
          <div className="scene" style={{ marginTop: 12 }}>
            <b>Posting package</b> <span className="pill">{pp.language}</span> {pp.mode === "demo" && <span className="pill demo">demo</span>}
            <p style={{ whiteSpace: "pre-wrap" }}>{pp.caption}</p>
            <p>{(pp.hashtags || []).map((h) => <span className="pill" key={h}>{h}</span>)}</p>
            <p className="hint">Video: {pp.video_url || "your finished video (Studio job above)"}</p>
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

