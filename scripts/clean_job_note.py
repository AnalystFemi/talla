with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

target = '{job.note && <p className="hint" style={{ marginTop: 12 }}>{job.note}</p>}'
if target in text:
    text = text.replace(target, '')
    with open('talla/web/src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Removed job.note from App.jsx!")
else:
    print("job.note not found in App.jsx")
