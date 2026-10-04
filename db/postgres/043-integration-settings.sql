-- Admin-configured connections to external systems (first: DNEMIS, a DHIS2 server).
-- The access token is stored only as AES-256-GCM ciphertext (lib/secret-box.ts); token_last4 is for display.
-- Note: updated_by references users, so a `TRUNCATE users CASCADE` also empties this table (see CLAUDE.md).
CREATE TABLE IF NOT EXISTS integration_settings (
  provider TEXT PRIMARY KEY CHECK (provider IN ('dnemis')),
  base_url TEXT NOT NULL,
  token_ciphertext TEXT,
  token_last4 TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  last_test_message TEXT,
  CONSTRAINT integration_settings_token_pair CHECK ((token_ciphertext IS NULL) = (token_last4 IS NULL)),
  CONSTRAINT integration_settings_ciphertext_format CHECK (token_ciphertext IS NULL OR token_ciphertext LIKE 'v1:%')
);
