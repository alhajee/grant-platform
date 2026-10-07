import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

// Local-only test accounts. Never modifies an existing account or creates plans.
const connectionString = process.env.DATABASE_URL;
if (!connectionString || !['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)) throw new Error('A localhost DATABASE_URL is required.');
const db = new Client({connectionString});
// UBEC review flow (migration 055): a Director and an Assessment Officer per component department, Oversight Directors, the BEAP Chair and the ES.
const departments = ['physical','planning','academic','teachers','digital','quality','social'];
await db.connect();
try {
  const password = randomBytes(18).toString('base64url');
  const passwordHash = hashSync(password,12);
  const accounts = [{email:'ubec.es@demo.local',name:'UBEC Executive Secretary',role:'UBEC Executive Secretary',department:null},{email:'ubec.chair@demo.local',name:'UBEC BEAP Chair',role:'UBEC BEAP Chair',department:null},
    ...departments.flatMap(department=>[{email:`ubec.director.${department}@demo.local`,name:`UBEC ${department} Director`,role:'UBEC Director',department},{email:`ubec.${department}@demo.local`,name:`UBEC ${department} Assessment Officer`,role:'UBEC Assessment Officer',department}]),
    ...['audit','procurement','finance'].map(department=>({email:`ubec.${department}@demo.local`,name:`UBEC Director ${department}`,role:'UBEC Oversight Director',department}))];
  const created=[];
  for (const account of accounts) {
    const result = await db.query('INSERT INTO users(email,full_name,role,state_code,department,password_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING RETURNING email', [account.email,account.name,account.role,'UBEC',account.department,passwordHash]);
    if (result.rowCount) created.push(account.email);
  }
  if (created.length) console.log(JSON.stringify({created,password},null,2));
  else console.log('Demo accounts already exist. Their passwords were not changed.');
} finally { await db.end(); }
