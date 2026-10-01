'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

const prefix = 'beapms:';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.sessionStorage.getItem(prefix + key);
    return stored === null ? fallback : JSON.parse(stored) as T;
  } catch { return fallback; }
}

/**
 * useState that survives unmounting for the rest of the browser-tab session (e.g. table filters when
 * switching admin tabs or leaving the page). Pass no key to behave like plain useState.
 */
export function useSessionState<T>(key: string | undefined, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => key ? read(key, initial) : initial);
  useEffect(() => {
    if (!key) return;
    try { window.sessionStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* storage unavailable: filters reset on return */ }
  }, [key, value]);
  return [value, setValue];
}
