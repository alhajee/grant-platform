-- New Construction: "Land required for this model is available" takes its own upload (client, October 2026), beside the
-- C of O / R of O / Community Agreement: kind 'land_area'. Additive and idempotent.
BEGIN;

ALTER TABLE infrastructure_documents DROP CONSTRAINT IF EXISTS infrastructure_documents_kind_check;
ALTER TABLE infrastructure_documents ADD CONSTRAINT infrastructure_documents_kind_check
  CHECK (kind IN ('drawings', 'boq', 'survey', 'land', 'land_area', 'photo', 'supporting'));

COMMIT;
