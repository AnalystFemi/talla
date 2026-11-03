with open('talla/web/src/styles.css', 'r', encoding='utf-8') as f:
    css = f.read()

history_css = """
/* History dropdown / modal */
.history-dropdown{position:absolute;top:calc(100% + 8px);right:24px;width:380px;max-width:calc(100vw - 32px);max-height:480px;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(17,17,17,.18);border:1px solid var(--line);z-index:100;overflow:hidden;display:flex;flex-direction:column;animation:rise .25s ease}
.history-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
.history-head b{font-family:var(--display);font-size:16px}
.history-list{overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;max-height:380px}
.history-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:12px;background:var(--soft);border:1px solid transparent;cursor:pointer;text-align:left;font:inherit;transition:all .15s ease;width:100%}
.history-item:hover{background:#fff;border-color:var(--accent);transform:translateY(-1px);box-shadow:0 4px 12px rgba(59,43,255,.08)}
.history-item.active{border-color:var(--accent);background:var(--accent-tint)}
.history-item-info b{display:block;font-size:14px;color:var(--ink);margin-bottom:2px}
.history-item-info span{font-size:12px;color:var(--muted)}
"""

if ".history-dropdown" not in css:
    css += history_css
    with open('talla/web/src/styles.css', 'w', encoding='utf-8') as f:
        f.write(css)
    print("styles.css updated with history styling!")
else:
    print("styles.css already has history styling")
