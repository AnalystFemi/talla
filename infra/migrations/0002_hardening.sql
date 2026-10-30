-- 0002 hardening (2026-10-30) — for an ALREADY-provisioned D1.
-- Run: npx wrangler d1 execute talla --remote --file=infra/migrations/0002_hardening.sql
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS": a statement fails if the column
-- already exists and D1 stops the file there. So the columns that are NEW
-- in every deployed schema come first, and the three that a D1 created
-- from the 2026-10-29 schema (or the old commented ALTERs) may already have
-- come LAST: a "duplicate column name: persona" error at that point means
-- everything needed was applied. Check with: PRAGMA table_info(projects);
-- ADD COLUMN cannot take a non-constant default, so jobs.updated_at has none;
-- the Worker always writes it explicitly.
ALTER TABLE projects ADD COLUMN format TEXT;
ALTER TABLE jobs ADD COLUMN data TEXT;
ALTER TABLE jobs ADD COLUMN lock_until INTEGER;
ALTER TABLE jobs ADD COLUMN updated_at TEXT;
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id);
-- At most ONE running generate job per project (race-free idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_running_generate ON jobs(project_id) WHERE status = 'running' AND stage = 'generate';
CREATE INDEX IF NOT EXISTS credit_log_provider ON credit_log(provider);
-- May already exist (see header) — must stay the LAST statements.
ALTER TABLE projects ADD COLUMN persona TEXT;
ALTER TABLE projects ADD COLUMN keyframes TEXT;
ALTER TABLE projects ADD COLUMN segmentation TEXT;
