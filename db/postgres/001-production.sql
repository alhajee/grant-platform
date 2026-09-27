CREATE TABLE schools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lga TEXT NOT NULL,
  level TEXT NOT NULL,
  town TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL CHECK (location IN ('Rural', 'Urban')),
  UNIQUE (name, lga, level)
);

CREATE TABLE infrastructure_lines (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  project_type TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  rationale TEXT NOT NULL DEFAULT '',
  strategy TEXT NOT NULL,
  longitude TEXT NOT NULL DEFAULT '',
  latitude TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_infrastructure_lines_school_id ON infrastructure_lines(school_id);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Data Entry Officer', 'Reviewer', 'Executive Secretary')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

