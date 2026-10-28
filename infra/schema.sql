CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT, description TEXT, url TEXT, category TEXT, audience TEXT,
  language TEXT DEFAULT 'pidgin',
  research TEXT, storyboard TEXT, script TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now'))
);
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
