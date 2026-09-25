import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

// Local-only test accounts. Never modifies an existing account or creates plans.
const connectionString = process.env.DATABASE_URL;
if (!connectionString || !['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)) throw new Error('A localhost DATABASE_URL is required.');
const db = new Client({connectionString});
const departments = ['academic','administration','physical','planning','special','teachers','finance','audit','quality','social','zonal'];
await db.connect();
try {
  const password = randomBytes(18).toString('base64url');
  const passwordHash = hashSync(password,12);
  const accounts = [{email:'ubec.es@demo.local',name:'UBEC Executive Secretary',department:null}, ...departments.map(department=>({email:`ubec.${department}@demo.local`,name:`UBEC ${department} reviewer`,department}))];
  const created=[];
  for (const account of accounts) {
    const result = await db.query('INSERT INTO users(email,full_name,role,state_code,department,password_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING RETURNING email', [account.email,account.name,account.department?'UBEC Department Reviewer':'UBEC Executive Secretary','UBEC',account.department,passwordHash]);
    if (result.rowCount) created.push(account.email);
  }
  if (created.length) console.log(JSON.stringify({created,password},null,2));
  else console.log('Demo accounts already exist. Their passwords were not changed.');
} finally { await db.end(); }
