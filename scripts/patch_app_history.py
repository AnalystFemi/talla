with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add state variables
old_state = '  const [hasCode, setHasCode] = useState(() => !!getAccessCode());'
new_state = '''  const [hasCode, setHasCode] = useState(() => !!getAccessCode());
  const [historyProjects, setHistoryProjects] = useState([]);
  const [showHistory, setShowHistory] = useState(false);'''

assert old_state in text, "old_state not found"
text = text.replace(old_state, new_state)

# 2. Add loadProjectHistory and loadProject
old_reset = '  // Everything tied to one project is cleared here — and only here.'
new_history_fns = '''  const loadProjectHistory = () => {
    api("/api/projects").then((res) => {
      if (Array.isArray(res?.projects)) setHistoryProjects(res.projects);
    }).catch(() => {});
  };

  const loadProject = (pid) => run("load", async () => {
    resetProjectState();
    const p = await api(`/api/projects/${pid}`);
    setProject(p);
    setLastProject(p.id);
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      description: p.description || f.description,
      url: p.url || f.url,
      category: p.category || f.category,
      audience: p.audience || f.audience,
      language: p.language || f.language,
      persona: p.persona || f.persona,
      format: p.storyboard?.format || p.format || f.format
    }));
    setShowHistory(false);
    const stored = getStoredJob(p.id);
    if (stored) startPolling(stored.id, p.id, stored.started || Date.now());
  });

  // Everything tied to one project is cleared here — and only here.'''

assert old_reset in text, "old_reset not found"
text = text.replace(old_reset, new_history_fns)

# 3. Call loadProjectHistory on mount
old_mount = '''  useEffect(() => {
    refreshCredits();
    loadHealth();'''

new_mount = '''  useEffect(() => {
    refreshCredits();
    loadHealth();
    loadProjectHistory();'''

assert old_mount in text, "old_mount not found"
text = text.replace(old_mount, new_mount)

# 4. Refresh history after creating a project
old_create = '''  const create = () => run("create", async () => {
    resetProjectState();
    const p = await api("/api/projects", { method: "POST", body: JSON.stringify(form) });
    setProject(p); setLastProject(p.id);'''

new_create = '''  const create = () => run("create", async () => {
    resetProjectState();
    const p = await api("/api/projects", { method: "POST", body: JSON.stringify(form) });
    setProject(p); setLastProject(p.id);
    loadProjectHistory();'''

assert old_create in text, "old_create not found"
text = text.replace(old_create, new_create)

# 5. Add History button in nav-tools and History dropdown
old_nav_tools = '''      <div className="nav-tools">
        {hasCode && !locked ? (
          <span className="pill status pass">Live mode</span>
        ) : (
          <span className="pill status demo">Demo mode</span>
        )}
        <button type="button" className="btn small ghost" aria-expanded={showAccess} aria-controls="access-panel"
          onClick={() => { setShowAccess((v) => !v); setAccessMsg(""); }}>{hasCode && !locked ? "Access code ✓" : "Access code"}</button>
      </div></div></header>'''

new_nav_tools = '''      <div className="nav-tools">
        <button type="button" className="btn small ghost" aria-expanded={showHistory}
          onClick={() => { setShowHistory((v) => !v); loadProjectHistory(); }}
          title="Switch to a previous project">
          📁 History {historyProjects.length > 0 && `(${historyProjects.length})`}
        </button>
        {hasCode && !locked ? (
          <span className="pill status pass">Live mode</span>
        ) : (
          <span className="pill status demo">Demo mode</span>
        )}
        <button type="button" className="btn small ghost" aria-expanded={showAccess} aria-controls="access-panel"
          onClick={() => { setShowAccess((v) => !v); setAccessMsg(""); }}>{hasCode && !locked ? "Access code ✓" : "Access code"}</button>
      </div></div>
      {showHistory && (
        <div className="history-dropdown" role="dialog" aria-label="Project history">
          <div className="history-head">
            <b>Project history</b>
            <button type="button" className="btn small ghost" onClick={() => setShowHistory(false)}>✕</button>
          </div>
          <div className="history-list">
            {historyProjects.length === 0 ? (
              <p className="hint" style={{ padding: "12px 14px", margin: 0 }}>No previous projects found.</p>
            ) : (
              historyProjects.map((hp) => (
                <button
                  key={hp.id}
                  type="button"
                  className={"history-item" + (project?.id === hp.id ? " active" : "")}
                  onClick={() => loadProject(hp.id)}
                >
                  <div className="history-item-info">
                    <b>{hp.name || hp.category || "Untitled project"}</b>
                    <span>{LANG_LABELS[hp.language] || hp.language} · {hp.status || "draft"}</span>
                  </div>
                  <span className="btn small ghost" style={{ flex: "none", fontSize: 12 }}>Open →</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </header>'''

assert old_nav_tools in text, "old_nav_tools not found"
text = text.replace(old_nav_tools, new_nav_tools)

with open('talla/web/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("App.jsx updated with project history!")
