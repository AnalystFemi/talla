with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_note = 'note: live ? "Queued — poll GET /api/jobs/:id every ~5 s; each poll advances one step."'
new_note = 'note: live ? "Filming advert in portrait 9:16."'
if old_note in text:
    text = text.replace(old_note, new_note)
    with open('talla/worker/src/index.js', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Worker index.js note cleaned!")
else:
    print("old_note not found in index.js")
