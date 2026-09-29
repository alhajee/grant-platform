'use client';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { threadKey } from '@/lib/plan-comments';
import { CommentThread } from './comment-thread';
import type { SheetComments } from './comments-context';
import type { WorkbookSheet } from './types';

const selectorFor = (rowRef: string, columnId: string | null) => columnId ? `[data-cell-key="${CSS.escape(`${rowRef}:${columnId}`)}"]` : `[data-row-key="${CSS.escape(rowRef)}"]`;
type Preview = { id: number; rect: DOMRect };

/** Thread popover anchored at the commented cell (or row gutter) plus a hover/focus preview. */
export function CommentLayer({ sheet, comments, scrollRef, labelFor }: { sheet: WorkbookSheet; comments: SheetComments; scrollRef: RefObject<HTMLDivElement | null>; labelFor: (rowRef: string, columnId: string | null) => string }) {
  const { controller } = comments;
  const active = controller.active?.sheet === sheet.key ? controller.active : null;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickedAway = useRef(false);

  // Resolve the anchor element after render; a filtered-out row simply has no popover.
  useLayoutEffect(() => {
    const element = active ? scrollRef.current?.querySelector<HTMLElement>(selectorFor(active.rowRef, active.columnId)) ?? null : null;
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setAnchor(element);
  }, [active, scrollRef, sheet.rows]);

  // Hover (after a short delay) or keyboard focus on a commented cell shows a short preview.
  useEffect(() => {
    const element = scrollRef.current; if (!element) return;
    const show = (target: EventTarget | null, delay: number) => {
      clearTimeout(timer.current);
      const cell = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-comment-id]');
      if (!cell) { setPreview(null); return; }
      timer.current = setTimeout(() => setPreview({ id: Number(cell.dataset.commentId), rect: cell.getBoundingClientRect() }), delay);
    };
    const over = (event: PointerEvent) => { if (event.pointerType === 'mouse') show(event.target, 350); };
    const focus = (event: FocusEvent) => show(event.target, 0);
    const hide = () => { clearTimeout(timer.current); setPreview(null); };
    element.addEventListener('pointerover', over); element.addEventListener('focusin', focus);
    element.addEventListener('pointerleave', hide); element.addEventListener('focusout', hide); element.addEventListener('scroll', hide, { passive: true });
    return () => { hide(); element.removeEventListener('pointerover', over); element.removeEventListener('focusin', focus); element.removeEventListener('pointerleave', hide); element.removeEventListener('focusout', hide); element.removeEventListener('scroll', hide); };
  }, [scrollRef]);

  const thread = active ? (active.threadId ? comments.threads.find(t => t.id === active.threadId) : undefined) ?? comments.open.get(threadKey(active)) ?? null : null;
  // Phones: open below the cell so the thread can shift fully into view.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;
  const previewThread = preview && !anchor ? comments.threads.find(t => t.id === preview.id) : undefined;
  const close = () => {
    const cell = anchor, away = clickedAway.current; clickedAway.current = false; controller.setActive(null);
    // Return focus to the cell for Esc/Cancel; a click elsewhere keeps the new focus.
    if (!away) requestAnimationFrame(() => (cell?.matches('[role=gridcell]') ? cell : scrollRef.current?.querySelector<HTMLElement>('[tabindex="0"][role=gridcell]'))?.focus({ preventScroll: true }));
  };
  return <>
    <Popover open={!!active && !!anchor} onOpenChange={open => { if (!open) close(); }}>
      {anchor && <PopoverAnchor virtualRef={{ current: anchor }} />}
      {active && anchor && <PopoverContent side={narrow ? 'bottom' : 'right'} align="start" sideOffset={narrow ? 4 : 6} collisionPadding={12} className="wb-thread-popover" aria-label={`Comments on ${labelFor(active.rowRef, active.columnId)}`}
        onCloseAutoFocus={event => event.preventDefault()} onPointerDownOutside={() => { clickedAway.current = true; }}>
        <CommentThread key={`${threadKey(active)}:${thread?.id ?? 'new'}`} controller={controller} thread={thread} target={active} label={thread?.targetLabel ?? labelFor(active.rowRef, active.columnId)} onClose={close} />
      </PopoverContent>}
    </Popover>
    {previewThread && preview && typeof document !== 'undefined' && createPortal(<div role="tooltip" className="wb-comment-preview" style={{ top: Math.max(8, preview.rect.top), left: Math.min(window.innerWidth - 288, preview.rect.right + 6) }}>
      <strong>{previewThread.authorName}</strong><span>{previewThread.body.length > 140 ? `${previewThread.body.slice(0, 139)}…` : previewThread.body}</span>
      {previewThread.replies.length > 0 && <em>{previewThread.replies.length} {previewThread.replies.length === 1 ? 'reply' : 'replies'}</em>}
    </div>, document.body)}
  </>;
}
