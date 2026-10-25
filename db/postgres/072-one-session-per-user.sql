-- One signed-in device per account (UBEC115, client 25 October 2026): each sign-in stores a new session id here and in
-- the sign-in cookie; a cookie with another id is refused, so the newest sign-in wins and the older device is signed
-- out (it shows "Signed in on another device" and keeps its unsaved work until the user signs in again there).
-- NULL (no sign-in since this migration) accepts any cookie of the current session_version.
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_session_id UUID;
