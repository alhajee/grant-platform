-- UBEC229 (client, 5 November 2026: "any activity procurement should have an upload proforma invoice"): every item on an
-- activity that buys goods (the Procurement price-list activities) takes a Proforma invoice upload of its own, kind
-- 'proforma', on any component that buys goods (not Teacher Development). Which activities need one is checked in
-- lib/activity-extras.ts (needsProforma); the database checks only the kind per component. Additive and idempotent.
ALTER TABLE activity_line_documents DROP CONSTRAINT IF EXISTS activity_line_documents_kind_check;
ALTER TABLE activity_line_documents ADD CONSTRAINT activity_line_documents_kind_check
  CHECK (kind = 'document'
    OR (component = 'tlm' AND kind IN ('boq', 'sample'))
    OR (component = 'teachers' AND kind IN ('budget', 'participants'))
    OR (component IN ('sbmc', 'tlm', 'monitoring', 'curriculum', 'quality', 'ict', 'planning') AND kind = 'proforma'));
