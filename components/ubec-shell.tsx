'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { UbecLogo } from './ubec-logo';
import { AccountMenu } from './workspace-account-menu';

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
  { label: 'Submissions', hash: '#submissions' },
  { label: 'Departments', hash: '#departments' },
  { label: 'Activity', hash: '#activity' },
];

export function UbecShell({ children, user, review = false, allocations = false }: { children: React.ReactNode; user?: { name: string; role: string } | null; review?: boolean; allocations?: boolean }) {
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => '');
  const activeHash = allocations ? '#allocations' : review ? '#submissions' : hash;

  return (
    <div className="national-shell national-horizontal-shell">
      <header className="national-header">
        <div className="national-navigation-capsule">
          <Link href="/ubec" className="national-header-brand" aria-label="BEAPMS Portal overview">
            <UbecLogo /><span>BEAPMS Portal</span>
          </Link>
          <nav aria-label="UBEC navigation" className="national-header-nav">
            {navigation.map(({ label, hash: targetHash }) => (
              <a key={label} href={`/ubec${targetHash}`} aria-current={activeHash === targetHash ? (targetHash && !review ? 'location' : 'page') : undefined}>{label}</a>
            ))}
            {user?.role==='UBEC Executive Secretary' && <Link href="/ubec/allocations" aria-current={allocations?'page':undefined}>Allocations</Link>}
          </nav>
        </div>
        <div className="national-header-account">
          <AccountMenu user={user ? { ...user, email: '' } : null} />
        </div>
      </header>
      <main className="national-main">{children}</main>
    </div>
  );
}
