'use client';

import { useCallback, useEffect, useState } from 'react';
import { UbecLogo } from './ubec-logo';
import { AccountMenu } from './workspace-account-menu';
import type { LocalUser } from '@/lib/local-session';

export type AdminSection = 'admin' | 'users' | 'schools';
const links: { section: AdminSection; href: string; label: string }[] = [
  { section: 'admin', href: '/admin', label: 'Administration' },
  { section: 'users', href: '/admin/users', label: 'Users' },
  { section: 'schools', href: '/admin/schools', label: 'Schools' },
];

/** Super Admin header: the SUBEB capsule nav with the admin pages. Plain links, as next/link breaks in the production build. */
export function AdminHeader({ current, user }: { current: AdminSection; user: LocalUser | null }) {
  return <header className="subeb-header w-full">
    <div className="subeb-navigation-capsule">
      <a href="/admin" className="subeb-header-brand" aria-label="BEAPMS Portal administration"><UbecLogo /><span>BEAPMS Portal</span></a>
      <nav aria-label="Administrator navigation">
        {links.map(link => <a key={link.section} href={link.href} aria-current={current === link.section ? 'page' : undefined}>{link.label}</a>)}
      </nav>
    </div>
    <div className="subeb-header-account"><AccountMenu user={user} /></div>
  </header>;
}

export type AdminMe = { user: LocalUser; impersonating: boolean };

/** Loads the signed-in Super Admin; a signed-out visitor goes back to the sign-in page. */
export function useAdminMe() {
  const [me, setMe] = useState<AdminMe | null>(null), [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/me', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return null; }
      const body = await response.json().catch(() => ({})) as AdminMe & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the admin workspace.');
      setMe(body);
      return body;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the admin workspace.'); return null; }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { me, error, reload: load };
}
