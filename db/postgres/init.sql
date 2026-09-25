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

-- Provision local demo users explicitly after migrations. Never ship password hashes.

INSERT INTO schools (name, lga, level, location) VALUES
  ('Musa Kazir MEGA School Gashua', 'Bade', 'Primary', 'Urban'),
  ('Nasarawa PS', 'Damaturu', 'Primary', 'Urban'),
  ('Daya PS', 'Fika', 'Primary', 'Urban'),
  ('Helma Saleh PS', 'Potiskum', 'Primary', 'Urban'),
  ('Madamuwa PS', 'Bade', 'Primary', 'Rural'),
  ('Daskum PS', 'Bursari', 'Primary', 'Rural'),
  ('Zanna Zakariya', 'Damaturu', 'ECCDE', 'Urban'),
  ('Ben-Kalio', 'Damaturu', 'ECCDE', 'Urban'),
  ('Borno Kichi PS', 'Fune', 'Primary', 'Rural'),
  ('Nyole PS', 'Fune', 'Primary', 'Rural'),
  ('Gubana PS', 'Fune', 'Primary', 'Rural'),
  ('Dumbulwa', 'Fika', 'ECCDE', 'Urban'),
  ('GDJSS Kelluri', 'Geidam', 'JSS', 'Rural'),
  ('Islamiya', 'Gujba', 'ECCDE', 'Urban'),
  ('Kasatchiya PS', 'Gujba', 'Primary', 'Rural'),
  ('Daddawel PS', 'Gujba', 'Primary', 'Rural'),
  ('Jama''are PS', 'Gujba', 'Primary', 'Rural'),
  ('Manawaji PS', 'Gulani', 'Primary', 'Rural'),
  ('Guzumbana PS', 'Jakusko', 'Primary', 'Rural'),
  ('Makadari Nomadic', 'Karasuwa', 'Primary', 'Rural'),
  ('Kalgidi PS', 'Machina', 'Primary', 'Rural'),
  ('Lemari PS', 'Nangere', 'Primary', 'Rural'),
  ('Goni Musa Goni Yusuf Islamiya PS', 'Nguru', 'Primary', 'Urban'),
  ('Afunori PS', 'Nguru', 'Primary', 'Rural'),
  ('Nurul-Aulad Islamiya PS', 'Nguru', 'Primary', 'Urban'),
  ('Yindiski', 'Potiskum', 'ECCDE', 'Urban'),
  ('GDJSS Babbangida', 'Tarmuwa', 'JSS', 'Urban'),
  ('GDJSS Toshia', 'Yunusari', 'JSS', 'Rural'),
  ('GDJSS Yusufari Model', 'Yusufari', 'JSS', 'Urban');

INSERT INTO infrastructure_lines (school_id, code, project_type, quantity, rationale, strategy, longitude, latitude)
SELECT id, 'UBC/SUBEB/NC/001/2025', 'six-classrooms', 1, 'Overcrowded classrooms', 'NCB', '11.04', '12.87' FROM schools WHERE name = 'Musa Kazir MEGA School Gashua'
UNION ALL SELECT id, 'UBC/SUBEB/NC/002/2025', 'six-classrooms', 1, 'Overcrowded classrooms', 'NCB', '11.95', '11.76' FROM schools WHERE name = 'Nasarawa PS'
UNION ALL SELECT id, 'UBC/SUBEB/NC/003/2025', 'six-classrooms', 1, 'Overcrowded classrooms', 'NCB', '11.04', '11.54' FROM schools WHERE name = 'Daya PS'
UNION ALL SELECT id, 'UBC/SUBEB/NC/004/2025', 'six-classrooms', 1, 'Overcrowded classrooms', 'NCB', '11.13', '11.71' FROM schools WHERE name = 'Helma Saleh PS';
