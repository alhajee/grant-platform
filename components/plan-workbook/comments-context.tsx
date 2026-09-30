'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { currentPlanHref } from '@/lib/action-plans';
import { sheetPillar, threadKey, type CommentAbilities, type CommentScope, type CommentSheet, type PlanCommentThread, type PlanCommentsResponse } from '@/lib/plan-comments';
import type { ImplementedPillar } from '@/lib/beap-pillars';

/** The cell or row whose thread popover is open; threadId null means "new comment". */
export type CommentTarget = { sheet: CommentSheet; rowRef: string; columnId: string | null; threadId: number | null };
export type CommentsController = {
  threads: PlanCommentThread[]; readOnly: boolean; loaded: boolean;
  /** Whose workbook this is: 'state' (SUBEB review page) or 'ubec' (UBEC review page). New threads get this scope. */
  scope: CommentScope;
  /** Abilities on `pillar` for threads of `scope` (default: the controller's own scope). */
  abilities: (pillar: ImplementedPillar, scope?: CommentScope) => CommentAbilities;
  /** Why the viewer cannot start a comment here. */
  startHint: string;
  active: CommentTarget | null; setActive: (target: CommentTarget | null) => void;
  create: (sheet: CommentSheet, rowRef: string, columnId: string | null, body: string) => Promise<boolean>;
  reply: (parentId: number, body: string) => Promise<boolean>;
  setResolved: (id: number, resolved: boolean) => Promise<boolean>;
  openCount: (pillar: ImplementedPillar, scope?: CommentScope) => number;
};
/** Where the comments live: the state API for the SUBEB review page, the UBEC API (optionally a saved round) for UBEC. */
export type CommentsSource = { scope: CommentScope; roundId?: number | null };
const none: CommentAbilities = { start: false, reply: false, resolveAny: false, reopen: false };

const endpoint = (source: CommentsSource, read = false) => {
  if (source.scope === 'state') return currentPlanHref('/api/plans/comments');
  const url = currentPlanHref('/api/ubec/comments');
  return read && source.roundId ? `${url}&round=${encodeURIComponent(source.roundId)}` : url;
};
async function send(source: CommentsSource, method: 'POST' | 'PATCH', body: unknown) {
  try {
    const response = await fetch(endpoint(source), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { toast.error(result.error || 'The comment could not be saved. Please try again.'); return false; }
    return true;
  } catch { toast.error('You appear to be offline. The comment was not saved.'); return false; }
}

/** Loads the plan's comment threads (the current working plan, or a UBEC round). Pass enabled=false to turn comments off. */
export function usePlanComments(planId: number | undefined, enabled: boolean, reloadKey: unknown, { scope = 'state', roundId = null }: Partial<CommentsSource> = {}): CommentsController | null {
  const source = useMemo<CommentsSource>(() => ({ scope, roundId }), [scope, roundId]);
  const [data, setData] = useState<PlanCommentsResponse | null>(null);
  const [active, setActive] = useState<CommentTarget | null>(null);
  const ticket = useRef(0);
  const load = useCallback(async () => {
    if (!planId || !enabled) return;
    const id = ++ticket.current;
    try {
      const response = await fetch(endpoint(source, true), { cache: 'no-store' });
      const result = await response.json() as PlanCommentsResponse & { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (id === ticket.current) setData(result);
    } catch (cause) { if (id === ticket.current) { console.error(cause); toast.error('Comments could not be loaded. Refresh to try again.'); } }
  }, [planId, enabled, source]);
  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);
  // Pick up replies and resolutions made by others when the reviewer returns to the tab.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  const threads = useMemo(() => data?.threads ?? [], [data]);
  const create = useCallback(async (sheet: CommentSheet, rowRef: string, columnId: string | null, body: string) => {
    const ok = await send(source, 'POST', { sheet, rowRef, columnId, body }); if (ok) { await load(); toast.success('Comment added'); } return ok;
  }, [load, source]);
  // Replies and resolutions on a UBEC thread from the state go through the state API (the thread is shared).
  const reply = useCallback(async (parentId: number, body: string) => { const ok = await send(source, 'POST', { parentId, body }); if (ok) await load(); return ok; }, [load, source]);
  const setResolved = useCallback(async (id: number, resolved: boolean) => {
    const ok = await send(source, 'PATCH', { id, action: resolved ? 'resolve' : 'reopen' }); if (ok) { await load(); toast.success(resolved ? 'Comment resolved' : 'Comment reopened'); } return ok;
  }, [load, source]);
  const controller = useMemo<CommentsController>(() => ({
    threads, readOnly: !data || data.locked, loaded: !!data, active, setActive, create, reply, setResolved, scope,
    abilities: (pillar, of = scope) => !data || data.locked ? none : (of === scope ? data.abilities : data.otherAbilities ?? {})[pillar] ?? none,
    startHint: data?.locked ? 'Comments are read-only for this plan.' : scope === 'ubec' ? 'Only the UBEC ES and the reviewers assigned to this component can comment on it.' : 'Only the reviewer currently holding this component can start comments.',
    openCount: (pillar, of = scope) => threads.filter(t => t.pillar === pillar && !t.resolvedAt && t.scope === of).length,
  }), [threads, data, active, create, reply, setResolved, scope]);
  return enabled && planId ? controller : null;
}

const CommentsContext = createContext<CommentsController | null>(null);
export const CommentsProvider = ({ value, children }: { value: CommentsController | null; children: ReactNode }) => <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>;
export const useComments = () => useContext(CommentsContext);

export type SheetComments = {
  controller: CommentsController; can: CommentAbilities; threads: PlanCommentThread[];
  /** Open threads by `${rowRef}:${columnId}`; row threads use an empty column. A cell can hold one state and one UBEC thread. */
  open: Map<string, PlanCommentThread[]>; openCount: number;
};
/** The comment state for one workbook sheet, or null when comments are off (UBEC, saved submissions). */
export function useSheetComments(sheet: CommentSheet): SheetComments | null {
  const controller = useComments();
  return useMemo(() => {
    if (!controller) return null;
    const threads = controller.threads.filter(t => t.sheet === sheet);
    const open = new Map<string, PlanCommentThread[]>();
    // The viewer's own scope comes first, so a click opens their own thread before the other scope's.
    for (const t of threads.filter(t => !t.resolvedAt && !t.orphaned).sort((a, b) => Number(b.scope === controller.scope) - Number(a.scope === controller.scope))) open.set(threadKey(t), [...open.get(threadKey(t)) ?? [], t]);
    return { controller, can: controller.abilities(sheetPillar[sheet]), threads, open, openCount: threads.filter(t => !t.resolvedAt).length };
  }, [controller, sheet]);
}
