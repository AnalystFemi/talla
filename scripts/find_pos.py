with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('app.post("/api/projects"')
print(text[pos-100:pos+300])
