-- Quality Assurance equipment type, ICT website type and ICT subscription types are suggestions: "Others (specify)"
-- lets the user type one that is not listed (lib/activity-extras.ts, components/activity-line-extras.tsx). The fixed
-- value lists from migration 038 become length and shape checks. Additive and idempotent: no line is changed.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_equipment_type_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_equipment_type_check
  CHECK (equipment_type = btrim(equipment_type) AND char_length(equipment_type) <= 100);
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_website_type_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_website_type_check
  CHECK (website_type = btrim(website_type) AND char_length(website_type) <= 100);
-- At most the six listed subscriptions plus one typed; no blank entries.
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_subscription_types_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_subscription_types_check
  CHECK (cardinality(subscription_types) <= 7 AND array_position(subscription_types, '') IS NULL);

COMMIT;
