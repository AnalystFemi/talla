with open('talla/web/src/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

extra_css = """
/* Sidebar collapse */
.studio-shell.rail-collapsed{grid-template-columns:minmax(0,1fr) 320px}
.studio-shell.rail-collapsed .rail{display:none}
.rail-toggle{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;color:var(--muted);background:var(--soft);border:1px solid var(--line);cursor:pointer;transition:all .2s ease;margin-left:10px}
.rail-toggle:hover{color:var(--ink);background:#fff;border-color:var(--ink)}

/* Storyboard visual thumbnails */
.thumb-storyboard{position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#18181b;overflow:hidden}
.thumb-storyboard .thumb-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35;filter:blur(10px) brightness(.65);transform:scale(1.15)}
.thumb-storyboard .thumb-overlay{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 12px;text-align:center}
.thumb-storyboard .thumb-avatar{width:68px;height:68px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px rgba(255,255,255,.4),0 8px 24px rgba(0,0,0,.6)}
.thumb-storyboard .thumb-scene-num{font-family:var(--display);font-weight:800;font-size:24px;color:#fff;line-height:1}
.thumb-storyboard small{font-size:12.5px;color:#f3f4f6;font-weight:600;max-width:92%;line-height:1.35}
.thumb-storyboard .thumb-ratio{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-top:2px}
"""

if ".rail-toggle" not in css:
    css += extra_css
    with open('talla/web/src/styles.css', 'w', encoding='utf-8') as f:
        f.write(css)
    print("styles.css updated!")
else:
    print("styles.css already had .rail-toggle")
