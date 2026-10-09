-- Optional supporting documents on every line of the activity components except Greening (GSCCI) (lib/activity-extras.ts,
-- supportingDocumentWorkstreams): SBMC, TLM, Supervision & Monitoring, Curriculum, Quality Assurance, every ICT
-- activity and Planning, in the existing activity_line_documents table. Sports has its own lines and takes none.
-- They never block saving or sending, whatever the Supporting documents setting (migration 052).
-- Additive and idempotent: only the component CHECK widens.
BEGIN;

ALTER TABLE activity_line_documents DROP CONSTRAINT IF EXISTS activity_line_documents_component_check;
ALTER TABLE activity_line_documents ADD CONSTRAINT activity_line_documents_component_check
  CHECK (component IN ('sbmc', 'tlm', 'monitoring', 'curriculum', 'quality', 'ict', 'teachers', 'planning'));

COMMIT;
