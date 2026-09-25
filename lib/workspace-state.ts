import type { NextRequest } from "next/server";
import { getLocalSessionUser } from "@/lib/local-session";
import { getPostgres } from "@/lib/postgres";

// Simple-query literals are used in the local Workers PostgreSQL adapter.
export function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function getWorkspaceState(request: NextRequest) {
  let user;
  try { user = await getLocalSessionUser(request); } catch { return null; }
  if (!user) return null;
  const { rows } = await getPostgres().query<{ stateCode: string; role: string; name: string; userId: number; department: string | null; canCreatePlan: boolean; isBeapChair: boolean }>(
    `SELECT id AS "userId", full_name AS name, role, department, can_create_plan AS "canCreatePlan", is_beap_chair AS "isBeapChair", state_code AS "stateCode" FROM users WHERE email = $1 AND active AND session_version = $2`, [user.email, user.sessionVersion ?? 0],
  );
  return rows[0] ? { ...rows[0], email: user.email, sessionVersion: user.sessionVersion ?? 0 } : null;
}

export const constructionTypeFields = `id, name, classrooms, playrooms_labs AS "playroomsLabs", libraries, toilets,
  offices_stores AS "officesStores", duration, unit_cost::float8 AS "unitCost"`;
