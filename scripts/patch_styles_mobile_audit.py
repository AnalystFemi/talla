with open('talla/web/src/styles.css', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update global touch-action & tap highlight
target_body = 'body{margin:0;font-family:var(--body);font-size:16px;letter-spacing:0;background:#fff;color:var(--ink);overflow-x:hidden}'
replacement_body = 'body{margin:0;font-family:var(--body);font-size:16px;letter-spacing:0;background:#fff;color:var(--ink);overflow-x:hidden;-webkit-tap-highlight-color:transparent}\nbutton,input,textarea,select,a{touch-action:manipulation}'

# 2. Update input font-size to 16px to prevent iOS auto-zoom
target_input = 'input,textarea,select{width:100%;padding:13px 16px;border:1px solid transparent;border-radius:12px;font:inherit;font-size:15px;background:var(--soft);color:var(--ink)}'
replacement_input = 'input,textarea,select{width:100%;padding:13px 16px;border:1px solid transparent;border-radius:12px;font:inherit;font-size:16px;background:var(--soft);color:var(--ink)}'

# 3. Add btn-history and history-backdrop styles
target_hist = '.history-dropdown{position:absolute;top:calc(100% + 8px);right:24px;width:380px;max-width:calc(100vw - 32px);max-height:480px;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(17,17,17,.18);border:1px solid var(--line);z-index:100;overflow:hidden;display:flex;flex-direction:column;animation:rise .25s ease}'
replacement_hist = '''.btn-history{display:inline-flex;align-items:center;gap:6px}
.btn-history svg{flex:none;transition:transform .2s ease}
.btn-history:hover svg{transform:rotate(-30deg)}
.history-badge{background:var(--soft);color:var(--muted);font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px;border:1px solid var(--line);line-height:1.4}
.btn-history:hover .history-badge{background:#fff;color:var(--ink);border-color:var(--ink)}
.history-backdrop{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.25);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);animation:fadeIn .18s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.history-dropdown{position:absolute;top:calc(100% + 8px);right:24px;width:380px;max-width:calc(100vw - 32px);max-height:480px;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(17,17,17,.18);border:1px solid var(--line);z-index:100;overflow:hidden;display:flex;flex-direction:column;animation:rise .25s ease}'''

# 4. Update mobile styles
target_mobile = '  .rail ol,.rail ul,.rail-steps{display:flex;gap:4px;margin:0;overflow-x:auto;scrollbar-width:none}'
replacement_mobile = '  .rail ol,.rail ul,.rail-steps{display:flex;gap:4px;margin:0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}\n  .history-dropdown{position:fixed;top:auto;bottom:16px;left:12px;right:12px;width:auto;max-width:none;max-height:75vh;border-radius:20px;box-shadow:0 16px 48px rgba(17,17,17,.32);z-index:100}\n  .history-list{-webkit-overflow-scrolling:touch;max-height:55vh}'

content_norm = content.replace('\r\n', '\n')
tb_norm = target_body.replace('\r\n', '\n')
rb_norm = replacement_body.replace('\r\n', '\n')
ti_norm = target_input.replace('\r\n', '\n')
ri_norm = replacement_input.replace('\r\n', '\n')
th_norm = target_hist.replace('\r\n', '\n')
rh_norm = replacement_hist.replace('\r\n', '\n')
tm_norm = target_mobile.replace('\r\n', '\n')
rm_norm = replacement_mobile.replace('\r\n', '\n')

ok = True
for name, t, r in [('body', tb_norm, rb_norm), ('input', ti_norm, ri_norm), ('hist', th_norm, rh_norm), ('mobile', tm_norm, rm_norm)]:
    if t in content_norm:
        content_norm = content_norm.replace(t, r)
        print(f'SUCCESS: {name} replaced')
    else:
        print(f'ERROR: {name} target not found')
        ok = False

if ok:
    with open('talla/web/src/styles.css', 'w', encoding='utf-8', newline='\n') as f:
        f.write(content_norm)
    print('ALL STYLES WRITTEN TO styles.css')
