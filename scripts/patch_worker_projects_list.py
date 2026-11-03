with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    text = f.read()

route = '''app.get("/api/projects", async (c) => {
  const list = [];
  if (c.env?.DB) {
    try {
      const { results } = await c.env.DB.prepare(
        "SELECT id, name, description, category, language, status, format, persona FROM projects ORDER BY rowid DESC LIMIT 40"
      ).all();
      if (Array.isArray(results) && results.length > 0) {
        return c.json({ projects: results });
      }
    } catch (e) {
      console.error("[d1] list projects failed:", e?.message || e);
    }
  }
  for (const [id, p] of mem.projects.entries()) {
    list.unshift({
      id: p.id,
      name: p.name || p.category || "Untitled",
      description: p.description,
      category: p.category,
      language: p.language,
      status: p.status,
      format: p.format,
      persona: p.persona,
    });
  }
  return c.json({ projects: list });
});

'''

target = 'app.get("/api/projects/:pid", async (c) => {'
assert target in text, "target not found"
text = text.replace(target, route + target)

with open('talla/worker/src/index.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("GET /api/projects route added to worker/src/index.js!")
