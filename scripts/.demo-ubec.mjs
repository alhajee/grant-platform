// Local demo data for the UBEC dashboard: copies the Yobe submission to other states with varied budgets,
// components and stages. Marked with beap_name 'DEMO-…'. `node --env-file=.env scripts/.demo-ubec.mjs up|down`
import { Client } from 'pg';
const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
if (!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('local only');
if (process.argv[2] === 'down') {
  const r = await db.query("DELETE FROM action_plans WHERE beap_name LIKE 'DEMO-%'"); console.log('removed', r.rowCount); await db.end(); process.exit(0);
}
const base = (await db.query('SELECT r.snapshot, p.funding_policy_id FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id WHERE r.plan_id=315')).rows[0];
const money = new Set(['unit_cost', 'unitCost', 'total_cost', 'totalCost', 'amount', 'cost', 'subtotal']);
const scale = (v, f) => Array.isArray(v) ? v.map(x => scale(x, f)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, money.has(k) && x != null && !isNaN(Number(x)) ? (typeof x === 'number' ? Math.round(x * f * 100) / 100 : (Number(x) * f).toFixed(2)) : scale(x, f)])) : v;
const states = ['KN','LA','KD','OY','RI','BO','EN','AN','PL','BA','SO','OG','ED','IM','KT','ZA','GO','AD','NI','BE','FC','KW','CR','JI'];
const stages = ['received','reviewing','reviewing','returned','approved','approved','reviewing','received'];
const optional = ['sports','ict','planning','gscci','curriculum','monitoring','sbmc'];
let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
for (const [i, st] of states.entries()) {
  const ec = (await db.query("SELECT id FROM users WHERE state_code=$1 AND role='Executive Chairman' LIMIT 1", [st])).rows[0]; if (!ec) continue;
  const f = .25 + rnd() * 2.6, snap = scale(base.snapshot, f);
  for (const k of optional) if (rnd() < .35 && Array.isArray(snap[k])) snap[k] = [];
  const status = stages[i % stages.length], days = Math.floor(rnd() * 150) + 3;
  const planStatus = status === 'approved' ? 'ubec_approved' : status === 'returned' ? 'changes_requested' : status === 'reviewing' ? 'ubec_review' : 'submitted_ubec';
  const plan = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,status,submission_number,funding_policy_id,beap_name) VALUES($1,2026,2026,2026,'{1,2,3,4}',$2,1,$3,$4) RETURNING id", [st, planStatus, base.funding_policy_id, `DEMO-${st}`])).rows[0].id;
  const at = new Date(Date.now() - days * 864e5);
  await db.query("INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,status,submitted_by,submitted_at,released_at,decided_at,decision) VALUES($1,1,1,$2,$3,$4,$5,$6,$7,$8)",
    [plan, JSON.stringify(snap), status, ec.id, at, status === 'received' ? null : new Date(+at + 2 * 864e5), ['returned','approved'].includes(status) ? new Date(+at + 9 * 864e5) : null, ['returned','approved'].includes(status) ? (status === 'approved' ? 'Approved' : 'Revise the infrastructure quantities') : '']);
  console.log(st, status, f.toFixed(2));
}
await db.end();
