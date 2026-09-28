import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const db = new Client({ connectionString: process.env.DATABASE_URL });
const state = `MD${Date.now()}`;
const passwordHash = hashSync(randomUUID(), 4);
const all = ['physical', 'academic', 'me', 'teachers', 'ict', 'social', 'planning'];

await db.connect();
try {
  await db.query('BEGIN');
  const add = async (key, role, departments, isBeapChair = false) => {
    const result = await db.query(
      'INSERT INTO users(full_name,email,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [`QA ${key}`, `${key}.${state.toLowerCase()}@test.local`, role, departments[0] ?? null, state, passwordHash, isBeapChair],
    );
    if (departments.length) await db.query('INSERT INTO user_departments(user_id,department) SELECT $1,unnest($2::text[])', [result.rows[0].id, departments]);
    return result.rows[0].id;
  };
  const officer = await add('officer', 'Data Entry Staff', all);
  const director = await add('director', 'Director', ['academic', ...all.filter(value => value !== 'academic')]);
  const chair = await add('chair', 'Director', ['physical'], true);
  const executive = await add('executive', 'Executive Chairman', []);

  for (const id of [officer, director]) {
    const assigned = (await db.query('SELECT department FROM user_departments WHERE user_id=$1 ORDER BY department', [id])).rows.map(row => row.department);
    assert.deepEqual(assigned, [...all].sort());
  }
  assert.deepEqual((await db.query('SELECT department FROM user_departments WHERE user_id=$1', [chair])).rows.map(row => row.department), ['physical']);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM user_departments WHERE user_id=$1', [executive])).rows[0].count, 0);

  const physicalReviewers = (await db.query("SELECT DISTINCT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND u.active AND u.role='Director' AND NOT u.is_beap_chair AND ud.department='physical'", [state])).rows;
  assert.deepEqual(physicalReviewers.map(row => row.id), [director], 'the BEAP Chair must not duplicate the department Director review recipient');
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM users WHERE state_code=$1 AND is_beap_chair", [state])).rows[0].count, 1);

  const overlap = await db.query("SELECT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND ud.department=ANY($2::text[]) AND u.role='Director' AND NOT u.is_beap_chair AND u.active LIMIT 1", [state, ['ict', 'planning']]);
  assert.equal(overlap.rows[0].id, director, 'overlapping non-chair Directors must be detected');
  console.log('PASS: all-department access, dedicated BEAP Chair, Executive Chairman, recipient routing, and Director overlap detection.');
  await db.query('ROLLBACK');
} catch (error) {
  await db.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
