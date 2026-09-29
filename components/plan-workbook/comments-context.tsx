'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { currentPlanHref } from '@/lib/action-plans';
import { sheetPillar, threadKey, type CommentAbilities, type CommentSheet, type PlanCommentThread, type PlanCommentsResponse } from '@/lib/plan-comments';
import type { ImplementedPillar } from '@/lib/beap-pillars';

/** The cell or row whose thread popover is open; threadId null means "new comment". */
export type CommentTarget = { sheet: CommentSheet; rowRef: string; columnId: string | null; threadId: number | null };
export type CommentsController = {
  threads: PlanCommentThread[]; readOnly: boolean; loaded: boolean;
  abilities: (pillar: ImplementedPillar) => CommentAbilities;
  active: CommentTarget | null; setActive: (target: CommentTarget | null) => void;
  create: (sheet: CommentSheet, rowRef: string, columnId: string | null, body: string) => Promise<boolean>;
  reply: (parentId: number, body: string) => Promise<boolean>;
  setResolved: (id: number, resolved: boolean) => Promise<boolean>;
  openCount: (pillar: ImplementedPillar) => number;
};
const none: CommentAbilities = { start: false, reply: false, resolveAny: false, reopen: false };

async function send(method: 'POST' | 'PATCH', body: unknown) {
  try {
    const response = await fetch(currentPlanHref('/api/plans/comments'), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { toast.error(result.error || 'The comment could not be saved. Please try again.'); return false; }
    return true;
  } catch { toast.error('You appear to be offline. The comment was not saved.'); return false; }
}

/** Loads the current working plan's comment threads. Pass enabled=false for saved submissions. */
export function usePlanComments(planId: number | undefined, enabled: boolean, reloadKey: unknown): CommentsController | null {
  const [data, setData] = useState<PlanCommentsResponse | null>(null);
  const [active, setActive] = useState<CommentTarget | null>(null);
  const ticket = useRef(0);
  const load = useCallback(async () => {
    if (!planId || !enabled) return;
    const id = ++ticket.current;
    try {
      const response = await fetch(currentPlanHref('/api/plans/comments'), { cache: 'no-store' });
      const result = await response.json() as PlanCommentsResponse & { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (id === ticket.current) setData(result);
    } catch (cause) { if (id === ticket.current) { console.error(cause); toast.error('Comments could not be loaded. Refresh to try again.'); } }
  }, [planId, enabled]);
  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);
  // Pick up replies and resolutions made by others when the reviewer returns to the tab.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  const threads = useMemo(() => data?.threads ?? [], [data]);
  const create = useCallback(async (sheet: CommentSheet, rowRef: string, columnId: string | null, body: string) => {
    const ok = await send('POST', { sheet, rowRef, columnId, body }); if (ok) { await load(); toast.success('Comment added'); } return ok;
  }, [load]);
  const reply = useCallback(async (parentId: number, body: string) => { const ok = await send('POST', { parentId, body }); if (ok) await load(); return ok; }, [load]);
  const setResolved = useCallback(async (id: number, resolved: boolean) => {
    const ok = await send('PATCH', { id, action: resolved ? 'resolve' : 'reopen' }); if (ok) { await load(); toast.success(resolved ? 'Comment resolved' : 'Comment reopened'); } return ok;
  }, [load]);
  const controller = useMemo<CommentsController>(() => ({
    threads, readOnly: !data || data.locked, loaded: !!data, active, setActive, create, reply, setResolved,
    abilities: pillar => data && !data.locked ? data.abilities[pillar] ?? none : none,
    openCount: pillar => threads.filter(t => t.pillar === pillar && !t.resolvedAt).length,
  }), [threads, data, active, create, reply, setResolved]);
  return enabled && planId ? controller : null;
}

const CommentsContext = createContext<CommentsController | null>(null);
export const CommentsProvider = ({ value, children }: { value: CommentsController | null; children: ReactNode }) => <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>;
export const useComments = () => useContext(CommentsContext);

export type SheetComments = {
  controller: CommentsController; can: CommentAbilities; threads: PlanCommentThread[];
  /** Open threads by `${rowRef}:${columnId}`; row threads use an empty column. */
  open: Map<string, PlanCommentThread>; openCount: number;
};
/** The comment state for one workbook sheet, or null when comments are off (UBEC, saved submissions). */
export function useSheetComments(sheet: CommentSheet): SheetComments | null {
  const controller = useComments();
  return useMemo(() => {
    if (!controller) return null;
    const threads = controller.threads.filter(t => t.sheet === sheet);
    const open = new Map(threads.filter(t => !t.resolvedAt && !t.orphaned).map(t => [threadKey(t), t]));
    return { controller, can: controller.abilities(sheetPillar[sheet]), threads, open, openCount: threads.filter(t => !t.resolvedAt).length };
  }, [controller, sheet]);
}
