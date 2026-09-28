'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';

type Department = { id: string; name: string };

export function DepartmentCheckboxes({ departments, selected, onChange, disabled = false }: {
  departments: readonly Department[];
  selected: string[];
  onChange: (departments: string[]) => void;
  disabled?: boolean;
}) {
  const allowed = departments.map(department => department.id);
  const allSelected = allowed.length > 0 && allowed.every(department => selected.includes(department));
  const toggle = (department: string, checked: boolean) => {
    const next = checked ? [...selected, department] : selected.filter(value => value !== department);
    onChange(allowed.filter(value => next.includes(value)));
  };

  return <FieldSet className="gap-3">
    <div>
      <FieldLegend variant="label">Departments <span aria-hidden="true" className="text-destructive">*</span></FieldLegend>
      <FieldDescription>Select every department this user can access, edit, and submit for.</FieldDescription>
    </div>
    <FieldGroup data-slot="checkbox-group" role="group" className="gap-2 rounded-lg border p-3">
      <Field orientation="horizontal" className="border-b pb-3">
        <Checkbox id="department-all" disabled={disabled} checked={allSelected} onCheckedChange={checked => onChange(checked === true ? allowed : [])} />
        <FieldLabel htmlFor="department-all" className="font-semibold">All departments</FieldLabel>
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        {departments.map(department => <Field key={department.id} orientation="horizontal" className="rounded-md px-1 py-1.5">
          <Checkbox id={`department-${department.id}`} disabled={disabled} checked={selected.includes(department.id)} onCheckedChange={checked => toggle(department.id, checked === true)} />
          <FieldLabel htmlFor={`department-${department.id}`}>{department.name}</FieldLabel>
        </Field>)}
      </div>
    </FieldGroup>
  </FieldSet>;
}
