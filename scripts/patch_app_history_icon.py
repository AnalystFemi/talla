with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        <button type="button" className="btn small ghost" aria-expanded={showHistory}
          onClick={() => { setShowHistory((v) => !v); loadProjectHistory(); }}
          title="Switch to a previous project">
          📁 History {historyProjects.length > 0 && `(${historyProjects.length})`}
        </button>'''

replacement = '''        <button type="button" className="btn small ghost btn-history" aria-expanded={showHistory}
          onClick={() => { setShowHistory((v) => !v); loadProjectHistory(); }}
          title="Project history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 3" />
          </svg>
          <span>History</span>
          {historyProjects.length > 0 && <span className="history-badge">{historyProjects.length}</span>}
        </button>'''

target_drop = '''      {showHistory && (
        <div className="history-dropdown" role="dialog" aria-label="Project history">
          <div className="history-head">
            <b>Project history</b>
            <button type="button" className="btn small ghost" onClick={() => setShowHistory(false)}>✕</button>
          </div>'''

replacement_drop = '''      {showHistory && (
        <>
          <div className="history-backdrop" onClick={() => setShowHistory(false)} aria-hidden="true" />
          <div className="history-dropdown" role="dialog" aria-label="Project history">
            <div className="history-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l3 3" />
                </svg>
                <b>Project history</b>
              </div>
              <button type="button" className="btn small ghost" onClick={() => setShowHistory(false)} aria-label="Close history">✕</button>
            </div>'''

target_close = '''          </div>
        </div>
      )}'''

replacement_close = '''          </div>
        </div>
        </>
      )}'''

content_norm = content.replace('\r\n', '\n')
t_norm = target.replace('\r\n', '\n')
r_norm = replacement.replace('\r\n', '\n')
td_norm = target_drop.replace('\r\n', '\n')
rd_norm = replacement_drop.replace('\r\n', '\n')
tc_norm = target_close.replace('\r\n', '\n')
rc_norm = replacement_close.replace('\r\n', '\n')

ok = True
if t_norm in content_norm:
    content_norm = content_norm.replace(t_norm, r_norm)
    print('SUCCESS: History button icon replaced')
else:
    print('ERROR: History button target not found')
    ok = False

if td_norm in content_norm:
    content_norm = content_norm.replace(td_norm, rd_norm)
    print('SUCCESS: History dropdown head replaced')
else:
    print('ERROR: History dropdown head target not found')
    ok = False

if tc_norm in content_norm:
    content_norm = content_norm.replace(tc_norm, rc_norm)
    print('SUCCESS: History dropdown close tag replaced')
else:
    print('ERROR: History dropdown close tag not found')
    ok = False

if ok:
    with open('talla/web/src/App.jsx', 'w', encoding='utf-8', newline='\n') as f:
        f.write(content_norm)
    print('ALL CHANGES WRITTEN TO App.jsx')
