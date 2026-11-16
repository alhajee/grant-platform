-- UBEC260: notifications reach people outside the open tab, as web push (installable app) and, for changes
-- requested and approvals, email. The worker delivers each bell notification once (delivered_at).

ALTER TABLE plan_notifications ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
-- Everything already in the bell counts as delivered, so nobody gets a burst of old alerts.
UPDATE plan_notifications SET delivered_at = created_at WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS plan_notifications_undelivered_idx ON plan_notifications (id) WHERE delivered_at IS NULL;

-- One row per browser/device that turned alerts on.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%' AND length(endpoint) <= 1000),
  p256dh TEXT NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 200),
  auth TEXT NOT NULL CHECK (length(auth) BETWEEN 1 AND 100),
  user_agent TEXT NOT NULL DEFAULT '' CHECK (length(user_agent) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

-- The VAPID key pair, made on first use; the private key is sealed with AUTH_SECRET (lib/secret-box.ts).
CREATE TABLE IF NOT EXISTS push_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  public_key TEXT NOT NULL,
  private_key_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
