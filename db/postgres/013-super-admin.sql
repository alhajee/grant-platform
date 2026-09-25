BEGIN;
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('Data Entry Staff','Director','Executive Chairman','UBEC Executive Secretary','UBEC Department Reviewer','Super Admin'));
CREATE TABLE impersonation_sessions (
  id UUID PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  target_id INTEGER NOT NULL REFERENCES users(id),
  actor_version INTEGER NOT NULL,
  target_version INTEGER NOT NULL,
  session_binding TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  target_role TEXT NOT NULL,
  target_state TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  CHECK(actor_id <> target_id)
);
CREATE INDEX impersonation_actor_idx ON impersonation_sessions(actor_id, started_at DESC);
CREATE TABLE impersonation_requests (
  id BIGSERIAL PRIMARY KEY,
  impersonation_id UUID NOT NULL REFERENCES impersonation_sessions(id),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
