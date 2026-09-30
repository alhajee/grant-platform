'use client';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { CheckIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { commentBodyLimit, sheetPillar, type PlanCommentReply, type PlanCommentThread } from '@/lib/plan-comments';
import type { CommentsController, CommentTarget } from './comments-context';

const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
const exact = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
export function relativeTime(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return 'just now';
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';

function Entry({ comment }: { comment: PlanCommentReply }) {
  return <li className="wb-comment">
    <span className="wb-comment-avatar" aria-hidden="true">{initials(comment.authorName)}</span>
    <div className="wb-comment-main">
      <p className="wb-comment-meta"><strong>{comment.authorName}</strong><span>{comment.authorRole} · <time dateTime={comment.createdAt} title={exact.format(new Date(comment.createdAt))}>{relativeTime(comment.createdAt)}</time></span></p>
      <p className="wb-comment-body">{comment.body}</p>
    </div>
  </li>;
}

/**
 * Where a thread comes from. SUBEB users see a "UBEC" tag on UBEC threads; UBEC users see whether the
 * ES shared the thread with the SUBEB or it is still internal to UBEC.
 */
export function ScopeBadge({ thread, viewer }: { thread: PlanCommentThread; viewer: CommentsController['scope'] }) {
  if (thread.scope !== 'ubec') return null;
  if (viewer === 'state') return <Badge className="wb-scope-badge wb-ubec-badge" title={thread.roundNumber ? `From the UBEC review of submission ${thread.roundNumber}` : 'From the UBEC review'}>UBEC</Badge>;
  return thread.sharedAt ? <Badge variant="secondary" className="wb-scope-badge wb-shared-badge" title={`Shared with the SUBEB${thread.sharedByName ? ` by ${thread.sharedByName}` : ''}`}>Shared</Badge> : <Badge variant="outline" className="wb-scope-badge" title="Only UBEC can see this comment">Internal</Badge>;
}

/** A thread (root comment, replies, reply box, Resolve/Reopen), or a composer when thread is null. */
export function CommentThread({ controller, thread, target, label, onClose, autoFocus = true }: { controller: CommentsController; thread: PlanCommentThread | null; target: CommentTarget; label: string; onClose?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'send' | 'status' | null>(null);
  const can = controller.abilities(thread?.pillar ?? sheetPillar[target.sheet], thread?.scope);
  const resolved = !!thread?.resolvedAt;
  const mayWrite = thread ? can.reply && !resolved : can.start;
  const mayResolve = !!thread && !resolved && (can.resolveAny || (thread.mine && can.reply));
  const mayReopen = !!thread && resolved && can.reopen;
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim(); if (!body || busy) return;
    setBusy('send');
    const ok = thread ? await controller.reply(thread.id, body) : await controller.create(target.sheet, target.rowRef, target.columnId, body);
    setBusy(null);
    if (ok) setText('');
  }
  async function toggle() {
    if (!thread || busy) return;
    setBusy('status');
    const ok = await controller.setResolved(thread.id, !resolved);
    setBusy(null);
    if (ok && !resolved) onClose?.();
  }
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } };
  return <div className="wb-thread" data-resolved={resolved || undefined} data-ubec={(thread?.scope === 'ubec' && controller.scope === 'state') || undefined}>
    <div className="wb-thread-head">
      <p className="wb-thread-target" title={label}>{label}</p>
      {thread && <ScopeBadge thread={thread} viewer={controller.scope} />}
      {mayResolve && <Button size="xs" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => void toggle()}>{busy === 'status' ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}Resolve</Button>}
      {mayReopen && <Button size="xs" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => void toggle()}>{busy === 'status' ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}Reopen</Button>}
    </div>
    {thread?.orphaned && <p className="wb-thread-note">No longer in the plan</p>}
    {resolved && <p className="wb-thread-note">Resolved by {thread?.resolvedByName ?? 'a reviewer'} · {relativeTime(thread!.resolvedAt!)}</p>}
    {thread && <ol className="wb-thread-list" aria-label="Comments">{[thread, ...thread.replies].map(comment => <Entry key={comment.id} comment={comment} />)}</ol>}
    {mayWrite && !controller.readOnly && <form className="wb-thread-form" onSubmit={event => void submit(event)}>
      <Textarea aria-label={thread ? 'Reply' : 'Comment'} placeholder={thread ? 'Reply…' : 'Add a comment…'} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKey} maxLength={commentBodyLimit} autoFocus={autoFocus} disabled={busy === 'send'} rows={thread ? 2 : 3} />
      <div className="wb-thread-actions">
        {text.length > commentBodyLimit - 200 && <span className="wb-thread-limit">{text.length.toLocaleString()} / {commentBodyLimit.toLocaleString()}</span>}
        {onClose && <Button type="button" size="sm" variant="ghost" onClick={() => { if (thread && text) setText(''); else onClose(); }} disabled={busy === 'send'}>Cancel</Button>}
        <Button type="submit" size="sm" disabled={!text.trim() || busy === 'send'}>{busy === 'send' && <Spinner data-icon="inline-start" />}{thread ? 'Reply' : 'Comment'}</Button>
      </div>
    </form>}
    {!thread && !can.start && <p className="wb-thread-note">{controller.startHint}</p>}
    {thread?.scope === 'ubec' && controller.scope === 'state' && !controller.readOnly && resolved && <p className="wb-thread-note">Only UBEC can reopen a UBEC comment.</p>}
  </div>;
}
