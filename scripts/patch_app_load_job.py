with open('talla/web/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = '''  const loadProject = (pid) => run("load", async () => {
    resetProjectState();
    const p = await api(`/api/projects/${pid}`);
    setProject(p);
    setLastProject(p.id);
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      description: p.description || f.description,
      url: p.url || f.url,
      category: p.category || f.category,
      audience: p.audience || f.audience,
      language: p.language || f.language,
      persona: p.persona || f.persona,
      format: p.storyboard?.format || p.format || f.format
    }));
    setShowHistory(false);
    const stored = getStoredJob(p.id);
    if (stored) startPolling(stored.id, p.id, stored.started || Date.now());
  });'''

replacement1 = '''  const loadProject = (pid) => run("load", async () => {
    resetProjectState();
    const p = await api(`/api/projects/${pid}`);
    setProject(p);
    setLastProject(p.id);
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      description: p.description || f.description,
      url: p.url || f.url,
      category: p.category || f.category,
      audience: p.audience || f.audience,
      language: p.language || f.language,
      persona: p.persona || f.persona,
      format: p.storyboard?.format || p.format || f.format
    }));
    setShowHistory(false);
    if (p.latest_job) {
      setJob(p.latest_job);
      if (p.latest_job.status === "complete") {
        setStage(4);
      } else if (p.latest_job.status === "running") {
        setStage(4);
        startPolling(p.latest_job.id, p.id, Date.now() - (p.latest_job.elapsed_seconds || 0) * 1000);
      } else if (p.script) {
        setStage(3);
      } else if (p.storyboard) {
        setStage(2);
      } else if (p.research) {
        setStage(1);
      } else {
        setStage(0);
      }
    } else {
      const stored = getStoredJob(p.id);
      if (stored) {
        startPolling(stored.id, p.id, stored.started || Date.now());
        setStage(4);
      } else if (p.script) {
        setStage(3);
      } else if (p.storyboard) {
        setStage(2);
      } else if (p.research) {
        setStage(1);
      } else {
        setStage(0);
      }
    }
  });'''

target2 = '''  const finalSrc = isPlayable(job?.final_media_url) ? mediaUrl(job.final_media_url)
    : isPlayable(job?.final_video_url) && /^(https?:|\/api\/)/.test(job.final_video_url) ? mediaUrl(job.final_video_url) : null;'''

replacement2 = '''  const finalSrc = isPlayable(job?.final_media_url) ? mediaUrl(job.final_media_url)
    : isPlayable(job?.final_video_url) ? mediaUrl(job.final_video_url) : null;'''

content_norm = content.replace('\r\n', '\n')
t1_norm = target1.replace('\r\n', '\n')
r1_norm = replacement1.replace('\r\n', '\n')
t2_norm = target2.replace('\r\n', '\n')
r2_norm = replacement2.replace('\r\n', '\n')

ok = True
if t1_norm in content_norm:
    content_norm = content_norm.replace(t1_norm, r1_norm)
    print('SUCCESS: target1 replaced')
else:
    print('ERROR: target1 not found')
    ok = False

if t2_norm in content_norm:
    content_norm = content_norm.replace(t2_norm, r2_norm)
    print('SUCCESS: target2 replaced')
else:
    print('ERROR: target2 not found')
    ok = False

if ok:
    with open('talla/web/src/App.jsx', 'w', encoding='utf-8', newline='\n') as f:
        f.write(content_norm)
    print('ALL PATCHES APPLIED TO App.jsx')
