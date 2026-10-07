-- Every level a school offers (lib/dnemis-sync.ts), shown and filtered on the School register. `level` stays the
-- school's main level (plans and models use it); levels_offered adds the rest, e.g. ECCDE for a primary school with a
-- pre-primary section, SSS for a "Junior and Senior Secondary" school, or JSS for a primary school whose JSS section
-- is a separate DNEMIS record with the same name in the same ward. Empty for schools added by hand: the register
-- then shows `level` alone. The next DNEMIS sync refreshes it from the census answers.
BEGIN;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS levels_offered TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_levels_offered_check;
ALTER TABLE schools ADD CONSTRAINT schools_levels_offered_check CHECK (levels_offered <@ ARRAY['ECCDE', 'Primary', 'JSS', 'SSS']::text[]);

-- Backfill DNEMIS schools from their main level, the classes with learners and same-name records in the same ward.
WITH own AS (
  SELECT id, state_code, lower(name) AS name_key, lga, ward, unnest(ARRAY_REMOVE(ARRAY[level,
      CASE WHEN enrolment_by_class ? 'ECCDE' THEN 'ECCDE' END,
      CASE WHEN enrolment_by_class ?| ARRAY['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] THEN 'Primary' END,
      CASE WHEN enrolment_by_class ?| ARRAY['JSS1', 'JSS2', 'JSS3'] THEN 'JSS' END], NULL)) AS level
  FROM schools WHERE dnemis_id IS NOT NULL AND level IN ('ECCDE', 'Primary', 'JSS', 'SSS')
), grouped AS (
  SELECT state_code, name_key, lga, ward, ARRAY_AGG(DISTINCT level ORDER BY level) AS levels FROM own GROUP BY 1, 2, 3, 4
), merged AS (
  SELECT DISTINCT own.id, ARRAY(SELECT l FROM unnest(ARRAY['ECCDE', 'Primary', 'JSS', 'SSS']) WITH ORDINALITY AS o(l, n)
    WHERE l = ANY(grouped.levels) ORDER BY n) AS levels
  FROM own JOIN grouped USING (state_code, name_key, lga, ward)
)
UPDATE schools s SET levels_offered = merged.levels FROM merged
WHERE s.id = merged.id AND s.levels_offered IS DISTINCT FROM merged.levels;

COMMIT;
