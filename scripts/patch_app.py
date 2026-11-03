import re

with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add sidebarOpen state
old_stage_state = '  const [stage, setStage] = useState(0);'
new_stage_state = '  const [sidebarOpen, setSidebarOpen] = useState(true);\n  const [stage, setStage] = useState(0);'
if old_stage_state in text:
    text = text.replace(old_stage_state, new_stage_state, 1)

# Default engine to "talk"
text = text.replace('const [engine, setEngine] = useState("wan");', 'const [engine, setEngine] = useState("talk");')

# 2. Update site-nav in App.jsx
old_nav = '''    <header className="site-nav"><div className="nav-inner">
      <Logo onClick={() => go("home")} label="Talla — back to home" />
      <span className="studio-tag">Studio</span>
      <div className="nav-tools">
        <span className={"pill status " + healthClass}>{healthText}</span>
        <button type="button" className="btn small ghost" aria-expanded={showAccess} aria-controls="access-panel"
          onClick={() => { setShowAccess((v) => !v); setAccessMsg(""); }}>{hasCode && !locked ? "Access code ✓" : "Access code"}</button>
      </div></div></header>'''

new_nav = '''    <header className="site-nav"><div className="nav-inner">
      <Logo onClick={() => go("home")} label="Talla — back to home" />
      <span className="studio-tag">Studio</span>
      <button type="button" className="rail-toggle" onClick={() => setSidebarOpen((v) => !v)}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
        <span>{sidebarOpen ? "Hide sidebar" : "Show sidebar"}</span>
      </button>
      <div className="nav-tools">
        {hasCode && !locked ? (
          <span className="pill status pass">Live mode</span>
        ) : (
          <span className="pill status demo">Demo mode</span>
        )}
        <button type="button" className="btn small ghost" aria-expanded={showAccess} aria-controls="access-panel"
          onClick={() => { setShowAccess((v) => !v); setAccessMsg(""); }}>{hasCode && !locked ? "Access code ✓" : "Access code"}</button>
      </div></div></header>'''

if old_nav in text:
    text = text.replace(old_nav, new_nav)

# 3. Update studio-shell class to support collapse
old_shell = '<div className="studio-shell">'
new_shell = '<div className={"studio-shell" + (sidebarOpen ? "" : " rail-collapsed")}>'
if old_shell in text:
    text = text.replace(old_shell, new_shell)

# 4. Remove Credit guard from rail
old_credits = '''        {credits && <div className="rail-credits"><p className="rail-title">Credit guard</p>
          {(credits.providers || []).map((p) => (
            <div className="credit-row" key={p.provider}>
              <div className="credit-top"><span>{p.provider}</span><span>${p.estimated_used_usd} / ${p.budget_usd} ({p.pct_used}%)</span></div>
              <div className="credit-bar"><span style={{ transform: `scaleX(${Math.min(1, (Number(p.pct_used) || 0) / 100)})` }} /></div>
            </div>))}
          <p className="hint">Baseten runs the brain first; keyframes, QC and verify run on open models on Modal. Cached stages cost $0.</p>
        </div>}'''

if old_credits in text:
    text = text.replace(old_credits, '')

# 5. Remove Meta paused note banner
old_meta_banner = '''        {health && (
          <div className="hint card" role="note" style={{ marginTop: 10, background: "#fff7ed", border: "1px solid #fed7aa" }}>
            <b>Note:</b> Meta API is paused — using Baseten for research, script & review for now. Image keyframes & face checks use demo data until Meta is back.
          </div>)}'''

if old_meta_banner in text:
    text = text.replace(old_meta_banner, '')

# 6. Clean mode-banner
old_mode_banner = '''        {health && <div className={"mode-banner " + (live ? "live" : "demo")} role="status">
          <span className="mode-dot" aria-hidden="true" />
          {live ? <><b>Live mode</b> — paid models run on your requests. Every paid call is checked against the credit budget.</>
            : <><b>Demo mode</b> — no credits spent. Enter an access code to run live.</>}</div>}'''

