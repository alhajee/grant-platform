'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ListFilterIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const COLLAPSE_DELAY_MS = 250;

// Each filter is rendered in two places: inline next to the chip while it is in use, and in the
// floating panel while it is not. Filters also report when their option list is open, so the panel
// stays up while the pointer is over the (portalled) list.
type FilterGroupState = { report: (open: boolean) => void; place: 'inline' | 'panel' };
const FilterGroupContext = createContext<FilterGroupState | null>(null);
export const useFilterGroup = () => useContext(FilterGroupContext);

/**
 * A "Filter" chip for table toolbars. Filters in use sit inline next to it (with Reset); hovering,
 * keyboard focus or a tap opens a floating panel with the unused ones, so idle filters take no room
 * and nothing on the page shifts.
 */
export function DataTableFilterGroup({ activeCount, filterCount, onReset, children }: { activeCount: number; filterCount: number; onReset?: () => void; children: ReactNode }) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [pinned, setPinned] = useState(false), [openPopovers, setOpenPopovers] = useState(0);
  const timer = useRef<number | null>(null), root = useRef<HTMLDivElement>(null);
  // Focus can end up on <body> when a closed list returns it to a filter that has since moved; re-check.
  const syncFocus = useCallback(() => { const active = document.activeElement; setFocused(!!active && !!root.current?.contains(active) && active.matches(':focus-visible')); }, []);
  const cancel = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => cancel, []);
  // The pointer may leave through a portalled option list without a pointerleave on the group, so
  // re-read the real hover and focus state whenever a list closes.
  const report = useCallback((open: boolean) => {
    setOpenPopovers(count => Math.max(0, count + (open ? 1 : -1)));
    if (!open) window.setTimeout(() => { setHovered(!!root.current?.matches(':hover')); syncFocus(); }, 0);
  }, [syncFocus]);
  const engaged = hovered || focused || pinned || openPopovers > 0;
  const inline = useMemo(() => ({ report, place: 'inline' as const }), [report]);
  const panel = useMemo(() => ({ report, place: 'panel' as const }), [report]);
  const showPanel = engaged && (activeCount < filterCount || openPopovers > 0);
  return <div className="flex min-w-[min(100%,20rem)] flex-1">
    <div
      ref={root}
      className="relative flex min-w-0 max-w-full flex-wrap items-center gap-2"
      onPointerEnter={event => { if (event.pointerType === 'mouse') { cancel(); setHovered(true); } }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') { cancel(); timer.current = window.setTimeout(() => { setHovered(false); syncFocus(); }, COLLAPSE_DELAY_MS); } }}
      // Keyboard focus opens the panel; clicks are handled by the chip itself.
      onFocus={event => { if (event.target.matches(':focus-visible')) setFocused(true); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
      onKeyDown={event => { if (event.key === 'Escape' && !openPopovers) { setPinned(false); setFocused(false); } }}
    >
      <Button type="button" variant="outline" size="sm" className="rounded-full" aria-expanded={showPanel} onClick={() => setPinned(value => !value)}>
        <ListFilterIcon data-icon="inline-start" />Filter
        {activeCount > 0 && <Badge className="h-5 min-w-5 justify-center rounded-full px-1 tabular-nums">{activeCount}</Badge>}
      </Button>
      <FilterGroupContext.Provider value={inline}>{children}</FilterGroupContext.Provider>
      {activeCount > 0 && onReset && <Button type="button" variant="ghost" size="sm" onClick={onReset}>Reset<XIcon data-icon="inline-end" /></Button>}
      {/* Floating panel: absolutely positioned so it never pushes the page; the top padding bridges the
          gap from the chip so the pointer can travel into it. */}
      {showPanel && <div className="absolute top-full left-0 z-40 pt-2 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
        {/* Soft halo: blurs what is just around the panel, fading out at its edges. */}
        <div aria-hidden="true" className="pointer-events-none absolute -inset-x-4 top-0 -bottom-4 rounded-[2rem] backdrop-blur-[3px] [mask-image:radial-gradient(closest-side,#000_70%,transparent)]" />
        <div role="group" aria-label="More filters" className="relative flex w-max max-w-[min(36rem,calc(100vw-2rem))] flex-wrap gap-2 rounded-2xl border border-white/60 bg-popover/75 p-2 text-popover-foreground shadow-lg backdrop-blur-md backdrop-saturate-150">
          <FilterGroupContext.Provider value={panel}>{children}</FilterGroupContext.Provider>
        </div>
      </div>}
    </div>
  </div>;
}
