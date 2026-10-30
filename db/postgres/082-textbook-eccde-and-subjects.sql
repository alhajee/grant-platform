-- Textbooks (TLM activity 5), bug round 10 (30 October 2026): ECCDE joins the classes (UBEC206), and a subject that is
-- not listed can be typed through "Others (specify)" (UBEC207), so the subject is now any name up to 100 characters.
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_textbook_classes_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_textbook_classes_check CHECK (
  textbook_classes <@ ARRAY['ECCDE','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JSS 1','JSS 2','JSS 3']::TEXT[]
);
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_textbook_subject_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_textbook_subject_check CHECK (
  textbook_subject = btrim(textbook_subject) AND char_length(textbook_subject) <= 100
);
