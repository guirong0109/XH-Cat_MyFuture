-- D1 schema (spec §10). Run by migrate(); every statement is safe to run again.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_user ON profiles(user_id);
CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('hr','centre')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_groups (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, target_code TEXT, UNIQUE (org_id, name));
CREATE TABLE IF NOT EXISTS org_people (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES org_groups(id), display_name TEXT NOT NULL, current_code TEXT,
  source TEXT NOT NULL CHECK (source IN ('roster','shared')), user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL, UNIQUE (org_id, user_id));
CREATE TABLE IF NOT EXISTS org_skills (person_id TEXT NOT NULL REFERENCES org_people(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('basic','good','expert','not_assessed')), PRIMARY KEY (person_id, item_key));
CREATE TABLE IF NOT EXISTS org_invites (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE, current_code TEXT, token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS org_plan_steps (org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE, role_code TEXT NOT NULL, item_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','in_progress','done')), updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, role_code, item_key));
