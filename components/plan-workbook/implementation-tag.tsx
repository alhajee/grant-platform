'use client';

import { useState } from 'react';
import { CalendarClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { PlanCommentThread } from '@/lib/plan-comments';
import type { CommentsController } from './comments-context';

/**
 * Client, 25 November 2026: an Oversight Department's observation can be kept "For implementation". It stays open and
 * readable but no longer holds the UBEC BEAP Chair's approval. The badge shows for everyone; the department that made it
 * (the author, or its Oversight Director) switches it.
 */
export function ImplementationTag({ thread, controller }: { thread: PlanCommentThread; controller: CommentsController }) {
  const [busy, setBusy] = useState(false);
  const marked = !!thread.forImplementation;
  const mayMark = !!thread.canMarkImplementation && !thread.resolvedAt && !controller.readOnly;
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try { await controller.setImplementation(thread.id, !marked); } finally { setBusy(false); }
  }
  if (!marked && !mayMark) return null;
  return <span className="wb-implementation">
    {marked && <Badge variant="secondary" className="wb-implementation-badge" title={`For implementation${thread.forImplementation?.by ? ` · marked by ${thread.forImplementation.by}` : ''}. It does not hold approval`}><CalendarClockIcon aria-hidden="true" />For implementation</Badge>}
    {mayMark && <Button type="button" size="xs" variant="ghost" className="rounded-full" disabled={busy} onClick={() => void toggle()} title={marked ? 'Needed before approval again' : 'Follow this up during implementation. It will no longer hold approval'}>
      {busy ? <Spinner data-icon="inline-start" /> : !marked && <CalendarClockIcon data-icon="inline-start" />}{marked ? 'Needed before approval' : 'For implementation'}
    </Button>}
  </span>;
}
