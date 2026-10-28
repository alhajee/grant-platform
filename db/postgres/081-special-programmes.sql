-- Special Programmes (UBEC183/169, 28 October 2026): a fourth UBEC Oversight Department beside Audit, Procurement and
-- Finance (an Oversight Director and Assessment Officers who comment on items), and a SUBEB support department with a
-- Director and Data Entry Officer. Department ids are 'special' on both sides (users.department and user_departments
-- hold free text; only the oversight tables below restrict the department).
ALTER TABLE ubec_oversight_reviews DROP CONSTRAINT IF EXISTS ubec_oversight_reviews_department_check;
ALTER TABLE ubec_oversight_reviews ADD CONSTRAINT ubec_oversight_reviews_department_check CHECK (department IN ('audit', 'procurement', 'finance', 'special'));
ALTER TABLE ubec_oversight_assignments DROP CONSTRAINT IF EXISTS ubec_oversight_assignments_department_check;
ALTER TABLE ubec_oversight_assignments ADD CONSTRAINT ubec_oversight_assignments_department_check CHECK (department IN ('audit', 'procurement', 'finance', 'special'));
ALTER TABLE plan_observation_departments DROP CONSTRAINT IF EXISTS plan_observation_departments_department_check;
ALTER TABLE plan_observation_departments ADD CONSTRAINT plan_observation_departments_department_check CHECK (department IN ('audit', 'procurement', 'finance', 'special'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_observation_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_observation_check
  CHECK ((scope = 'observation') = (observation_department IS NOT NULL) AND (observation_department IS NULL OR observation_department IN ('audit', 'procurement', 'finance', 'special')));
