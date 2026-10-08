'use client';
import { useSyncExternalStore } from 'react';
import { UbecLogo } from './ubec-logo';
import { AccountMenu } from './workspace-account-menu';
import { NotificationBell } from './notifications/notification-bell';
import { ubecRoles, ubecRoleTitle } from '@/lib/ubec';

function subscribeToHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}
const navigation = [
  { label: 'Overview', hash: '' },
  { label: 'Plans', hash: '#plans' },
  { label: 'Submissions', hash: '#submissions' },
  { label: 'Activity', hash: '#activity' },
];

export function UbecShell({ children, user, review = false, allocations = false, team = false }: { children: React.ReactNode; user?: { name: string; role: string; department?: string | null } | null; review?: boolean; allocations?: boolean; team?: boolean }) {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => '');
  const admin = user?.role === 'Super Admin';
  const activeHash = allocations ? '#allocations' : team ? '#team' : review ? '#submissions' : hash;

  return (
    <div className="national-shell national-horizontal-shell">
      <header className="national-header">
        <div className="national-navigation-capsule">
          <a href={admin ? "/admin" : "/ubec"} className="national-header-brand" aria-label="BEAPMS Portal overview">
            <UbecLogo /><span>BEAPMS Portal</span>
          </a>
          <nav aria-label="UBEC navigation" className="national-header-nav">
            {/* The Super Admin opens UBEC plan pages only to manage officer assignments (migration 056). */}
            {admin ? <a href="/admin?section=officers">Administration</a> : navigation.map(({ label, hash: targetHash }) => (
              <a key={label} href={`/ubec${targetHash}`} aria-current={activeHash === targetHash ? (targetHash && !review ? 'location' : 'page') : undefined}>{label}</a>
            ))}
            {!admin && (user?.role === ubecRoles.director || user?.role === ubecRoles.chair) && <a href="/ubec/team" aria-current={team ? 'page' : undefined}>Officers</a>}
            {user?.role === ubecRoles.es && <a href="/ubec/allocations" aria-current={allocations?'page':undefined}>Allocations</a>}
          </nav>
        </div>
        <div className="national-header-actions">
          {!admin && <NotificationBell />}
          <div className="national-header-account">
            {/* The account shows the role and department, e.g. "UBEC Director · Physical Planning (DPP)". */}
            <AccountMenu user={user ? { ...user, role: ubecRoleTitle(user.role, user.department), email: '' } : null} />
          </div>
        </div>
      </header>
      <main className="national-main">{children}</main>
    </div>
  );
}
