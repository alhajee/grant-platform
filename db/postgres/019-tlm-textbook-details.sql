BEGIN;
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS textbook_classes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS textbook_subject TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_textbook_classes_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_textbook_classes_check CHECK (
  textbook_classes <@ ARRAY['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JSS 1','JSS 2','JSS 3']::TEXT[]
);
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_textbook_subject_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_textbook_subject_check CHECK (
  textbook_subject IN ('','English/literacy (Core)','Mathematics/Numeracy (Core)','Basic Science (Core)','Social Studies','Nigerian languages (one local language textbook)','Physical and Health Education','History')
);
COMMIT;
