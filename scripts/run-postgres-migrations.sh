#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

for migration in /migrations/[0-9][0-9][0-9]-*.sql; do
  name="$(basename "$migration")"
  applied="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM schema_migrations WHERE name='$name'")"
  if [ "$applied" = "1" ]; then
    echo "Already applied: $name"
    continue
  fi

  echo "Applying: $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations(name) VALUES ('$name')"
done

echo "Database migrations are current."
