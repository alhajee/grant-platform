'use client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import type { PlanCommentThread } from '@/lib/plan-comments';

const sheetNames: Record<PlanCommentThread['sheet'], string> = { infrastructure: 'Infrastructure', sports: 'Sports', sbmc: 'SBMC', tlm: 'TLM', distribution: 'TLM distribution' };

/**
 * Return dialog checklist: the UBEC ES picks which open UBEC comments the SUBEB receives. Everything starts
 * ticked; unticked comments stay internal to UBEC (enforced again by app/api/ubec/review/route.ts).
 */
export function ShareCommentsField({ threads, value, onChange, disabled }: { threads: PlanCommentThread[]; value: number[]; onChange: (ids: number[]) => void; disabled?: boolean }) {
  if (!threads.length) return null;
  const all = value.length === threads.length;
  const toggle = (id: number, checked: boolean) => onChange(checked ? [...value, id] : value.filter(v => v !== id));
  return <FieldSet className="ubec-share-comments">
    <div className="ubec-share-head">
      <FieldLegend variant="label">Comments to send · {value.length} of {threads.length}</FieldLegend>
      <Button type="button" variant="link" size="sm" disabled={disabled} onClick={() => onChange(all ? [] : threads.map(t => t.id))}>{all ? 'Untick all' : 'Tick all'}</Button>
    </div>
    <FieldDescription>Only ticked comments are sent to the SUBEB with your feedback, so they can reply. Unticked comments stay internal to UBEC.</FieldDescription>
    <ul className="ubec-share-list" aria-label="Open UBEC comments">
      {threads.map(thread => {
        const id = `share-comment-${thread.id}`, checked = value.includes(thread.id);
        return <li key={thread.id} data-checked={checked || undefined}>
          <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={next => toggle(thread.id, next === true)} />
          <FieldLabel htmlFor={id} className="ubec-share-label">
            <strong>{sheetNames[thread.sheet]} · {thread.targetLabel}{thread.sharedAt && <Badge variant="secondary" className="wb-scope-badge wb-shared-badge">Shared before</Badge>}</strong>
            <span>{thread.body}</span>
            <small>{thread.authorName}{thread.replies.length ? ` · ${thread.replies.length} ${thread.replies.length === 1 ? 'reply' : 'replies'}` : ''}</small>
          </FieldLabel>
        </li>;
      })}
    </ul>
  </FieldSet>;
}
