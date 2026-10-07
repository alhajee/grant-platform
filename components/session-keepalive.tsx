'use client';
import { useEffect } from 'react';

// Keeps a signed-in session alive while the portal is in use: on activity (at most every 10 minutes) and when the tab
// comes back into view, POST /api/auth/session renews it (lib/local-session.ts). Idle tabs stop renewing, so the
// session still ends after the idle limit. Signed-out pages get a harmless 401 and stop.
const renewEveryMs = 10 * 60 * 1000;

export function SessionKeepalive() {
  useEffect(() => {
    let last = Date.now(), stopped = false, pending = false;
    const renew = async () => {
      if (stopped || pending || Date.now() - last < renewEveryMs) return;
      pending = true; last = Date.now();
      try {
        const response = await fetch('/api/auth/session', { method: 'POST', cache: 'no-store' });
        if (response.status === 401 || response.status === 403) stopped = true;
      } catch { /* offline: try again on the next activity */ last = 0; }
      finally { pending = false; }
    };
    const onActivity = () => { void renew(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void renew(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'focus'] as const;
    events.forEach(name => window.addEventListener(name, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    return () => { events.forEach(name => window.removeEventListener(name, onActivity)); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return null;
}