new_mode_banner = '''        {health && <div className={"mode-banner " + (live ? "live" : "demo")} role="status">
          <span className="mode-dot" aria-hidden="true" />
          {live ? <><b>Live mode</b> — full high-definition video generation enabled.</>
            : <><b>Demo mode</b> — enter an access code to unlock live generation.</>}</div>}'''

if old_mode_banner in text:
    text = text.replace(old_mode_banner, new_mode_banner)

# 7. Update activity bubbles
old_activity = '''    {project?.script && <div className="bubble"><img src="/agents/voice-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Voice</b>
      Script written in {LANG_LABELS[project.script.language] || project.script.language}. I will speak it with open Nigerian TTS on Modal.</div></div>}
    {shownFrames.length > 0 && <div className="bubble"><img src="/agents/editor-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Editor</b>
      {shownFrames.length} keyframe{shownFrames.length > 1 ? "s" : ""} ready. Hit Generate video — any missing still is created automatically inside the run.</div></div>}
    {job && <div className="bubble"><img src="/agents/critic-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Critic · advisory</b>
      Left advisory notes on {job.scenes?.length || 0} scene{job.scenes?.length === 1 ? "" : "s"}&apos; plan and script. Face check: {segStatus?.checked ? `${segStatus.checked} frame(s) checked` : "not reported"}. Speech check: {job.verification?.status || "pending"}.</div></div>}'''

new_activity = '''    {project?.script && <div className="bubble"><img src="/agents/voice-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Voice</b>
      Script written in {LANG_LABELS[project.script.language] || project.script.language}. Ready to record your advert.</div></div>}
    {shownFrames.length > 0 && <div className="bubble"><img src="/agents/editor-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Editor</b>
      Keyframes ready. Hit Generate video to film your advert.</div></div>}
    {job && <div className="bubble"><img src="/agents/critic-cut.webp" alt="" width="44" height="44" loading="lazy" /><div className="msg"><b>Critic · advisory</b>
      Reviewed {job.scenes?.length || 0} scene{job.scenes?.length === 1 ? "" : "s"}&apos; pacing and flow.</div></div>}'''

if old_activity in text:
    text = text.replace(old_activity, new_activity)

# 8. Update storyboard thumbnails
old_thumb = '''                    <div className="thumb">
                      {f?.keyframe_url ? <img src={mediaUrl(f.keyframe_url)} alt={`Scene ${s.n} keyframe`} loading="lazy" />
                        : <div className="thumb-empty"><span className="thumb-n">{s.n}</span><small>{s.shot || "shot"}</small><span className="thumb-ratio">9:16 · still pending</span></div>}
                      {s.overlay && <span className="thumb-badge">proof · {s.overlay.style || "pip"}</span>}
                    </div>'''

new_thumb = '''                    <div className="thumb">
                      {f?.keyframe_url ? (
                        <img src={mediaUrl(f.keyframe_url)} alt={`Scene ${s.n} keyframe`} loading="lazy" />
                      ) : (
                        <div className="thumb-storyboard">
                          <img className="thumb-bg" src={selectedPersona.img || "/avatars/funmi.webp"} alt="" aria-hidden="true" />
                          <div className="thumb-overlay">
                            <img className="thumb-avatar" src={selectedPersona.img || "/avatars/funmi.webp"} alt={selectedPersona.label} />
                            <span className="thumb-scene-num">{s.n}</span>
                            <small>{s.shot || s.purpose || "Talking head"}</small>
                            <span className="thumb-ratio">9:16 portrait · Planned shot</span>
                          </div>
                        </div>
                      )}
                      {s.overlay && <span className="thumb-badge">proof · {s.overlay.style || "pip"}</span>}
                    </div>'''

if old_thumb in text:
    text = text.replace(old_thumb, new_thumb)

# 9. Storyboard actions: add Preview scene stills
old_sb_actions = '''                  <button className="btn small" disabled={!!busy || !sbDirty} onClick={saveEdits}>{busy === "save" ? "Saving…" : "Save edits"}</button>
                  {project.script && !sbDirty'''

new_sb_actions = '''                  <button className="btn small" disabled={!!busy || !sbDirty} onClick={saveEdits}>{busy === "save" ? "Saving…" : "Save edits"}</button>
                  <button type="button" className="btn small ghost" disabled={!!busy} onClick={keyframes}>{busy === "keyframes" ? "Generating stills…" : "Preview scene stills"}</button>
                  {project.script && !sbDirty'''

