'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, MessageSquare, Minimize2, Sheet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatQuarters } from '@/lib/format-quarters';
import { CommentsProvider, type CommentsController } from './comments-context';
import { useExpandedWorkbook } from './use-expanded';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Snapshot } from '@/lib/plan-review';
import { buildSheets, detailExportSheets, type SheetLinks } from './sheets';
import { SheetView, type DownloadRequest } from './sheet-view';
import type { SheetKey, WorkbookSheet } from './types';
import { sheetPillar } from '@/lib/plan-comments';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import '../plan-workbook.css';

const hashSheet = (hash: string, sheets: WorkbookSheet[]) => sheets.find(s => `#${s.hash}` === hash)?.key;

/** Read-only, Excel-inspired view of a plan: one sheet per visible component. Editing stays in the editors. */
export type RequestChangesHandlers = Partial<Record<ImplementedPillar, () => void>>;

export function PlanWorkbook({ snapshot, visiblePillars, links, comments = null, requestChanges = {} }: { snapshot: Snapshot; visiblePillars: readonly string[]; links: SheetLinks; comments?: CommentsController | null; requestChanges?: RequestChangesHandlers }) {
  const { infrastructureEditHref, sportsEditHref, sbmcEditHref, tlmEditHref, monitoringEditHref, gscciEditHref, curriculumEditHref, qualityEditHref, ictEditHref, teachersEditHref } = links;
  const sheets = useMemo(() => buildSheets(snapshot, visiblePillars, { infrastructureEditHref, sportsEditHref, sbmcEditHref, tlmEditHref, monitoringEditHref, gscciEditHref, curriculumEditHref, qualityEditHref, ictEditHref, teachersEditHref }), [snapshot, visiblePillars, infrastructureEditHref, sportsEditHref, sbmcEditHref, tlmEditHref, monitoringEditHref, gscciEditHref, curriculumEditHref, qualityEditHref, ictEditHref, teachersEditHref]);
  const cardRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const { expanded, setExpanded, placeholderHeight, onKeyDown } = useExpandedWorkbook(slotRef, expandRef);
  const [active, setActive] = useState<SheetKey | undefined>(() => typeof window === 'undefined' ? undefined : hashSheet(window.location.hash, sheets));
  const [visited, setVisited] = useState<ReadonlySet<SheetKey>>(() => new Set());
  const current = sheets.find(s => s.key === active)?.key ?? sheets[0]?.key;
  if (current && !visited.has(current)) setVisited(new Set([...visited, current]));

  // #review-<sheet> deep links select that sheet and bring the workbook into view.
  useEffect(() => {
    const apply = (scroll: boolean) => {
      const key = hashSheet(window.location.hash, sheets); if (!key) return;
      setActive(key);
      if (scroll) requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: 'start' }));
    };
    apply(true);
    const onHash = () => apply(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [sheets]);

  // Keep the active sheet tab visible in the horizontally scrolling tab row (mobile).
  useEffect(() => {
    const strip = cardRef.current?.querySelector<HTMLElement>('.plan-workbook-tabs-scroll');
    const tab = strip?.querySelector<HTMLElement>('[data-slot=tabs-trigger][data-state=active]');
    if (!strip || !tab) return;
    const left = tab.offsetLeft - strip.offsetLeft, right = left + tab.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, left - 16);
  }, [current]);

  if (!sheets.length || !current) return null;
  const select = (value: string) => {
    const sheet = sheets.find(s => s.key === value); if (!sheet) return;
    setActive(sheet.key);
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#${sheet.hash}`);
  };
  const baseName = snapshot.setup?.beapName || 'BEAP';
  const setup = snapshot.setup, title = setup?.implementationYear ? `${setup.implementationYear}${setup.fundingQuarters?.length ? ` ${formatQuarters(setup.fundingQuarters)}` : ''} BEAP` : 'BEAP';
  // Tab chips: the viewer's own open threads, and on the SUBEB workbook a separate count of shared UBEC threads.
  const openComments = (key: SheetKey, scope = comments?.scope) => comments?.threads.filter(t => t.sheet === key && !t.resolvedAt && t.scope === scope).length ?? 0;
  const plural = (n: number, word: string) => `${n} open ${word}${n === 1 ? '' : 's'}`;
  const download: DownloadRequest = async (scope, view) => {
    const { downloadWorkbook } = await import('./export-xlsx');
    const sheet = sheets.find(s => s.key === current)!;
    if (scope === 'sheet') return downloadWorkbook(`${baseName} - ${sheet.label}.xlsx`, [{ name: sheet.label, columns: sheet.columns, rows: view?.rows ?? sheet.rows }]);
    return downloadWorkbook(`${baseName} - workbook.xlsx`, [...sheets.map(s => ({ name: s.label, columns: s.columns, rows: s.rows })), ...detailExportSheets(snapshot, sheets)]);
  };
  const label = expanded ? 'Exit full screen' : 'Expand workbook';
  return <CommentsProvider value={comments}><div ref={slotRef} className="plan-workbook-slot" style={placeholderHeight ? { height: placeholderHeight } : undefined}>
    {expanded && <div className="plan-workbook-backdrop" aria-hidden="true" onClick={() => setExpanded(false)} />}
    <Card ref={cardRef} className="plan-workbook" data-expanded={expanded || undefined} onKeyDown={onKeyDown} {...(expanded ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Plan workbook — full screen' } : { 'aria-labelledby': 'plan-workbook-title' })}>
    {sheets.map(s => <span key={s.key} id={s.hash} className="plan-workbook-anchor" aria-hidden="true" />)}
    <div className="plan-workbook-heading"><h2 id="plan-workbook-title"><Sheet aria-hidden="true" />{expanded ? <>{title}<span className="plan-workbook-title-sep" aria-hidden="true">·</span>Plan workbook</> : 'Plan workbook'}</h2>
      <div className="plan-workbook-heading-end">{sheets.some(s => s.editHref) && !expanded && <p>Use the edit buttons to change entries.</p>}
        <Tooltip><TooltipTrigger asChild><Button ref={expandRef} variant="ghost" size="icon-sm" className="plan-workbook-expand" aria-label={label} aria-keyshortcuts="F" onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button></TooltipTrigger>
          <TooltipContent side="bottom" onEscapeKeyDown={event => { if (expanded) { event.preventDefault(); setExpanded(false); } }}>{label} <kbd className="plan-workbook-kbd">F</kbd></TooltipContent></Tooltip></div></div>
    <Tabs value={current} onValueChange={select} className="plan-workbook-tabs-root gap-0">
      <div className="plan-workbook-tabs-scroll"><TabsList variant="line" className="admin-section-tabs plan-workbook-tabs" aria-label="Plan workbook sheets">
        {sheets.map(s => { const open = openComments(s.key), ubec = comments?.scope === 'state' ? openComments(s.key, 'ubec') : 0; return <TabsTrigger key={s.key} value={s.key}><s.icon aria-hidden="true" />{s.label}<Badge className="plan-workbook-count" aria-label={`${s.rows.length} rows`}>{s.rows.length}</Badge>{open > 0 && <Badge className="plan-workbook-comments" aria-label={plural(open, 'comment')} title={plural(open, 'comment')}><MessageSquare aria-hidden="true" />{open}</Badge>}{ubec > 0 && <Badge className="plan-workbook-ubec-count" aria-label={plural(ubec, 'UBEC comment')} title={plural(ubec, 'UBEC comment')}>UBEC {ubec}</Badge>}</TabsTrigger>; })}
      </TabsList></div>
      {sheets.map(s => <TabsContent key={s.key} value={s.key} forceMount hidden={s.key !== current} className="plan-workbook-panel">
        <SheetView sheet={s} visited={visited.has(s.key)} onDownload={download} onRequestChanges={requestChanges[sheetPillar[s.key]]} />
      </TabsContent>)}
    </Tabs>
  </Card></div></CommentsProvider>;
}
