'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { UbecLogo } from './ubec-logo';
import { AccountMenu } from './workspace-account-menu';
import { NotificationBell } from './notifications/notification-bell';
import type { LocalUser } from '@/lib/local-session';
import { canManageStateUsers } from '@/lib/subeb-access';

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

export function SubebHeader({ user, plan = false, users = false }: { user?: LocalUser | null; plan?: boolean; users?: boolean }) {
  const [sessionUser, setSessionUser] = useState<LocalUser | null>(null);
  useEffect(() => {
    if (user !== undefined) return;
    const controller = new AbortController();
    void fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? await response.json() as { user?: LocalUser | null } : null)
      .then(result => { if (!controller.signal.aborted) setSessionUser(result?.user ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [user]);
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const plansActive = plan || hash === '#action-plans';
  return <header className="subeb-header">
    <div className="subeb-navigation-capsule">
      <a href="/dashboard" className="subeb-header-brand" aria-label="BEAPMS Portal overview"><UbecLogo /><span>BEAPMS Portal</span></a>
      <nav aria-label="SUBEB navigation">
        <a href="/dashboard#action-plans" aria-current={plansActive ? (plan ? 'page' : 'location') : undefined}>Plans</a>
        {canManageStateUsers((user === undefined ? sessionUser : user)?.role) && <a href="/users" aria-current={users ? 'page' : undefined}>Users</a>}
      </nav>
    </div>
    <div className="subeb-header-actions">
      <NotificationBell />
      <div className="subeb-header-account"><AccountMenu user={user === undefined ? sessionUser : user} /></div>
    </div>
  </header>;
}
