-- Self-service password reset (17 October 2026). A request stores only the SHA-256 hash of a one-time token that is
-- emailed to the user; the token works once, within an hour. Requests are counted for rate limiting and kept briefly.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_tokens_ip ON password_reset_tokens(requested_ip, created_at DESC);
