with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

for term in ['credits-bar', 'modelEntries', 'Checking every 5 seconds', 'Keyframe QC', 'Queued — poll', 'OWLv2']:
    print(f"{term}: {term in text}")
