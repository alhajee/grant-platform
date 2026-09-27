import { Client } from "pg";
import { hashSync } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
const email = process.env.PROVISION_EMAIL?.trim().toLowerCase();
const name = process.env.PROVISION_NAME?.trim();
const password = process.env.PROVISION_PASSWORD ?? "";
const role = process.env.PROVISION_ROLE?.trim();
const stateCode = process.env.PROVISION_STATE_CODE?.trim().toUpperCase();
const allowedRoles = new Set(["Super Admin", "Executive Chairman", "UBEC Executive Secretary"]);

if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("PROVISION_EMAIL must be a valid email address.");
if (!name || name.length < 2 || name.length > 120) throw new Error("PROVISION_NAME must contain 2–120 characters.");
if (!allowedRoles.has(role)) throw new Error("PROVISION_ROLE must be Super Admin, Executive Chairman, or UBEC Executive Secretary.");
if (password.length < 16 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
  throw new Error("PROVISION_PASSWORD must be at least 16 characters and include upper-case, lower-case, numeric, and symbol characters.");
}
if (role === "Executive Chairman" && (!stateCode || !/^[A-Z0-9_-]{2,12}$/.test(stateCode))) {
  throw new Error("PROVISION_STATE_CODE is required for an Executive Chairman.");
}

const effectiveState = role === "Super Admin" ? "ADMIN" : role === "UBEC Executive Secretary" ? "UBEC" : stateCode;
const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(hashtext('production-user-provisioning'))");
  const duplicate = await db.query("SELECT 1 FROM users WHERE email=$1", [email]);
  if (duplicate.rowCount) throw new Error("An account already uses this email address; no changes were made.");
  await db.query(
    "INSERT INTO users(email,full_name,role,state_code,password_hash,active) VALUES($1,$2,$3,$4,$5,TRUE)",
    [email, name, role, effectiveState, hashSync(password, 12)],
  );
  await db.query("COMMIT");
  console.log(`Created ${role} account for ${email}.`);
} catch (error) {
  await db.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
