-- Earlier plans kept one shared "other funding" amount on action_plans.other_funding. It works exactly like a
-- plan-wide funding source, so each one becomes an 'all' source (funder "Earlier other funding") and the
-- column is zeroed. Totals and component ceilings are unchanged. Idempotent: only non-zero amounts move.
BEGIN;

INSERT INTO plan_funding_sources(plan_id, component, funder, amount)
SELECT id, 'all', 'Earlier other funding', other_funding FROM action_plans WHERE other_funding > 0;

UPDATE action_plans SET other_funding = 0 WHERE other_funding > 0;

COMMIT;
