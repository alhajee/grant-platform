import { DepartmentArt } from '@/components/ubec/department-art';

// A badge for every role (client, 11 November 2026: "can we do for everyone"), drawn like the department badges
// (components/ubec/department-art.tsx). The UBEC BEAP Chair role wears the crown; a Director who is also a BEAP Chair keeps
// the Director badge and gets the crowned "BEAP Chair" chip beside it.
const roleBadge: Record<string, string> = {
  'Data Entry Staff': 'role-dataEntry',
  Director: 'role-director',
  'Executive Chairman': 'role-chairman',
  'Super Admin': 'role-admin',
  'UBEC Executive Secretary': 'role-secretary',
  'UBEC BEAP Chair': 'chair',
  'UBEC Director': 'role-director',
  'UBEC Oversight Director': 'role-oversight',
  'UBEC Assessment Officer': 'role-officer',
  'UBEC Department Reviewer': 'role-officer',
};

/** The role's badge (decorative); nothing for an unknown role. */
export function RoleArt({ role, className = 'department-art-sm' }: { role: string; className?: string }) {
  const key = roleBadge[role];
  return key ? <DepartmentArt department={key} className={className} /> : null;
}

/** "<badge> Director": the role with its badge, for tables and lists. */
export function RoleWithArt({ role, label = role }: { role: string; label?: string }) {
  return <span className="inline-flex items-center gap-1.5"><RoleArt role={role} />{label}</span>;
}
