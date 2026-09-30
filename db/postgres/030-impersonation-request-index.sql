BEGIN;

-- The admin Activity log counts and pages write attempts per impersonation session.
CREATE INDEX IF NOT EXISTS impersonation_requests_session_time_idx ON impersonation_requests (impersonation_id, requested_at DESC);

COMMIT;