if old_sb_actions in text:
    text = text.replace(old_sb_actions, new_sb_actions)

# 10. Update Script sub
text = text.replace('One idea per scene, written for the creator to say out loud — then voiced with open Nigerian TTS.', 'One idea per scene, written for the creator to say out loud with authentic local cadence.')

# 11. Update Film stage: Run Settings and Creator voice
old_film_settings = '''              <section className="card"><h2 className="card-title">Run settings</h2>
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
                <div className="hint" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <img src={selectedPersona.img || selectedPersona.voiceImg || "/agents/voice-cut.webp"} alt="" width="40" height="40" style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid #e5e7eb" }} />
                  <span>{selectedPersona.label} — {LANG_LABELS[form.language] || form.language} voice</span>
                </div>
                <p className="hint">{engine === "talk"
                  ? "Your creator’s face moves with the voice — lips follow the audio, clip length follows the line."
                  : "Your creator’s voice is generated first, then added to the picture — the words are exactly your script."}</p>
                <button className="btn ghost" disabled={!!busy} onClick={previewVoice}>{busy === "voice" ? "Voicing…" : `▶ Preview my creator's voice${lockNote}`}</button>
                {voicePreview && <div className="scene"><div style={{ display: "flex", alignItems: "center", gap: 8 }}><img src={selectedPersona.img || "/agents/voice-cut.webp"} alt="" width="32" height="32" style={{ borderRadius: "50%" }} /><b>Voice preview</b></div> <span className="pill">{voicePreview.voice || "fixed speaker"}</span>
                  {voicePreview.plan && <p className="hint">Plan: {voicePreview.plan}</p>}
                  {voicePreview.warning && <p className="hint">⚠ {voicePreview.warning}</p>}
                  {isPlayable(voicePreview.audio_url) && <audio controls src={mediaUrl(voicePreview.audio_url)} />}
                  {String(voicePreview.audio_url || "").startsWith("modal-volume://") && <p className="hint">Voice generated into the Modal volume ({voicePreview.audio_url}) — playback needs the media proxy.</p>}
                </div>}
              </section>'''

new_film_settings = '''              <section className="card"><h2 className="card-title">Film settings</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span className="pill status pass">Vertical 9:16</span>
                  <span className="pill">Lip-synced creator</span>
                  <span className="pill">Dual captions</span>
                </div>
                <fieldset className="engine-picks"><legend id="calib-legend">Calibration scenes</legend>
                  <div className="calib-row" role="group" aria-labelledby="calib-legend">{[
                    ["0", "Full video", "Full storyboard — all scenes"],
                    ["1", "Scene 1", "Calibration — scene 1 only"],
                    ["2", "First 2", "Calibration — first 2 scenes"],
                    ["3", "First 3", "Calibration — first 3 scenes"],
                  ].map(([v, b, d]) => (
                    <button type="button" key={v} aria-pressed={String(form.sceneLimit) === v} title={d} className={"calib-card" + (String(form.sceneLimit) === v ? " selected" : "")}
                      onClick={() => setForm({ ...form, sceneLimit: v })}><b>{b}</b></button>))}
                  </div>
                </fieldset>
                <p className="hint">Use calibration first: prove one talking-head beat looks right before filming the full advert.</p>
              </section>
              <section className="card"><h2 className="card-title">Your creator&apos;s voice</h2>
                <div className="hint" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <img src={selectedPersona.img || "/avatars/funmi.webp"} alt="" width="40" height="40" style={{ borderRadius: "50%", objectFit: "cover", border: "2px solid #e5e7eb" }} />
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{selectedPersona.label} — {LANG_LABELS[form.language] || form.language} voice</span>
                </div>
                <p className="hint">Your creator’s lips move naturally with authentic West African cadence and accent.</p>
                <button className="btn ghost" disabled={!!busy} onClick={previewVoice}>{busy === "voice" ? "Generating voice sample…" : `▶ Preview creator voice${lockNote}`}</button>
                {voicePreview && (
                  <div className="scene" style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img src={selectedPersona.img || "/avatars/funmi.webp"} alt="" width="32" height="32" style={{ borderRadius: "50%" }} />
                      <b>Voice sample: {selectedPersona.label}</b>
                    </div>
                    {voicePreview.warning && <p className="hint">⚠ {voicePreview.warning}</p>}
                    {isPlayable(voicePreview.audio_media_url || voicePreview.audio_url) && (
                      <audio controls autoPlay src={mediaUrl(voicePreview.audio_media_url || voicePreview.audio_url)} style={{ marginTop: 10, width: "100%" }} />
                    )}
                  </div>
                )}
              </section>'''

