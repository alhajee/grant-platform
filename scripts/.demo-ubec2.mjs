import { Client } from 'pg';
const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const depts = { infrastructure: 'physical', monitoring: 'physical', planning: 'planning', sports: 'academic', tlm: 'academic', curriculum: 'academic', gscci: 'academic', teachers: 'teachers', ict: 'digital', quality: 'quality', sbmc: 'social' };
const rounds = (await db.query("SELECT r.id, r.plan_id, r.status, r.snapshot, r.submitted_at, r.released_at, r.decided_at, p.state_code FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id WHERE p.beap_name LIKE 'DEMO-%'")).rows;
const chair = (await db.query("SELECT id, full_name FROM users WHERE role='UBEC BEAP Chair' LIMIT 1")).rows[0];
let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
for (const r of rounds) {
  const ec = (await db.query("SELECT id, full_name FROM users WHERE state_code=$1 AND role='Executive Chairman' LIMIT 1", [r.state_code])).rows[0];
  await db.query("INSERT INTO ubec_events(round_id,plan_id,action,actor,actor_id,created_at) VALUES($1,$2,'submit',$3,$4,$5)", [r.id, r.plan_id, ec.full_name, ec.id, r.submitted_at]);
  if (r.status === 'received') continue;
  await db.query("INSERT INTO ubec_events(round_id,plan_id,action,actor,actor_id,comment,created_at) VALUES($1,$2,'release',$3,$4,'Released for assessment',$5)", [r.id, r.plan_id, chair.full_name, chair.id, r.released_at]);
  const pillars = Object.keys(depts).filter(p => Array.isArray(r.snapshot[p]) && r.snapshot[p].length);
  for (const p of pillars) {
    const stage = r.status === 'reviewing' ? (['director', 'director', 'oversight', 'chair'][Math.floor(rnd() * 4)]) : 'chair';
    const sent = stage === 'director' ? null : new Date(+r.released_at + 3 * 864e5), arrived = stage === 'chair' ? new Date(+r.released_at + 6 * 864e5) : null;
    await db.query("INSERT INTO ubec_round_components(round_id,pillar,department,stage,sent_to_oversight_at,arrived_at,released_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [r.id, p, depts[p], stage, sent, arrived, r.released_at]);
    if (sent) await db.query("INSERT INTO ubec_events(round_id,plan_id,action,actor,actor_id,created_at,pillar) VALUES($1,$2,'send_oversight','UBEC Director',$3,$4,$5)", [r.id, r.plan_id, chair.id, sent, p]);
  }
  if (r.decided_at) await db.query("INSERT INTO ubec_events(round_id,plan_id,action,actor,actor_id,comment,created_at) VALUES($1,$2,$3,$4,$5,'Decision recorded',$6)", [r.id, r.plan_id, r.status === 'approved' ? 'approve' : 'return', chair.full_name, chair.id, r.decided_at]);
}
console.log('rounds', rounds.length); await db.end();
