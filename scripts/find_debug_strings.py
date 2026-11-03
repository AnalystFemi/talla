import os

terms = [
    'playback needs the media proxy',
    'open Nigerian TTS on Modal',
    'Checking every 5 seconds',
    'poll GET',
    'Face check: not reported',
    'Left advisory notes',
    'Yoruba voice',
    'not used',
    'on Modal'
]

for root, dirs, files in os.walk('talla'):
    if any(x in root for x in ['node_modules', '.wrangler', 'dist', '.git']):
        continue
    for f in files:
        if f.endswith(('.js', '.jsx', '.py', '.json', '.html')):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8') as fl:
                    c = fl.read()
                    for t in terms:
                        if t.lower() in c.lower():
                            print(f'Found "{t}" in {path}')
            except Exception as e:
                pass
