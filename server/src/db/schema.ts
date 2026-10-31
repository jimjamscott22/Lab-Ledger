export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS labs (
  slug TEXT PRIMARY KEY, date TEXT NOT NULL, lab_number INTEGER, title TEXT NOT NULL,
  topic_label TEXT, topics TEXT, tags TEXT, time_low INTEGER, time_high INTEGER,
  parsed_json TEXT NOT NULL, file_name TEXT, file_hash TEXT, parse_status TEXT,
  missing_file INTEGER DEFAULT 0, ingested_at TEXT
);
CREATE TABLE IF NOT EXISTS lab_state (
  slug TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'not_started',
  started_at TEXT, completed_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS step_progress (
  slug TEXT NOT NULL, step_index INTEGER NOT NULL, text_hash TEXT, checked INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT, PRIMARY KEY (slug, step_index)
);
CREATE TABLE IF NOT EXISTS journals (
  slug TEXT PRIMARY KEY, body_md TEXT, time_taken_min INTEGER,
  difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  confidence INTEGER CHECK(confidence BETWEEN 1 AND 5), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, file_name TEXT NOT NULL, mime TEXT NOT NULL,
  bytes INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, slug TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_day ON activity(day);
`;
