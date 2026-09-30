'use client';
import { useRef, useState } from 'react';
import { MessageSquare, MessageSquareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PlanCommentThread } from '@/lib/plan-comments';
import { CommentThread, ScopeBadge, relativeTime } from './comment-thread';
import type { SheetComments } from './comments-context';
import type { WorkbookSheet } from './types';

/** Toolbar "Comments" toggle and the side panel listing this sheet's threads. */
export function CommentsPanel({ sheet, comments, onNavigate }: { sheet: WorkbookSheet; comments: SheetComments; onNavigate: (thread: PlanCommentThread) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'open' | 'resolved'>('open');
  const [source, setSource] = useState<'all' | 'state' | 'ubec'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const pending = useRef<PlanCommentThread | null>(null);
  const viewer = comments.controller.scope;
  // The SUBEB workbook can mix its own threads with the ones UBEC shared; let reviewers pick either.
  const mixed = viewer === 'state' && comments.threads.some(t => t.scope === 'ubec');
  const inSource = comments.threads.filter(t => !mixed || source === 'all' || t.scope === source);
  const openThreads = inSource.filter(t => !t.resolvedAt), resolved = inSource.filter(t => t.resolvedAt);
  const allOpen = comments.threads.filter(t => !t.resolvedAt).length;
  const shown = filter === 'open' ? openThreads : resolved;
  const count = (scope: 'state' | 'ubec') => comments.threads.filter(t => t.scope === scope && (filter === 'open' ? !t.resolvedAt : t.resolvedAt)).length;
  const choose = (thread: PlanCommentThread) => {
    if (thread.orphaned) { setExpanded(expanded === thread.id ? null : thread.id); return; }
    pending.current = thread; setOpen(false);
  };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="outline" className="rounded-full wb-comments-toggle" aria-pressed={open} aria-label={`Comments, ${allOpen} open`}><MessageSquare data-icon="inline-start" />Comments{allOpen > 0 && <span className="wb-comments-count" aria-hidden="true">{allOpen}</span>}</Button></SheetTrigger>
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
        {mixed && <ToggleGroup type="single" variant="outline" size="sm" className="wb-comments-sources" value={source} onValueChange={value => { if (value) setSource(value as typeof source); }} aria-label="Show comments from">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="state">SUBEB · {count('state')}</ToggleGroupItem>
          <ToggleGroupItem value="ubec">UBEC · {count('ubec')}</ToggleGroupItem>
        </ToggleGroup>}
      </div>
      {!shown.length ? <div className="wb-comments-empty"><MessageSquareOff aria-hidden="true" /><p>{filter === 'open' ? `No open ${mixed && source === 'ubec' ? 'UBEC ' : ''}comments on this sheet.` : 'No resolved comments yet.'}</p>{filter === 'open' && comments.can.start && <p>Right-click a cell and choose Comment.</p>}</div> :
        <ul className="wb-comments-list">{shown.map(thread => <li key={thread.id} data-thread-id={thread.id}>
          <button type="button" className="wb-comments-item" data-ubec={(viewer === 'state' && thread.scope === 'ubec') || undefined} aria-expanded={thread.orphaned ? expanded === thread.id : undefined} onClick={() => choose(thread)}>
            <span className="wb-comments-target"><ScopeBadge thread={thread} viewer={viewer} />{thread.targetLabel}{thread.orphaned && <Badge variant="outline">No longer in the plan</Badge>}</span>
            <span className="wb-comments-body">{thread.body}</span>
            <span className="wb-comments-meta">{thread.authorName} · {relativeTime(thread.createdAt)}{thread.replies.length > 0 && ` · ${thread.replies.length} ${thread.replies.length === 1 ? 'reply' : 'replies'}`}</span>
          </button>
          {thread.orphaned && expanded === thread.id && <div className="wb-comments-inline"><CommentThread controller={comments.controller} thread={thread} target={{ sheet: thread.sheet, rowRef: thread.rowRef, columnId: thread.columnId, threadId: thread.id }} label={thread.targetLabel} autoFocus={false} /></div>}
        </li>)}</ul>}
    </SheetContent>
  </Sheet>;
}
