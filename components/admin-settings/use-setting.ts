'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export async function errorOf(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

type Options<T> = {
  url: string;
  /** Turns the GET/PUT response body into the setting value. */
  read: (body: unknown) => T;
  /** The PUT/POST body for a value. */
  write: (value: T) => unknown;
  method?: 'PUT' | 'POST';
  same?: (a: T, b: T) => boolean;
  saved: (value: T) => string;
  noun: string;
  onDirty?: (dirty: boolean) => void;
};

export type SettingState<T> = {
  saved: T | null; draft: T | null; error: string; saving: boolean; dirty: boolean;
  setDraft: (next: T | ((current: T) => T)) => void; load: () => Promise<void>; save: () => Promise<void>; discard: () => void;
};

/** Load, edit, discard and save one admin setting through its existing API route. */
export function useSetting<T>({ url, read, write, method = 'PUT', same = Object.is, saved: savedMessage, noun, onDirty }: Options<T>): SettingState<T> {
  const [saved, setSaved] = useState<T | null>(null), [draft, setDraftState] = useState<T | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, `Unable to load the ${noun}.`));
      const value = read(await response.json());
      setSaved(value); setDraftState(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to load the ${noun}.`); }
    // read is a module-level function in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, noun]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const dirty = saved !== null && draft !== null && !same(saved, draft);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  const setDraft = useCallback((next: T | ((current: T) => T)) => setDraftState(current => current === null ? current : typeof next === 'function' ? (next as (c: T) => T)(current) : next), []);
  const discard = useCallback(() => setDraftState(saved), [saved]);
  const save = useCallback(async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(write(draft)) });
      if (!response.ok) throw Error(await errorOf(response, `Unable to save the ${noun}.`));
      const value = read(await response.json());
      setSaved(value); setDraftState(value);
      toast.success(savedMessage(value));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : `Unable to save the ${noun}.`); }
    finally { setSaving(false); }
    // read/write/savedMessage are module-level functions in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, url, method, noun]);

  return { saved, draft, error, saving, dirty, setDraft, load, save, discard };
}
