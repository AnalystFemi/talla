with open('talla/worker/src/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''app.get("/api/projects/:pid", async (c) => {
  const p = await getProject(c.env, c.req.param("pid"));
  return p ? c.json(publicProject(p)) : c.json({ error: "Project not found" }, 404);
});'''

replacement = '''app.get("/api/projects/:pid", async (c) => {
  const pid = c.req.param("pid");
  const p = await getProject(c.env, pid);
  if (!p) return c.json({ error: "Project not found" }, 404);
  const out = publicProject(p);
  const lj = await latestJob(c.env, pid);
  if (lj) {
    out.latest_job = publicJob(lj);
  }
  return c.json(out);
});'''

content_norm = content.replace('\r\n', '\n')
target_norm = target.replace('\r\n', '\n')
replacement_norm = replacement.replace('\r\n', '\n')

if target_norm in content_norm:
    new_content = content_norm.replace(target_norm, replacement_norm)
    with open('talla/worker/src/index.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_content)
    print('SUCCESS: worker index.js patched')
else:
    print('ERROR: target not found')
