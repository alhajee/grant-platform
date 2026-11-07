-- UBEC244 (bug sheet 18, 7 November 2026): "The Data entry and director of Procurement Dept SUBEB should be able to
-- enter things to be procured, so others can pick also anything to be procured". The Procurement price list
-- (migration 074) is now offered on every activity line (except Teacher Development trainings) and on the Sports
-- procurement items. A Sports line picked from the list records its item, like activity lines do; the unit cost is the
-- list price when picked and the line keeps it when the list changes later. Additive and idempotent.
BEGIN;
ALTER TABLE sports_budget_lines ADD COLUMN IF NOT EXISTS price_item_id INTEGER REFERENCES procurement_items(id) ON DELETE SET NULL;
COMMIT;
