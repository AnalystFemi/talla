CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT, description TEXT, url TEXT, category TEXT, audience TEXT,
  language TEXT DEFAULT 'pidgin',
  research TEXT, storyboard TEXT, script TEXT,
  status TEXT DEFAULT 'draft',
  -- persona/keyframes/segmentation persist so a Workers cold start never
  -- re-bills Muse Image or reverts the locked creator (worker audit #17).
  persona TEXT,
  keyframes TEXT,
  segmentation TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
-- For an already-provisioned D1, run once (harmless to re-run):
-- ALTER TABLE projects ADD COLUMN persona TEXT;
-- ALTER TABLE projects ADD COLUMN keyframes TEXT;
-- ALTER TABLE projects ADD COLUMN segmentation TEXT;
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT, stage TEXT, engine TEXT,
  status TEXT DEFAULT 'queued', progress INTEGER DEFAULT 0,
  output_url TEXT, critic TEXT, error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT, operation TEXT, estimated_usd REAL,
  project_id TEXT, cached INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
