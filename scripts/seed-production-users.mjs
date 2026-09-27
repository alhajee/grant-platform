import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { hashSync } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
const superAdminEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || "admin@ubec.test").trim().toLowerCase();
const superAdminName = process.env.SEED_SUPER_ADMIN_NAME?.trim() || "UBEC Super Administrator";
const sharedPassword = process.env.SEED_SHARED_PASSWORD?.trim();

if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!superAdminEmail || !/^\S+@\S+\.\S+$/.test(superAdminEmail)) {
  throw new Error("SEED_SUPER_ADMIN_EMAIL must be a valid email address.");
}

const units = [
  ["physical", "Physical Planning"],
  ["academic", "Academic Services"],
  ["me", "Monitoring & Evaluation"],
  ["teachers", "Teacher Development"],
  ["ict", "ICT"],
  ["social", "Social Mobilisation"],
  ["planning", "Planning, Research & Statistics"],
];

const accounts = [
  { email: superAdminEmail, name: superAdminName, role: "Super Admin", state: "ADMIN", department: null },
  { email: "executive.secretary@ubec.test", name: "UBEC Executive Secretary", role: "UBEC Executive Secretary", state: "UBEC", department: null },
  ...units.map(([department, name]) => ({
    email: `${department}.reviewer@ubec.test`,
    name: `${name} Reviewer`,
    role: "UBEC Department Reviewer",
    state: "UBEC",
    department,
  })),
  { email: "executive.chairman@yobe.ubec.test", name: "Yobe SUBEB Executive Chairman", role: "Executive Chairman", state: "YO", department: null },
  ...units.flatMap(([department, name]) => [
    {
      email: `${department}.director@yobe.ubec.test`,
      name: `Director, ${name}`,
      role: "Director",
      state: "YO",
      department,
      isBeapChair: department === "physical",
      canCreatePlan: department === "planning",
    },
    {
      email: `${department}.officer@yobe.ubec.test`,
      name: `${name} Desk Officer`,
      role: "Data Entry Staff",
      state: "YO",
      department,
    },
  ]),
];

const credentials = accounts.map(account => ({
  ...account,
  password: sharedPassword || `Ubec-${randomBytes(18).toString("base64url")}!7a`,
}));

const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtext('production-role-seed'))");
  const existing = await db.query("SELECT email FROM users WHERE email=ANY($1::text[])", [credentials.map(item => item.email)]);
  if (existing.rowCount) {
    throw new Error(`Seed accounts already exist (${existing.rows.map(row => row.email).join(", ")}); no changes were made.`);
  }
  for (const account of credentials) {
    await db.query(
      `INSERT INTO users(email,full_name,role,department,state_code,password_hash,active,can_create_plan,is_beap_chair)
       VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8)`,
      [
        account.email,
        account.name,
        account.role,
        account.department,
        account.state,
        hashSync(account.password, 12),
        account.canCreatePlan ?? false,
        account.isBeapChair ?? false,
      ],
    );
  }
  await db.query("COMMIT");
  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), accounts: credentials }, null, 2)}\n`);
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
