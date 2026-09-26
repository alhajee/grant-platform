BEGIN;
ALTER TABLE infrastructure_documents ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
-- Preserve unassigned uploads; only migrate an unambiguous saved association.
UPDATE infrastructure_documents d SET school_id=x.school_id
FROM (SELECT d.id,MIN(p.school_id) AS school_id
 FROM infrastructure_documents d JOIN infrastructure_packages p ON p.plan_id=d.plan_id AND p.input->'documentIds' @> jsonb_build_array(d.id::text)
 WHERE d.kind<>'drawings' GROUP BY d.id HAVING COUNT(DISTINCT p.school_id)=1) x
WHERE d.id=x.id AND d.school_id IS NULL;
CREATE INDEX IF NOT EXISTS infrastructure_documents_school ON infrastructure_documents(plan_id,school_id);
COMMIT;
