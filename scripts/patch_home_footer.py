with open('talla/web/src/Home.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = '<div className="wrap foot-bottom">© 2026 Talla — switch on the platform\'s AI-content label when you post.</div>'
replacement = '<div className="wrap foot-bottom">© 2026 Talla. Built for West African social commerce. All rights reserved.</div>'

if target in content:
    new_content = content.replace(target, replacement)
    with open('talla/web/src/Home.jsx', 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_content)
    print('SUCCESS: Home.jsx footer patched')
else:
    print('ERROR: target not found')
