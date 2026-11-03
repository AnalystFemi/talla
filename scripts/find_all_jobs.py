with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if '{job &&' in l:
        print(f"Match at line {i+1}: {l.strip()[:60]}")
