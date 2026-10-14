-- TLM items take two named documents (client request, October 2026, lib/activity-extras.ts lineDocumentSlots): a BOQ
-- and a sample of the quantity. activity_line_documents.kind names which one a file is; every other document is
-- 'document' (ICT, Teacher Development and the optional supporting documents). Required at send steps only while the
-- Supporting documents setting is on (migration 052). Earlier TLM supporting documents keep 'document' and stay
-- listed. Additive and idempotent.
BEGIN;

ALTER TABLE activity_line_documents ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'document';
ALTER TABLE activity_line_documents DROP CONSTRAINT IF EXISTS activity_line_documents_kind_check;
ALTER TABLE activity_line_documents ADD CONSTRAINT activity_line_documents_kind_check
  CHECK (kind = 'document' OR (component = 'tlm' AND kind IN ('boq', 'sample')));

COMMIT;
