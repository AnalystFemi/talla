with open('talla/web/src/styles.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if '@media' in l:
        print(f'{i+1}: {l.strip()}')
