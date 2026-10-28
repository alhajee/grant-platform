-- ICT beneficiaries (UBEC160, client 28 October 2026): "Procurement of Digital/STEM Equipment" (ICT activity 0) lines say
-- who benefits: School, SUBEB or LGA. School lines choose their schools and share the line's quantity across them
-- (activity_line_schools.quantity, the items for that school); SUBEB and LGA lines have no schools.
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS beneficiary TEXT;
DO $$ BEGIN
  ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_beneficiary_check CHECK (
    beneficiary IS NULL OR (beneficiary IN ('school', 'subeb', 'lga') AND workstream = 'ict' AND activity = 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE activity_line_schools ADD COLUMN IF NOT EXISTS quantity INTEGER;
DO $$ BEGIN
  ALTER TABLE activity_line_schools ADD CONSTRAINT activity_line_schools_quantity_check CHECK (quantity IS NULL OR quantity BETWEEN 1 AND 1000000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Lines saved before this chose schools without quantities: they are School lines (quantities stay empty until edited).
UPDATE activity_plan_lines SET beneficiary = 'school' WHERE workstream = 'ict' AND activity = 0 AND beneficiary IS NULL;
