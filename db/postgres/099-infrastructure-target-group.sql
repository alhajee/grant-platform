-- UBEC254 (bug sheet 16 updated, 10 November 2026): Infrastructure packages name one or more target groups, like activity
-- and Sports lines (stored joined, "ECCDE Learners, Primary School Learners"), so Spending by school level and the 15% ECCDE
-- rule can count the parts of a package that are not for the school's main level. Packages saved before keep '' until
-- edited; the save API requires it on new saves and edits. Additive and idempotent.
ALTER TABLE infrastructure_packages ADD COLUMN IF NOT EXISTS target_group TEXT NOT NULL DEFAULT '';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'infrastructure_packages_target_group_check') THEN
    ALTER TABLE infrastructure_packages ADD CONSTRAINT infrastructure_packages_target_group_check CHECK (length(target_group) <= 1000);
  END IF;
END $$;
