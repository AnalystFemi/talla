with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

pos = text.find('async function getProject')
print(text[pos:pos+600])
