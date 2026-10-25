-- Procurement price list (UBEC130 part 2, client 25 October 2026). Each state's SUBEB Procurement department keeps its
-- own list of items with prices: Procurement Data Entry adds or edits items (pending), the Procurement Director approves
-- them (and may add or edit items directly, approved). Data Entry of the components picks an approved item on the
-- activities that buy goods (lib/procurement.ts): the unit cost is the list price and cannot be typed. A saved line
-- keeps its price when the list changes later. Whether those activities must use the list is a platform-wide Super
-- Admin switch (state_workflow_settings.price_list_required, default off until states have their lists).
BEGIN;
CREATE TABLE IF NOT EXISTS procurement_items (
  id SERIAL PRIMARY KEY,
  state_code TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  maker TEXT NOT NULL DEFAULT '' CHECK (length(maker) <= 120),
  model_year INTEGER CHECK (model_year IS NULL OR model_year BETWEEN 1950 AND 2100),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'archived')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  updated_by_name TEXT NOT NULL,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS procurement_items_state ON procurement_items(state_code, status, name);
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS price_item_id INTEGER REFERENCES procurement_items(id) ON DELETE SET NULL;
ALTER TABLE state_workflow_settings ADD COLUMN IF NOT EXISTS price_list_required BOOLEAN NOT NULL DEFAULT FALSE;
COMMIT;
