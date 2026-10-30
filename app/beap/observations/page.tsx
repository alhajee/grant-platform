'use client';
import { SubebHeader } from '@/components/subeb-header';
import { ObservationsWorkspace, type ObservationsShell } from '@/components/observations/observations-workspace';

// UBEC168/194: the SUBEB's own Audit, Procurement, Finance and Special Programmes answer the Executive Chairman's request
// for observations here (their Director and Data Entry Officer), on their state's plans only.
const SubebShell: ObservationsShell = ({ children }) => <div className="dashboard-page"><SubebHeader observations /><main className="state-users-main">{children}</main></div>;

export default function SubebObservationsPage() {
  return <ObservationsWorkspace Shell={SubebShell} base="/beap/observations" />;
}
