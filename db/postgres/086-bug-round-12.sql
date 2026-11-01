-- Bug round 12 (bug sheet (13), 1 November 2026): UBEC187, UBEC210, UBEC209.
-- UBEC187: an Oversight Department's Assessment Officer finishes their own observations on a component ("Observations
-- done"). The Oversight Director does not wait for them; once the Director has finished, the officer has nothing left to do.
ALTER TABLE ubec_oversight_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE ubec_oversight_assignments ADD COLUMN IF NOT EXISTS completion_note TEXT NOT NULL DEFAULT '';
-- UBEC210: an observation's author may correct its text while their department is still observing; edited_at records it.
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
-- UBEC209: Teacher Development lines take a Budget Breakdown and a Training List of Participants as their own uploads.
ALTER TABLE activity_line_documents DROP CONSTRAINT IF EXISTS activity_line_documents_kind_check;
ALTER TABLE activity_line_documents ADD CONSTRAINT activity_line_documents_kind_check
  CHECK (kind = 'document' OR (component = 'tlm' AND kind IN ('boq', 'sample')) OR (component = 'teachers' AND kind IN ('budget', 'participants')));
