'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** "focus": only the activity (or section) chosen in the form. "all": every activity, the chosen one pinned first. */
export type PanelMode = 'focus' | 'all';

/**
 * The saved-lines panel's view. It opens on "All" as an overview; once the user picks an activity in the
 * form or opens a line, it follows the form ("This activity"). A choice made on the toggle itself is kept
 * for the rest of the visit, so the panel never switches against the user's wish.
 */
export function usePanelMode() {
  const [mode, setModeState] = useState<PanelMode>('all');
  const explicit = useRef(false);
  const setMode = useCallback((next: PanelMode) => { explicit.current = true; setModeState(next); }, []);
  const follow = useCallback(() => { if (!explicit.current) setModeState('focus'); }, []);
  return { mode, setMode, follow };
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scrolls a saved line's row into view inside the panel. */
export function scrollLineIntoView(id: number, block: ScrollLogicalPosition = 'nearest') {
  document.querySelector<HTMLElement>(`[data-line-row="${id}"]`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block, inline: 'nearest' });
}

const flashMs = 2400;

/** Briefly highlights the line that was just saved and brings it into view. */
export function useLineFlash() {
  const [flashId, setFlashId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((id: number) => {
    if (timer.current) clearTimeout(timer.current);
    setFlashId(id);
    timer.current = setTimeout(() => setFlashId(null), flashMs);
  }, []);
  useEffect(() => {
    if (flashId == null) return;
    const frame = requestAnimationFrame(() => scrollLineIntoView(flashId, 'center'));
    return () => cancelAnimationFrame(frame);
  }, [flashId]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { flashId, flash };
}

/** Which sections the user has folded away, by key. */
export function useCollapsed() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((key: string, open: boolean) => setCollapsed(current => {
    const next = new Set(current);
    if (open) next.delete(key); else next.add(key);
    return next;
  }), []);
  return { isOpen: (key: string) => !collapsed.has(key), toggle };
}
