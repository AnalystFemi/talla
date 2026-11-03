with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'app\.get\([\'\"]/api/projects', text)]
for m in matches:
    print(text[m:m+120])
