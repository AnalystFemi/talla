with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if '{job &&' in l and i > 500:
        for j in range(i, min(len(lines), i+30)):
            print(f'{j+1}: {lines[j].strip()}')
        break
