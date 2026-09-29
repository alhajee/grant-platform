'use client';
import { useRef, useState } from 'react';
import { MessageSquare, MessageSquareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PlanCommentThread } from '@/lib/plan-comments';
import { CommentThread, relativeTime } from './comment-thread';
import type { SheetComments } from './comments-context';
import type { WorkbookSheet } from './types';

/** Toolbar "Comments" toggle and the side panel listing this sheet's threads. */
export function CommentsPanel({ sheet, comments, onNavigate }: { sheet: WorkbookSheet; comments: SheetComments; onNavigate: (thread: PlanCommentThread) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'open' | 'resolved'>('open');
  const [expanded, setExpanded] = useState<number | null>(null);
  const pending = useRef<PlanCommentThread | null>(null);
  const openThreads = comments.threads.filter(t => !t.resolvedAt), resolved = comments.threads.filter(t => t.resolvedAt);
  const shown = filter === 'open' ? openThreads : resolved;
  const choose = (thread: PlanCommentThread) => {
    if (thread.orphaned) { setExpanded(expanded === thread.id ? null : thread.id); return; }
    pending.current = thread; setOpen(false);
  };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="outline" className="rounded-full wb-comments-toggle" aria-pressed={open} aria-label={`Comments, ${openThreads.length} open`}><MessageSquare data-icon="inline-start" />Comments{openThreads.length > 0 && <span className="wb-comments-count" aria-hidden="true">{openThreads.length}</span>}</Button></SheetTrigger>
    <SheetContent side="right" className="wb-comments-panel" onCloseAutoFocus={event => {
      const thread = pending.current; pending.current = null;
      if (thread) { event.preventDefault(); onNavigate(thread); }
    }}>
      <SheetHeader><SheetTitle>Comments</SheetTitle><SheetDescription>{sheet.label} sheet</SheetDescription></SheetHeader>
      <div className="wb-comments-filter">
        <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={value => { if (value) setFilter(value as 'open' | 'resolved'); }} aria-label="Show comments">
          <ToggleGroupItem value="open">Open · {openThreads.length}</ToggleGroupItem>
          <ToggleGroupItem value="resolved">Resolved · {resolved.length}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {!shown.length ? <div className="wb-comments-empty"><MessageSquareOff aria-hidden="true" /><p>{filter === 'open' ? 'No open comments on this sheet.' : 'No resolved comments yet.'}</p>{filter === 'open' && comments.can.start && <p>Right-click a cell and choose Comment.</p>}</div> :
        <ul className="wb-comments-list">{shown.map(thread => <li key={thread.id} data-thread-id={thread.id}>
          <button type="button" className="wb-comments-item" aria-expanded={thread.orphaned ? expanded === thread.id : undefined} onClick={() => choose(thread)}>
            <span className="wb-comments-target">{thread.targetLabel}{thread.orphaned && <Badge variant="outline">No longer in the plan</Badge>}</span>
            <span className="wb-comments-body">{thread.body}</span>
            <span className="wb-comments-meta">{thread.authorName} · {relativeTime(thread.createdAt)}{thread.replies.length > 0 && ` · ${thread.replies.length} ${thread.replies.length === 1 ? 'reply' : 'replies'}`}</span>
          </button>
          {thread.orphaned && expanded === thread.id && <div className="wb-comments-inline"><CommentThread controller={comments.controller} thread={thread} target={{ sheet: thread.sheet, rowRef: thread.rowRef, columnId: thread.columnId, threadId: thread.id }} label={thread.targetLabel} autoFocus={false} /></div>}
        </li>)}</ul>}
    </SheetContent>
  </Sheet>;
}
