'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

const storageKey = 'plan-workbook-expanded';
const read = () => { try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; } };
const write = (value: boolean) => { try { if (value) sessionStorage.setItem(storageKey, '1'); else sessionStorage.removeItem(storageKey); } catch { /* storage blocked: session memory is optional */ } };
// A menu, popover or dialog that should receive Esc before the full-screen view does.
// Tooltips are ignored: they are not something the user is working in.
const layerOpen = () => !!document.querySelector('[data-radix-popper-content-wrapper]:not(:has([data-slot=tooltip-content])), [role=dialog][data-state=open], [role=alertdialog][data-state=open]');
const typing = (target: EventTarget | null) => { const el = target as HTMLElement | null; return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); };

/** Everything outside the workbook becomes inert while it is a modal full-screen view. */
function makeOutsideInert(root: HTMLElement) {
  const changed: HTMLElement[] = [];
  for (let node: HTMLElement | null = root; node && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert || sibling.matches('script, style, [data-sonner-toaster], section[aria-label^="Notifications"]')) continue;
      sibling.inert = true; changed.push(sibling);
    }
  }
  return () => { for (const element of changed) element.inert = false; };
}

/**
 * Full-screen state for the plan workbook. The same element is restyled (fixed position) rather than
 * re-mounted, so sheet, selection, filters, sort, widths and open threads all carry over.
 */
export function useExpandedWorkbook(slotRef: RefObject<HTMLDivElement | null>, buttonRef: RefObject<HTMLButtonElement | null>) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState<number | undefined>();
  const returnFocus = useRef(false);
  const set = useCallback((next: boolean) => {
    if (next) setHeight(slotRef.current?.getBoundingClientRect().height);
    returnFocus.current = !next; setExpanded(next); write(next);
  }, [slotRef]);
  // Restore the session's last choice once the workbook is on screen.
  useLayoutEffect(() => { if (read()) set(true); }, [set]);

  useEffect(() => {
    if (!expanded) {
      if (returnFocus.current) { returnFocus.current = false; buttonRef.current?.focus({ preventScroll: true }); }
      return;
    }
    const root = slotRef.current; if (!root) return;
    const html = document.documentElement, previous = html.style.overflow;
    html.style.overflow = 'hidden';
    const restore = makeOutsideInert(root);
    if (!root.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !layerOpen()) { event.preventDefault(); set(false); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); restore(); html.style.overflow = previous; };
  }, [expanded, set, slotRef, buttonRef]);

  /** `F` toggles full screen from anywhere inside the workbook except text fields. */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || typing(event.target)) return;
    if (!(event.currentTarget as HTMLElement).contains(event.target as Node)) return;
    event.preventDefault(); set(!expanded);
  };
  return { expanded, setExpanded: set, placeholderHeight: expanded ? height : undefined, onKeyDown };
}
