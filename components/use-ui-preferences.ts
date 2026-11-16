'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UiPreferences } from '@/lib/ui-preferences';

/**
 * UBEC261: display choices saved to the account (GET/PATCH /api/account/preferences), so a person's view follows them
 * to any device. This browser keeps a copy so the screen opens right away; the account's choice then wins.
 */
const cacheKey = 'beapms:ui-preferences';
const cached = (): UiPreferences => { try { return JSON.parse(localStorage.getItem(cacheKey) ?? '{}') as UiPreferences; } catch { return {}; } };
const keep = (value: UiPreferences) => { try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch { /* storage blocked */ } };

export function useUiPreferences() {
  // Only used in dialogs opened by a click, so reading storage while initialising is safe.
  const [preferences, setPreferences] = useState<UiPreferences>(cached);
  useEffect(() => {
    let live = true;
    void fetch('/api/account/preferences', { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<{ preferences: UiPreferences }> : null)
      .then(data => { if (live && data) { setPreferences(current => { const next = { ...current, ...data.preferences }; keep(next); return next; }); } })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  const update = useCallback((change: UiPreferences) => {
    setPreferences(current => { const next = { ...current, ...change }; keep(next); return next; });
    void fetch('/api/account/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) }).catch(() => undefined);
  }, []);
  return { preferences, update };
}
