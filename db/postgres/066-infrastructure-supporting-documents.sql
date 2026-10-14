-- Infrastructure packages take optional supporting documents of their own (client, October 2026), beside the BOQ,
-- survey report, land document and photos: kind 'supporting'. Additive and idempotent.
BEGIN;

ALTER TABLE infrastructure_documents DROP CONSTRAINT IF EXISTS infrastructure_documents_kind_check;
ALTER TABLE infrastructure_documents ADD CONSTRAINT infrastructure_documents_kind_check
  CHECK (kind IN ('drawings', 'boq', 'survey', 'land', 'photo', 'supporting'));

COMMIT;
