-- Full use of allocations (UBEC79, client 26 October 2026: "all must be exhausted both ways"). While on, a component is
-- sent (to the Director, the BEAP Chair, the Executive Chairman or UBEC) only once its items use its whole allocation and
-- every activity share, Sports section and Sports Competitions sub-activity inside it is used in full (lib/allocation-use.ts).
-- Super Admin, platform-wide (Admin > Settings > Full use of allocations); on by default.
ALTER TABLE state_workflow_settings ADD COLUMN IF NOT EXISTS full_allocation_required BOOLEAN NOT NULL DEFAULT TRUE;
