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
  ["Research", "Pain points, hooks, formats · Muse Spark Open"], ["Storyboard", "3–7 scenes you review · Muse Spark Open"],
  ["Script", "Local-language lines · Muse Spark Open"], ["Keyframe", "Muse Image 1.0 photoreal UGC stills"],
  ["Voice", "YarnGPT2 / MMS (H3 native for English)"], ["Video", "MiniMax H3 primary on Modal"],
  ["Critic", "Muse Spark scores every scene"], ["Film", "25–40s captioned UGC video + AI label"],
  ["Export for Posting", "Caption + hashtags, ready to copy & post yourself"],
];
// Stays in sync with MODEL_MAP in worker/src/index.js (also served at /api/health).
const MODEL_BADGES = { research: "Muse Spark Open (Baseten)", storyboard: "Muse Spark Open (Baseten)",
  script: "Muse Spark Open (Baseten)", keyframe: "Muse Image 1.0 (Meta)", voice: "YarnGPT2 / MMS (Modal)",
  video: "MiniMax H3 (Modal)", critic: "Muse Spark Open (Baseten)", stitch: "ffmpeg composite (Modal)" };
const LANGS = ["pidgin", "yoruba", "hausa", "igbo", "nigerian-english"];
const PERSONAS = [
  { id: "female-creator", label: "Female creator", blurb: "Woman, late 20s, braids — voice: Idera (YarnGPT2)" },
  { id: "male-creator", label: "Male creator", blurb: "Man, early 30s, fade + beard — voice: Jude (YarnGPT2)" },
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
        <p className="sub">Five specialists that hand work to each other — like a Riverside studio crew, but for UGC adverts. Talla means “advertisement” in Hausa. Under the hood: Muse Spark Open plans, Muse Image 1.0 shoots the stills, MiniMax H3 films, Muse Spark critic-scores every scene.</p>
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
  const [form, setForm] = useState({ name: "", description: "", url: "", category: "", audience: "", language: "pidgin", persona: "female-creator" });
  const [project, setProject] = useState(null);
  const [job, setJob] = useState(null);
  const [frames, setFrames] = useState([]);
  const [engine, setEngine] = useState("h3");
  const [voicePreview, setVoicePreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(null);
  const [health, setHealth] = useState(null);
  const [pkg, setPkg] = useState(null);
  const [copied, setCopied] = useState("");

  const refreshCredits = () => api("/api/credits").then(setCredits).catch(() => {});
  useEffect(() => { refreshCredits(); api("/api/health").then(setHealth).catch(() => {}); }, []);

  async function run(label, fn) {
    setBusy(label); setError("");
    try { const out = await fn(); refreshCredits(); return out; }
    catch (e) { setError(e.message); } finally { setBusy(""); }
  }
  const create = () => run("create", async () => { setJob(null); setFrames([]); setVoicePreview(null); setProject(await api("/api/projects", { method: "POST", body: JSON.stringify(form) })); });
  const stage = (name) => run(name, async () => setProject(await api(`/api/projects/${project.id}/${name}`, { method: "POST", body: JSON.stringify({ storyboard: project.storyboard }) })));
  const generate = () => run("generate", async () => setJob(await api(`/api/projects/${project.id}/generate`, { method: "POST", body: JSON.stringify({ engine, persona: form.persona }) })));
  const previewVoice = () => run("voice", async () => setVoicePreview(await api(`/api/projects/${project.id}/voice-preview`, { method: "POST", body: JSON.stringify({ persona: form.persona }) })));
  const keyframes = () => run("keyframes", async () => {
    const out = await api(`/api/projects/${project.id}/keyframes`, { method: "POST", body: JSON.stringify({ persona: form.persona }) });
    setFrames(out.keyframes || []);
  });
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

  const crumbs = ["Product", "Research", "Storyboard", "Script", "Generate", "Export"];
  const active = !project ? 0 : job ? 4 : project.script ? 3 : project.storyboard ? 2 : project.research ? 1 : 0;

  return (<div className="wrap studio">
    <nav><div className="logo" style={{ cursor: "pointer" }} onClick={() => go("home")}>talla<span>.</span></div>
      <span className="pill demo">{health ? Object.entries(health.providers || {}).filter(([, v]) => v).length + " providers live" : "connecting…"}</span></nav>
    <h2>Studio</h2>
    <p className="sub">Create a project → your Researcher investigates → approve the storyboard → your team films it.</p>
    <div className="crumbs">{crumbs.map((cname, i) => <span key={cname} className={"crumb" + (i <= active ? " on" : "")}>{i + 1}. {cname}</span>)}</div>
    {error && <div className="err">{error}</div>}

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
            {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select></div></div>
      <label>Who is it for? (audience)</label>
      <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="e.g. Instagram/WhatsApp vendors" />
      <label>Your creator (face + voice are locked together — pick once)</label>
      <div className="row">{PERSONAS.map((p) => (
        <button type="button" key={p.id} className={"btn small " + (form.persona === p.id ? "accent" : "ghost")}
          onClick={() => setForm({ ...form, persona: p.id })}>{p.label}</button>))}
      </div>
      <p className="hint">{PERSONAS.find((p) => p.id === form.persona)?.blurb}. The keyframe, the H3 speaker and the Nigerian voice all use this same person — no more face/voice mismatch.</p>
      <br /><button className="btn accent" disabled={!!busy} onClick={create}>{busy === "create" ? "Creating…" : "Create project"}</button>
    </div>

    {project && <>
      <div className="panel"><h3>2. Research brief</h3>
        <div className="agents-row"><span className={"agent-chip" + (busy === "research" ? " working" : "")}>
          <img src="/agents/researcher.webp" alt="" /> Researcher {project.research?.mode === "demo" && <span className="pill demo">demo</span>}</span>
          <span className="pill">{health?.models?.research || MODEL_BADGES.research}</span></div>
        {!project.research
          ? <button className="btn" disabled={!!busy} onClick={() => stage("research")}>{busy === "research" ? "Researching…" : "Run research"}</button>
          : <pre>{JSON.stringify(project.research, null, 2)}</pre>}
      </div>

      {project.research && <div className="panel"><h3>3. Storyboard — review before we film</h3>
        <p className="hint">This is your plan of the video. Edit any scene, then approve it. Nothing expensive runs until you do. <span className="pill">{health?.models?.storyboard || MODEL_BADGES.storyboard}</span></p>
        {!project.storyboard
          ? <button className="btn" disabled={!!busy} onClick={() => stage("storyboard")}>{busy === "storyboard" ? "Storyboarding…" : "Create storyboard"}</button>
          : <>{project.storyboard.scenes.map((s, i) => (
              <div className="scene" key={i}><b>Scene {s.n} — {s.purpose}</b> <span className="pill">{s.shot}</span> <span className="pill">{s.seconds}s</span>
                <p>{s.key_line}</p><p>{s.visual}</p></div>))}
            <button className="btn ghost small" disabled={!!busy} onClick={() => stage("storyboard")}>Regenerate storyboard</button></>}
      </div>}

      {project.storyboard && <div className="panel"><h3>4. Script in {project.language}</h3>
        <div className="agents-row"><span className={"agent-chip" + (busy === "script" ? " working" : "")}>
          <img src="/agents/scriptwriter.webp" alt="" /> Scriptwriter</span>
          <span className="pill">{health?.models?.script || MODEL_BADGES.script}</span>
          <span className="agent-chip"><img src="/agents/voice.webp" alt="" /> Voice</span>
          <span className="pill">{health?.models?.voice || MODEL_BADGES.voice}</span></div>
        {!project.script
          ? <button className="btn" disabled={!!busy} onClick={() => stage("script")}>{busy === "script" ? "Writing…" : "Write script"}</button>
          : <pre>{JSON.stringify(project.script, null, 2)}</pre>}
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
            Checked {job.scenes?.length || 0} scenes on the {job.engine} engine ({health?.models?.critic || MODEL_BADGES.critic}). Per-scene verdicts are listed below.</div></div>}
          {!project.research && <p className="hint">Your team is waiting. Run research and their updates will appear here.</p>}
        </div></div>}

      {project.script && <div className="panel"><h3>5. Film it</h3>
        <div className="agents-row">{AGENTS.map((a) => (
          <span key={a.key} className={"agent-chip" + (busy === "generate" ? " working" : "")}><img src={a.img} alt="" />{a.name}</span>))}</div>
        <label>Video engine — MiniMax H3 on Modal (video + voice in one model)</label>
        <select value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="h3">MiniMax H3 — primary (self-hosted, Modal H100)</option>
          <option value="wan">Wan 2.2 — image-to-video fallback (Modal)</option>
          <option value="ltx">LTX — fallback floor (Modal)</option>
        </select>
        <div className="credits-bar" style={{ marginTop: 10 }}>
          <span className="credit-chip">Keyframe · {health?.models?.keyframe || MODEL_BADGES.keyframe}</span>
          <span className="credit-chip">Video · {engine === "h3" ? "MiniMax H3 (Modal H100)" : engine === "wan" ? "Wan 2.2 (Modal)" : "LTX (Modal)"}</span>
          <span className="credit-chip">Critic · {health?.models?.critic || MODEL_BADGES.critic}</span>
          <span className="credit-chip">Stitch · {health?.models?.stitch || MODEL_BADGES.stitch}</span>
        </div>
        <p className="hint">How voice works: Nigerian English keeps H3&apos;s own synced voice. Pidgin / Yoruba / Hausa / Igbo use our local Nigerian voice (YarnGPT2 / MMS) — generated first, then swapped onto H3&apos;s picture at stitch, so the words are exactly your script, spoken by your chosen creator.</p>
        <button className="btn ghost" disabled={!!busy} onClick={previewVoice}>{busy === "voice" ? "Voicing…" : "▶ Preview my creator's voice"}</button>
        {voicePreview && <div className="scene"><b>Voice preview</b> <span className="pill">{voicePreview.engine} · {voicePreview.voice || "fixed speaker"}</span>
          {voicePreview.plan && <p className="hint">Plan: {voicePreview.plan}</p>}
          {voicePreview.warning && <p className="hint">⚠ {voicePreview.warning}</p>}
          {voicePreview.audio_url && !String(voicePreview.audio_url).startsWith("modal-volume://") && <audio controls src={voicePreview.audio_url} />}
          {String(voicePreview.audio_url || "").startsWith("modal-volume://") && <p className="hint">Voice generated into the Modal volume ({voicePreview.audio_url}) — public playback unlocks when R2 keys are set.</p>}
        </div>}
        <p className="hint">Keyframes are automatic: every live video run first asks Muse Image 1.0 for any missing still, so Meta is in every film. Preview them below if you want to approve the face first.</p>
        <button className="btn" disabled={!!busy} onClick={keyframes}>{busy === "keyframes" ? "Generating keyframes…" : "Preview keyframes (Muse Image)"}</button>{" "}
        <button className="btn accent" disabled={!!busy} onClick={generate}>{busy === "generate" ? "Your team is filming…" : "Generate video"}</button>
        {frames.length > 0 && <div>{frames.map((f) => (
          <div className="scene" key={f.scene}><b>Scene {f.scene} keyframe</b> <span className="pill">Muse Image 1.0 (Meta)</span>
            <img className="keyframe" src={f.keyframe_url} alt={`Scene ${f.scene} keyframe`} /></div>))}
        </div>}
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
          <p className="hint" style={{ marginTop: 12 }}>{job.note}</p>
          {job.scenes?.map((s) => <div className="scene" key={s.scene}><b>Scene {s.scene}</b>{" "}
            <span className="pill pass">critic: {s.critic?.verdict} ({s.critic?.score}/10)</span>{" "}
            <span className="pill demo">{s.mode}</span>
            {s.voice && <span className="pill">voice: {s.voice.engine}{s.voice.voice ? ` · ${s.voice.voice}` : ""}</span>}
            <p>{s.critic?.note}</p>
            {s.voice?.warning && <p className="hint">⚠ {s.voice.warning}</p>}
            {s.clip_url && !String(s.clip_url).startsWith("modal-volume://") && <video controls src={s.clip_url} />}
            {String(s.clip_url || "").startsWith("modal-volume://") && <p className="hint">Clip in Modal volume: {s.clip_url}</p>}</div>)}
          {job.final_video_url && !String(job.final_video_url).startsWith("modal-volume://") && <video controls src={job.final_video_url} />}
          {String(job.final_video_url || "").startsWith("modal-volume://") && <p className="hint">Final video in Modal volume: {job.final_video_url} (public playback unlocks when R2 keys are set)</p>}
        </>}
      </div>}

      {project.script && <div className="panel"><h3>6. Export for Posting <span className="pill demo">optional</span></h3>
        <p className="hint">After your video is stitched with the AI-generated label, we prepare a ready-to-post package: a caption in your video&apos;s language ({project.language}) plus 5–8 hashtags. No auto-posting — copy it and post it yourself. <span className="pill">{health?.models?.export || "Muse Spark Open (Baseten)"}</span></p>
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

