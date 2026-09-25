import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Client} from 'pg';
import {hashSync} from 'bcryptjs';
const connectionString=process.env.DATABASE_URL;
if(!connectionString||!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname))throw Error('Only a local database is allowed.');
const db=new Client({connectionString});await db.connect();
try{
 const email='admin@demo.local',password=randomBytes(18).toString('base64url');
 const result=await db.query("INSERT INTO users(email,full_name,role,state_code,password_hash) VALUES($1,'Demo Administrator','Super Admin','ADMIN',$2) ON CONFLICT(email) DO NOTHING RETURNING id",[email,hashSync(password,12)]);
 if(!result.rowCount){console.log('Account already exists; credentials and permissions were not changed.');}
 else{
  const folder=resolve('outputs/local-super-admin');mkdirSync(folder,{recursive:true,mode:0o700});
  const file=resolve(folder,'credentials.txt');writeFileSync(file,`Local demo only\nURL: http://localhost:5174/\nEmail: ${email}\nPassword: ${password}\n`,{mode:0o600,flag:'wx'});
  console.log(`Created ${email}. Private credentials saved to ${file}`);
 }
}finally{await db.end();}
