'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ListFilterIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const COLLAPSE_DELAY_MS = 250;

// Faceted filters inside the group report when their popover is open (so the group stays expanded while
// the pointer is over the portalled option list) and hide themselves while unused and not engaged.
type FilterGroupState = { report: (open: boolean) => void; engaged: boolean };
const FilterGroupContext = createContext<FilterGroupState | null>(null);
export const useFilterGroup = () => useContext(FilterGroupContext);

/**
 * A "Filter" chip that expands to reveal its filters on hover, focus or tap. At rest it shows only the
 * filters in use (and Reset), so idle filters take no room in the toolbar.
 */
export function DataTableFilterGroup({ activeCount, onReset, children }: { activeCount: number; onReset?: () => void; children: ReactNode }) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [pinned, setPinned] = useState(false), [openPopovers, setOpenPopovers] = useState(0);
  const timer = useRef<number | null>(null);
  const cancel = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => cancel, []);
  const reportPopover = useCallback((open: boolean) => setOpenPopovers(count => Math.max(0, count + (open ? 1 : -1))), []);
  const engaged = hovered || focused || pinned || openPopovers > 0, expanded = engaged || activeCount > 0;
  const context = useMemo(() => ({ report: reportPopover, engaged }), [reportPopover, engaged]);
  return <FilterGroupContext.Provider value={context}>
    {/* The outer box takes the remaining toolbar width so the chips wrap beside the search box; only
        the chips themselves respond to hover. */}
    <div className="flex min-w-[min(100%,20rem)] flex-1">
    <div
      className="relative flex min-w-0 max-w-full flex-wrap items-center gap-2"
      data-expanded={expanded || undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse') { cancel(); setHovered(true); } }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') { cancel(); timer.current = window.setTimeout(() => setHovered(false), COLLAPSE_DELAY_MS); } }}
      // Keyboard focus opens the group; clicks are handled by the chip itself.
      onFocus={event => { if (event.target.matches(':focus-visible')) setFocused(true); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <Button type="button" variant="outline" size="sm" className="rounded-full" aria-expanded={engaged} onClick={() => setPinned(value => !value)}>
        <ListFilterIcon data-icon="inline-start" />Filter
        {activeCount > 0 && <Badge className="h-5 min-w-5 justify-center rounded-full px-1 tabular-nums">{activeCount}</Badge>}
      </Button>
      <div
        className={cn(expanded ? 'contents *:animate-in *:fade-in-0 *:slide-in-from-left-1 *:duration-200 motion-reduce:*:animate-none' : 'hidden')}
        aria-hidden={!expanded || undefined}
      >
        {children}
        {activeCount > 0 && onReset && <Button type="button" variant="ghost" size="sm" onClick={onReset}>Reset<XIcon data-icon="inline-end" /></Button>}
      </div>
    </div>
    </div>
  </FilterGroupContext.Provider>;
}
