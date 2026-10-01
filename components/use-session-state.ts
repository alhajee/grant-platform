'use client';

import { useCallback, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

const prefix = 'beapms:';
const listeners = new Map<string, Set<() => void>>();
// Fallback when sessionStorage is blocked (some private modes): values last until reload.
const memory = new Map<string, string>();

function readRaw(key: string) {
  try { return window.sessionStorage.getItem(prefix + key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
}
function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
function subscribeTo(key: string) {
  return (listener: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(listener); listeners.set(key, set);
    return () => { set.delete(listener); };
  };
}
const noSubscribe = () => () => {};

/**
 * useState that survives unmounting for the rest of the browser-tab session (e.g. table filters when
 * switching admin tabs or leaving the page). Pass no key to behave like plain useState.
 * Hydration-safe: the server and the first client render use `initial`; the stored value follows.
 */
export function useSessionState<T>(key: string | undefined, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [local, setLocal] = useState<T>(initial);
  const subscribe = useMemo(() => key ? subscribeTo(key) : noSubscribe, [key]);
  const raw = useSyncExternalStore(subscribe, () => key ? readRaw(key) : null, () => null);
  // `initial` is only used before anything is stored, so a fresh literal each render is fine.
  const [fallback] = useState(initial);
  const stored = useMemo(() => parse(raw, fallback), [raw, fallback]);
  const setStored = useCallback((update: SetStateAction<T>) => {
    if (!key) return;
    // Read the latest value at call time so several updates in one tick compose correctly.
    const current = parse(readRaw(key), fallback);
    const next = typeof update === 'function' ? (update as (value: T) => T)(current) : update;
    const json = JSON.stringify(next);
    memory.set(key, json);
    try { window.sessionStorage.setItem(prefix + key, json); } catch { /* storage unavailable: memory keeps it */ }
    listeners.get(key)?.forEach(listener => listener());
  }, [key, fallback]);
  return key ? [stored, setStored] : [local, setLocal];
}
