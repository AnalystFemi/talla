with open('talla/web/src/styles.css', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''  .activity{grid-column:1;position:fixed;left:12px;right:12px;bottom:12px;z-index:40;max-height:46vh;padding:4px 16px 12px;box-shadow:0 12px 40px rgba(17,17,17,.35)}
  .activity:not(.open) .activity-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}
  .activity.open .activity-body{max-height:36vh;overflow:auto}'''

replacement = '''  .rail-toggle{display:none}
  .activity{grid-column:1;position:static;max-height:none;border-radius:18px;margin:20px 0 110px;padding:6px 16px;box-shadow:0 4px 16px rgba(17,17,17,.08)}
  .activity-title{display:none}
  .activity-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;background:none;border:0;color:#fff;font:700 16px var(--display);padding:12px 0;cursor:pointer}
  .activity-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}
  .activity.open .activity-body{grid-template-rows:1fr}
  .activity-inner{overflow:hidden;min-height:0}
  .activity.open .activity-inner{padding-bottom:12px}
  .activity.open .activity-toggle .chev{transform:rotate(180deg)}'''

content_norm = content.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in content_norm:
    new_content = content_norm.replace(target_norm, replacement_norm)
    with open('talla/web/src/styles.css', 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_content)
    print('SUCCESS: styles.css patched')
else:
    print('ERROR: target not found in styles.css')
