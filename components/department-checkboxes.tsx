'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { componentAccessNames, componentToken, departmentComponents, normalizeAccess, tokenDepartment } from '@/lib/component-access';

type Department = { id: string; name: string };

/**
 * Department access for a state user. With `components` (Data Entry Staff), the departments that run several
 * components list them underneath, so access can be limited to single components ("academic/sports"); a department
 * ticked whole covers all of its components.
 */
export function DepartmentCheckboxes({ departments, selected, onChange, disabled = false, components = false }: {
  departments: readonly Department[];
  selected: string[];
  onChange: (departments: string[]) => void;
  disabled?: boolean;
  components?: boolean;
}) {
  const allowed = departments.map(department => department.id);
  const allSelected = allowed.length > 0 && allowed.every(department => selected.includes(department));
  const someSelected = selected.length > 0 && !allSelected;
  const commit = (next: string[]) => onChange((normalizeAccess(next) ?? []).filter(entry => allowed.includes(tokenDepartment(entry))));
  const partOf = (department: string) => selected.filter(entry => entry.startsWith(`${department}/`));
  const toggleDepartment = (department: string, checked: boolean) => {
    const rest = selected.filter(entry => tokenDepartment(entry) !== department);
    commit(checked ? [...rest, department] : rest);
  };
  const toggleComponent = (department: string, component: (typeof departmentComponents)[string][number], checked: boolean) => {
    const token = componentToken(component);
    // Unticking one component of a whole department keeps the others as single grants.
    const current = selected.includes(department) ? departmentComponents[department].map(componentToken) : partOf(department);
    const rest = selected.filter(entry => tokenDepartment(entry) !== department);
    commit([...rest, ...(checked ? [...current, token] : current.filter(entry => entry !== token))]);
  };

  return <FieldSet className="gap-3">
    <div>
      <FieldLegend variant="label">Departments <span aria-hidden="true" className="text-destructive">*</span></FieldLegend>
      <FieldDescription>{components ? 'Select every department this user can access, edit, and submit for, or only some of its components' : 'Select every department this user can access, edit, and submit for'}</FieldDescription>
    </div>
    <FieldGroup data-slot="checkbox-group" role="group" className="gap-2 rounded-lg border p-3">
      <Field orientation="horizontal" className="border-b pb-3">
        <Checkbox id="department-all" disabled={disabled} checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={checked => onChange(checked === true ? allowed : [])} />
        <FieldLabel htmlFor="department-all" className="font-semibold">All departments</FieldLabel>
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        {departments.map(department => {
          const whole = selected.includes(department.id), parts = partOf(department.id);
          const list = components && (departmentComponents[department.id]?.length ?? 0) > 1 ? departmentComponents[department.id] : [];
          return <div key={department.id} className={list.length ? 'sm:col-span-2' : undefined}>
            <Field orientation="horizontal" className="rounded-md px-1 py-1.5">
              <Checkbox id={`department-${department.id}`} disabled={disabled} checked={whole ? true : parts.length ? 'indeterminate' : false} onCheckedChange={checked => toggleDepartment(department.id, checked === true)} />
              <FieldLabel htmlFor={`department-${department.id}`}>{department.name}</FieldLabel>
            </Field>
            {list.length > 0 && <div role="group" aria-label={`${department.name} components`} className="ml-7 grid gap-1 border-l pl-3 sm:grid-cols-2">
              {list.map(component => <Field key={component} orientation="horizontal" className="rounded-md px-1 py-1">
                <Checkbox id={`component-${component}`} disabled={disabled} checked={whole || parts.includes(componentToken(component))} onCheckedChange={checked => toggleComponent(department.id, component, checked === true)} />
                <FieldLabel htmlFor={`component-${component}`} className="font-normal text-muted-foreground">{componentAccessNames[component]}</FieldLabel>
              </Field>)}
            </div>}
          </div>;
        })}
      </div>
    </FieldGroup>
  </FieldSet>;
}
