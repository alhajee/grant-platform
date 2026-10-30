'use client';
import { UbecShell } from '@/components/ubec-shell';
import { ObservationsWorkspace } from '@/components/observations/observations-workspace';

/** Observation requests made to UBEC's Oversight Departments before UBEC168 (components/observations/observations-workspace.tsx). */
export default function UbecObservationsPage() {
  return <ObservationsWorkspace Shell={UbecShell} base="/ubec/observations" />;
}
