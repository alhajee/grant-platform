'use client';
import { useEffect, useState } from 'react';
import { CircleXIcon, CrosshairIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { commentColumns, type CommentSheet, type PlanCommentThread, type PlanCommentsResponse } from '@/lib/plan-comments';
import type { UbecResults } from '@/lib/ubec-flow';
import './ubec-rejection-alert.css';

// UBEC232 (client, 6 November 2026: "make it point where the issue or rejection is in the form"): when an item UBEC
// rejected is open in an editor, a red alert at the top of the form names the reason and the officer, and the UBEC
// comments shared on that row's cells are listed and their fields in the form are marked with the comment.

export type UbecRejection = { rowRef: string; reason: string; by: string };
export type FlaggedField = { columnId: string; label: string; body: string; author: string; fieldId: string | null };
export type UbecRejections = { rejected: Map<string, UbecRejection>; threads: PlanCommentThread[] };

/**
 * The items UBEC rejected on this component in the latest round, while it is back with the SUBEB, and the shared UBEC
 * comment threads still open on its sheet. Empty when the plan was not returned by UBEC.
 */
export function useUbecRejections(planId: number | undefined, pillar: string, sheet: CommentSheet, reloadKey?: unknown): UbecRejections {
  const [state, setState] = useState<UbecRejections>({ rejected: new Map(), threads: [] });
  useEffect(() => {
    if (!planId) return;
    let live = true;
    void (async () => {
      const results = await fetch(`/api/ubec/results?plan=${planId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<UbecResults> : null).catch(() => null);
      if (!results?.round || results.round.status !== 'returned') { if (live) setState({ rejected: new Map(), threads: [] }); return; }
      const items = results.components.find(c => c.pillar === pillar)?.items ?? [];
      const rejected = new Map(items.filter(i => i.decision === 'reject').map(i => [i.rowRef, { rowRef: i.rowRef, reason: i.note, by: i.by ?? '' }]));
      const comments = rejected.size ? await fetch(`/api/plans/comments?plan=${planId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<PlanCommentsResponse> : null).catch(() => null) : null;
      const threads = (comments?.threads ?? []).filter(t => t.scope === 'ubec' && t.sheet === sheet && !t.resolvedAt && rejected.has(t.rowRef));
      if (live) setState({ rejected, threads });
    })();
    return () => { live = false; };
  }, [planId, pillar, sheet, reloadKey]);
  return state;
}

/** The UBEC comments on one row's cells, with the form field each one points at (`fieldIds`: workbook column id → form element id). */
export function flaggedFields(threads: readonly PlanCommentThread[], sheet: CommentSheet, rowRef: string, fieldIds: Readonly<Record<string, string>>): FlaggedField[] {
  return threads.filter(t => t.rowRef === rowRef).map(t => ({
    columnId: t.columnId ?? '', label: t.columnId ? commentColumns[sheet]?.[t.columnId] ?? t.columnId : 'Whole item',
    body: t.replies.length ? `${t.body} (${t.replies.length} repl${t.replies.length === 1 ? 'y' : 'ies'})` : t.body, author: t.authorName,
    fieldId: t.columnId ? fieldIds[t.columnId] ?? null : null,
  }));
}

/** Marks the form fields UBEC commented on (data-ubec-flag on their Field, with the comment as the title) while mounted. */
function useFieldFlags(fields: readonly FlaggedField[]) {
  const key = fields.map(f => `${f.fieldId}:${f.body}`).join('|');
  useEffect(() => {
    const marked: HTMLElement[] = [];
    for (const field of fields) {
      const target = field.fieldId ? document.getElementById(field.fieldId) : null;
      const box = (target?.closest('[data-slot=field]') ?? target) as HTMLElement | null;
      if (!box) continue;
      box.setAttribute('data-ubec-flag', '');
      box.setAttribute('data-ubec-comment', `UBEC: ${field.body}`);
      marked.push(box);
    }
    return () => { for (const box of marked) { box.removeAttribute('data-ubec-flag'); box.removeAttribute('data-ubec-comment'); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const focusField = (id: string) => {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
};

/** The red alert at the top of a form showing an item UBEC rejected: the reason, the officer and the commented fields. */
export function UbecRejectionAlert({ rejection, fields }: { rejection: UbecRejection; fields: readonly FlaggedField[] }) {
  useFieldFlags(fields);
  return <Alert variant="destructive" className="ubec-rejection-alert" role="status">
    <CircleXIcon />
    <AlertTitle>UBEC rejected this item</AlertTitle>
    <AlertDescription>
      <p>{rejection.reason || 'No reason was given'}{rejection.by ? <span className="ubec-rejection-by"> · {rejection.by}</span> : null}</p>
      {fields.length > 0 && <ul className="ubec-rejection-fields" aria-label="UBEC comments on this item">
        {fields.map((field, index) => <li key={`${field.columnId}-${index}`}>
          <span><strong>{field.label}:</strong> {field.body} <span className="ubec-rejection-by">· {field.author}</span></span>
          {field.fieldId && <Button type="button" variant="ghost" size="xs" className="rounded-full" onClick={() => focusField(field.fieldId!)}><CrosshairIcon data-icon="inline-start" />Go to field</Button>}
        </li>)}
      </ul>}
      <p className="ubec-rejection-hint">Change the item to answer UBEC, then send it on again</p>
    </AlertDescription>
  </Alert>;
}
