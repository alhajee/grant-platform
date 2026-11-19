-- Platform rules the client changes often (19 November 2026): which documents are required, what holds a send or an
-- approval, the ECCDE share and the approval letter's letterhead and signature. Super Admin, platform-wide (Admin >
-- Settings > Requirements and Approval letter; lib/platform-rules.ts). Keys missing from the JSON keep their defaults,
-- which are the rules as they were before this migration, except the Validation Report, now optional by default.
ALTER TABLE state_workflow_settings ADD COLUMN IF NOT EXISTS platform_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The approval letter's background (A4 letterhead, JPEG or PNG) and signature: every upload is kept, the newest per kind
-- (not removed) is in force, and each letter keeps the images in force when it was approved (NULL = the built-in ones),
-- so a new signatory never changes letters already issued.
CREATE TABLE IF NOT EXISTS letter_assets (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('letterhead', 'signature')),
  content BYTEA NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  name TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS letter_assets_current ON letter_assets(kind, created_at DESC) WHERE removed_at IS NULL;
ALTER TABLE ubec_approval_letters ADD COLUMN IF NOT EXISTS letterhead_id INTEGER REFERENCES letter_assets(id);
ALTER TABLE ubec_approval_letters ADD COLUMN IF NOT EXISTS signature_id INTEGER REFERENCES letter_assets(id);