if old_film_settings in text:
    text = text.replace(old_film_settings, new_film_settings)

# 12. Clean Job rendering: ONLY progress bar, elapsed time, status
pattern_job = r'\{job && <section className="card job-box">[\s\S]*?</section>\}'

new_job_section = '''{job && <section className="card job-box"><h2 className="card-title">Production film</h2>
              <div className="job-head">
                <div className="job-meta">
                  <span className={"pill " + jobClass}>{filming ? `Filming advert (${progress}%)` : job.status === "complete" ? "Film ready" : "Filming status"}</span>
                  {filming && jobStarted && <span className="hint">Elapsed {fmtElapsed(now - jobStarted)}</span>}
                </div>
                <div className={"progress" + (filming ? " live" : "")} role="progressbar" aria-label="Film progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
                {job.step && <p className="job-step">{job.step}</p>}
              </div>
              {pollError && <p className="hint">⚠ Status check reconnecting ({pollError})</p>}
              {job.error && <div className="err" role="alert"><b>The run stopped.</b> {job.error}</div>}
              {job.stitch_error && <div className="err" role="alert"><b>Stitching failed.</b> {job.stitch_error} Scene clips below are preserved.</div>}
              {job.note && <p className="hint" style={{ marginTop: 12 }}>{job.note}</p>}
              {finalSrc && <div className="final-video"><b>Your finished film</b><video controls playsInline preload="metadata" src={finalSrc} /></div>}
              {job.failed_scenes?.length > 0 && <div className="err" role="alert"><b>Some scenes did not render.</b> You get the film from the scenes that worked — nothing already paid for was thrown away.
                <ul>{job.failed_scenes.map((f, i) => <li key={i}>Scene {f.scene ?? f}{f.error ? ` — ${f.error}` : ""}</li>)}</ul></div>}
              <div className="clip-grid">{job.scenes?.map((s) => <div className="scene" key={s.scene}><b>Scene {s.scene}</b>{" "}
                {s.critic && <span className="pill">critic: {s.critic.verdict}{s.critic.score != null ? ` (${s.critic.score}/10)` : ""}</span>}{" "}
                <span className={"pill " + (s.mode === "failed" ? "fail" : "pass")}>{s.mode === "failed" ? "failed" : "ready"}</span>
                {s.overlay && <span className="pill">📎 proof attached</span>}
                {s.critic?.note && <p>{s.critic.note}</p>}
                {s.voice?.warning && <p className="hint">⚠ {s.voice.warning}</p>}
                {s.mode === "failed" && <p className="hint">⚠ This scene failed to render and was left out of the stitched film — the rest of the run was preserved.</p>}
                {isPlayable(s.clip_url) && <video controls playsInline preload="metadata" src={mediaUrl(s.clip_url)} />}
              </div>)}</div>
            </section>}'''

match = re.search(pattern_job, text)
assert match, "pattern_job still not found"
text = text[:match.start()] + new_job_section + text[match.end():]

# 13. Update stage actions
text = text.replace('Run OWLv2 QC', 'Run Quality Check')
text = text.replace('Keyframes are automatic: every live video run first draws any missing still (Z-Image).', 'Keyframes are automatic: every live video run first draws any missing stills.')
text = text.replace('Keyframes, SAM QC, voice preview and filming spend real credits, so they need the access code. Research, storyboard and script work in demo mode.', 'Enter your access code above to unlock live video rendering. Research, storyboard and script work in demo mode.')

with open('talla/web/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("App.jsx successfully patched!")
