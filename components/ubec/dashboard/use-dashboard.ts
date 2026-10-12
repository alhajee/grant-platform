'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UbecDashboard } from '@/lib/ubec';

/** The UBEC dashboard data (GET /api/ubec/dashboard) for a funding year ('all' = every year), shared by the UBEC pages. */
export function useUbecDashboard(year: string) {
  const [data, setData] = useState<UbecDashboard | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current; setLoading(true); setError('');
    try {
      const response = await fetch(`/api/ubec/dashboard${year === 'all' ? '' : `?year=${year}`}`, { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const result = await response.json() as UbecDashboard & { error?: string };
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load the dashboard'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [year]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { data, error, loading, load };
}

/** A query parameter read once on load (e.g. ?stage=received from the overview's stage tiles). */
export const initialParam = (name: string, fallback = 'all') =>
  typeof window === 'undefined' ? fallback : new URLSearchParams(window.location.search).get(name) ?? fallback;
