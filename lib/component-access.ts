// Component-level access inside a SUBEB department (no migration). A user's `user_departments` rows are either a whole
// department ("academic": every component of it) or one component of a department ("academic/sports"). Only Data
// Entry Staff take component grants; Directors stay per department (one per department, see migration 024).
import { implementedPillars, subebComponentDepartments, type ImplementedPillar } from './beap-pillars';
import { isSupportDepartment, stateDepartments, subebDepartmentName, subebDepartments, supportDepartments } from './subeb-departments';
import { normalizeDepartments, type DepartmentAccess } from './user-departments';

/** The components each SUBEB department edits, in the plan's order. */
export const departmentComponents: Record<string, ImplementedPillar[]> = Object.fromEntries(
  subebDepartments.map(d => [d.id, implementedPillars.filter(p => subebComponentDepartments[p] === d.id)]),
);
/** Short component names for access lists and pickers. */
export const componentAccessNames: Record<ImplementedPillar, string> = {
  infrastructure: 'Infrastructure', monitoring: 'Supervision & Monitoring', sports: 'Sports, Quiz & Debate', tlm: 'TLM', curriculum: 'Curriculum',
  gscci: 'Greening', quality: 'Quality Assurance', teachers: 'Teacher Development', ict: 'ICT', sbmc: 'SBMC', planning: 'Planning',
};
export const componentToken = (component: ImplementedPillar) => `${subebComponentDepartments[component]}/${component}`;
export const tokenDepartment = (token: string) => token.split('/')[0];
const tokenComponent = (token: string) => token.split('/')[1] as ImplementedPillar | undefined;

/** Whether the access list covers a component: its whole department, or that component alone. */
export function holdsComponent(access: DepartmentAccess, component: ImplementedPillar): boolean {
  const held = normalizeDepartments(access), department = subebComponentDepartments[component];
  return held.includes(department) || held.includes(`${department}/${component}`);
}

/**
 * Checks and tidies a selection: every entry is a department or one of its components; a department chosen whole
 * drops its component entries, and every component of a department chosen one by one becomes the department.
 * Returns null when an entry is not valid.
 */
export function normalizeAccess(selection: DepartmentAccess): string[] | null {
  const tokens = normalizeDepartments(selection);
  for (const token of tokens) {
    const department = tokenDepartment(token), component = tokenComponent(token);
    // Support departments (Procurement, Finance) have no components: held whole only.
    if (isSupportDepartment(department)) { if (token.includes('/')) return null; continue; }
    if (!departmentComponents[department]) return null;
    if (token.includes('/') && (!component || !departmentComponents[department].includes(component) || token.split('/').length !== 2)) return null;
  }
  const whole = new Set(tokens.filter(t => !t.includes('/')));
  for (const [department, components] of Object.entries(departmentComponents))
    if (components.every(c => tokens.includes(`${department}/${c}`))) whole.add(department);
  const parts = tokens.filter(t => t.includes('/') && !whole.has(tokenDepartment(t)));
  const order = (t: string) => stateDepartments.findIndex(d => d.id === tokenDepartment(t));
  return [...whole, ...parts].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}

export const hasComponentGrants = (access: DepartmentAccess) => normalizeDepartments(access).some(t => t.includes('/'));

/** "Physical Planning, Academic Services (Sports, TLM)" for a SUBEB access list. */
export function accessLabel(access: DepartmentAccess): string {
  const tokens = normalizeDepartments(access);
  return subebDepartments.flatMap(d => {
    if (tokens.includes(d.id)) return [d.name];
    const parts = tokens.filter(t => tokenDepartment(t) === d.id && t.includes('/')).map(t => componentAccessNames[tokenComponent(t)!]);
    return parts.length ? [`${subebDepartmentName(d.id)} (${parts.join(', ')})`] : [];
  }).concat(supportDepartments.filter(d => tokens.includes(d.id)).map(d => d.name)).join(', ');
}
