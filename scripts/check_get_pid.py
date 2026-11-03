with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('app.get("/api/projects/:pid"')
print(text[pos:pos+400])
