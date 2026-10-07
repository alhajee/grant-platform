'use client';
import type { ReactNode } from 'react';
import { ChevronRightIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PanelMode } from './use-line-panel';
import { formatMoney } from './line-table';
import './line-panel.css';

/** The sticky top of the panel: the proposed total, the envelope meter and the view controls. */
export function PanelSummary({ label, total, meta, meter, children }: { label: string; total: ReactNode; meta?: ReactNode; meter?: ReactNode; children?: ReactNode }) {
  return <div className="line-panel-summary">
    <div className="line-panel-total"><span>{label}</span><strong>{total}</strong>{meta && <small>{meta}</small>}</div>
    {meter}
    {children}
  </div>;
}

/** "This activity | All activities" and the search box. */
export function PanelToolbar({ mode, onMode, focusLabel, allLabel, query, onQuery, searchLabel }: {
  mode: PanelMode; onMode: (mode: PanelMode) => void; focusLabel: string; allLabel: string; query: string; onQuery: (query: string) => void; searchLabel: string;
}) {
  return <div className="line-panel-toolbar">
    <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={value => { if (value) onMode(value as PanelMode); }} aria-label="Which items to show" className="line-panel-modes">
      <ToggleGroupItem value="focus">{focusLabel}</ToggleGroupItem>
      <ToggleGroupItem value="all">{allLabel}</ToggleGroupItem>
    </ToggleGroup>
    <div className="line-panel-search"><SearchIcon aria-hidden="true" /><Input type="search" aria-label={searchLabel} placeholder="Search saved items…" value={query} onChange={event => onQuery(event.target.value)} /></div>
  </div>;
}

type LineSectionProps = {
  title: ReactNode;
  /** Badges and hints beside the title (Required, info). */
  badges?: ReactNode;
  /** A muted line under the title, e.g. the activity's share of the budget. */
  note?: ReactNode;
  count: number;
  total: number;
  /** The activity chosen in the form: tinted and labelled. */
  selected: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

/** One activity's saved lines with its subtotal; the header folds the section away. */
export function LineSection({ title, badges, note, count, total, selected, open, onOpenChange, children }: LineSectionProps) {
  return <Collapsible open={open} onOpenChange={onOpenChange} asChild>
    <section className="line-section" data-selected={selected || undefined}>
      <header className="line-section-head">
        <CollapsibleTrigger className="line-section-toggle" aria-label={`${open ? 'Hide' : 'Show'} items`}>
          <ChevronRightIcon className="line-section-chevron" aria-hidden="true" />
        </CollapsibleTrigger>
        <div className="line-section-title">
          <h2>{title}{badges}</h2>
          {note && <p className="line-section-note">{note}</p>}
        </div>
        <div className="line-section-sum">
          {selected && <span className="line-section-flag">In the form</span>}
          <span className="line-section-count">{count} {count === 1 ? 'item' : 'items'}</span>
          <strong>{formatMoney(total)}</strong>
        </div>
      </header>
      <CollapsibleContent className="line-section-body">{children}</CollapsibleContent>
    </section>
  </Collapsible>;
}

/** An activity without lines, kept to one slim row. `onStart` chooses it in the form. */
export function EmptySection({ title, badges, selected, onStart, startLabel }: { title: ReactNode; badges?: ReactNode; selected: boolean; onStart?: () => void; startLabel: string }) {
  return <div className="line-section-empty" data-selected={selected || undefined}>
    <span className="line-section-empty-title">{title}{badges}</span>
    <span className="line-section-empty-note">{selected ? 'In the form · no items yet' : 'No items yet'}</span>
    {onStart && !selected && <Button type="button" variant="ghost" size="xs" onClick={onStart} aria-label={startLabel}><PlusIcon />Add</Button>}
  </div>;
}

/** The focused view when its activity has nothing saved yet. */
export function FocusEmpty({ title, others, onShowAll }: { title: ReactNode; others: number; onShowAll: () => void }) {
  return <div className="line-focus-empty">
    <p><strong>{title}</strong> has no saved items yet.</p>
    <p>Fill in the form to add the first one.{others > 0 && <> <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onShowAll}>Show all {others} {others === 1 ? 'item' : 'items'}</Button></>}</p>
  </div>;
}
