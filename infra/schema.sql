-- Fresh D1 schema. For an ALREADY-provisioned D1, run
-- infra/migrations/0002_hardening.sql instead (ALTERs + indexes).
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT, description TEXT, url TEXT, category TEXT, audience TEXT,
  language TEXT DEFAULT 'pidgin',
  research TEXT, storyboard TEXT, script TEXT,
  status TEXT DEFAULT 'draft',
  -- persona/keyframes/segmentation/format persist so a Workers cold start
  -- never re-bills Muse Image or reverts the locked creator (worker audit #17).
  -- keyframes holds only {scene, keyframe_key, source, image_hash} when R2 is
  -- bound (stills live in R2 at keyframes/<pid>/<scene>-<hash>.webp).
  persona TEXT,
  keyframes TEXT,
  segmentation TEXT,
  format TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT, stage TEXT, engine TEXT,
  status TEXT DEFAULT 'queued', progress INTEGER DEFAULT 0,
  output_url TEXT, critic TEXT, error TEXT,
  -- Stateless step machine (GET /api/jobs/:id advances one step):
  -- data = full job JSON incl. cursor; lock_until = epoch ms lease so
  -- concurrent polls never double-spawn a paid Modal call.
  data TEXT,
  lock_until INTEGER,
  updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id);
-- At most ONE running generate job per project (race-free idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_running_generate ON jobs(project_id) WHERE status = 'running' AND stage = 'generate';
CREATE TABLE IF NOT EXISTS credit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT, operation TEXT, estimated_usd REAL,
  project_id TEXT, cached INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS credit_log_provider ON credit_log(provider);
