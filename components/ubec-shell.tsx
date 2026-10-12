'use client';
import { useSyncExternalStore } from 'react';
import { UbecLogo } from './ubec-logo';
import { AccountMenu } from './workspace-account-menu';
import { NotificationBell } from './notifications/notification-bell';
import { ubecRoles, ubecRoleTitle } from '@/lib/ubec';

// Each menu item is its own page; a plan page counts as Submissions.
const navigation = [
  { label: 'Overview', href: '/ubec' },
  { label: 'Plans', href: '/ubec/plans' },
  { label: 'Submissions', href: '/ubec/submissions' },
  { label: 'Activity', href: '/ubec/activity' },
];
const subscribeToPath = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };

export function UbecShell({ children, user, review = false, allocations = false, team = false }: { children: React.ReactNode; user?: { name: string; role: string; department?: string | null } | null; review?: boolean; allocations?: boolean; team?: boolean }) {
  const path = useSyncExternalStore(subscribeToPath, () => window.location.pathname.replace(/\/$/, ''), () => '');
  const admin = user?.role === 'Super Admin';
  const active = review ? '/ubec/submissions' : allocations || team ? '' : path;

  return (
    <div className="national-shell national-horizontal-shell">
      <header className="national-header">
        <div className="national-navigation-capsule">
          <a href={admin ? "/admin" : "/ubec"} className="national-header-brand" aria-label="BEAPMS Portal overview">
            <UbecLogo /><span>BEAPMS Portal</span>
          </a>
          <nav aria-label="UBEC navigation" className="national-header-nav">
            {/* The Super Admin opens UBEC plan pages only to manage officer assignments (migration 056). */}
            {admin ? <a href="/admin?section=officers">Administration</a> : navigation.map(({ label, href }) => (
              <a key={label} href={href} aria-current={active === href ? 'page' : undefined}>{label}</a>
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
