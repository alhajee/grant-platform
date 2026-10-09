'use client';
import { Fragment, useState, type ReactNode } from 'react';
import { CircleAlertIcon, EyeIcon, PaperclipIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { QuarterBadge } from '@/components/quarter-timeline';
import { InlineCell } from './inline-cell';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const count = new Intl.NumberFormat('en-NG');
export const lineAmount = (line: { quantity: number; unitCost: number }) => Math.round(line.unitCost * 100) * line.quantity / 100;
export const formatMoney = (value: number) => money.format(value);

export type InlineField = 'quantity' | 'unitCost' | 'description';

/** One saved line as the panel shows it; each editor maps its own lines to this. */
export type PanelLine = {
  id: number;
  /** Names the line in labels ("Edit Exercise books"). */
  label: string;
  /** A heading above the description, e.g. the name of an "Others" activity. */
  heading?: ReactNode;
  /** The free-text description; inline-editable when the table allows it. */
  description: string;
  /** Muted detail under the description: targeting, extras, school and document counts. */
  details?: ReactNode;
  /** Badges after the details, e.g. "Proforma needed". */
  badges?: ReactNode;
  /** How many documents are attached to the line (shown as a paperclip count when above zero). */
  attachments?: number;
  code?: string;
  quarters?: readonly number[];
  quantity: number;
  unitCost: number;
};

type LineTableProps = {
  lines: readonly PanelLine[];
  itemLabel: string;
  quantityLabel?: string;
  /** Inline editing of quantity and unit cost (and the description when `describe`). */
  editable: boolean;
  describe: boolean;
  /** A reason a single line cannot be edited in place right now (e.g. open in the form with unsaved changes). */
  lockReason?: (id: number) => string | null;
  /** Edit and Remove are unavailable (read-only, busy). */
  actionsDisabled: boolean;
  /** Read-only viewers may still open a line in the (disabled) form to see all of it. */
  viewOnly?: boolean;
  selectedId?: number;
  flashId?: number | null;
  onSave: (id: number, field: InlineField, value: string) => Promise<string | null>;
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
};

/** Saved lines with consistent columns; rows open in the form, number cells edit in place. Narrow panels stack rows into cards. */
export function LineTable({ lines, itemLabel, quantityLabel = 'Qty', editable, describe, lockReason, actionsDisabled, viewOnly = false, selectedId, flashId, onSave, onEdit, onRemove }: LineTableProps) {
  // A refused cell's reason reads across the whole row beneath it, not squeezed into a number column.
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(() => new Map());
  const report = (id: number) => (message: string) => setErrors(current => {
    if ((current.get(id) ?? '') === message) return current;
    const next = new Map(current);
    if (message) next.set(id, message); else next.delete(id);
    return next;
  });
  return <Table className="line-table">
    <colgroup><col /><col className="line-col-timeline" /><col className="line-col-qty" /><col className="line-col-money" /><col className="line-col-money" /><col className="line-col-actions" /></colgroup>
    <TableHeader><TableRow>
      <TableHead>{itemLabel}</TableHead><TableHead>Timeline</TableHead><TableHead className="text-right">{quantityLabel}</TableHead>
      <TableHead className="text-right">Unit cost</TableHead><TableHead className="text-right">Amount</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
    </TableRow></TableHeader>
    <TableBody>{lines.map(line => {
      const locked = lockReason?.(line.id) ?? null;
      const open = () => { if (!actionsDisabled || viewOnly) onEdit(line.id); };
      const verb = viewOnly ? 'View' : 'Edit', error = errors.get(line.id);
      return <Fragment key={line.id}><TableRow className="line-row" data-line-row={line.id} tabIndex={0} aria-selected={selectedId === line.id}
        data-state={selectedId === line.id ? 'selected' : undefined} data-flash={flashId === line.id || undefined} data-error={error ? true : undefined}
        aria-label={`${line.label}. Press Enter to ${verb.toLowerCase()} it in the form`} onClick={open}
        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }}>
        <TableCell className="line-item">
          {line.heading && <strong className="line-heading">{line.heading}</strong>}
          {describe
            ? <InlineCell kind="text" value={line.description} format={value => value} label={`Description of ${line.label}`} editable={editable} lockedReason={locked} onSave={value => onSave(line.id, 'description', value)} onError={report(line.id)} className="line-description" />
            : <div className="line-description">{line.description}</div>}
          {line.details && <div className="line-details">{line.details}</div>}
          {(line.badges || Boolean(line.attachments)) && <div className="line-badges">
            {Boolean(line.attachments) && <span className="line-attachments" title={`${line.attachments} document${line.attachments === 1 ? '' : 's'} attached`}><PaperclipIcon aria-hidden="true" />{line.attachments}<span className="sr-only"> document{line.attachments === 1 ? '' : 's'} attached</span></span>}
            {line.badges}
          </div>}
          {line.code && <p className="line-code" title="Reference code">{line.code}</p>}
        </TableCell>
        <TableCell className="line-timeline" data-label="Timeline"><QuarterBadge quarters={line.quarters} /></TableCell>
        <TableCell className="line-number line-qty" data-label={quantityLabel}>
          <InlineCell kind="integer" value={String(line.quantity)} format={value => count.format(Number(value))} label={`${quantityLabel} for ${line.label}`} editable={editable} lockedReason={locked} onSave={value => onSave(line.id, 'quantity', value)} onError={report(line.id)} />
        </TableCell>
        <TableCell className="line-number line-unit" data-label="Unit cost">
          <InlineCell kind="money" value={String(line.unitCost)} format={value => money.format(Number(value))} label={`Unit cost for ${line.label}`} editable={editable} lockedReason={locked} onSave={value => onSave(line.id, 'unitCost', value)} onError={report(line.id)} />
        </TableCell>
        <TableCell className="line-number line-amount" data-label="Amount">{money.format(lineAmount(line))}</TableCell>
        <TableCell className="line-actions-cell" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <div className="line-actions">
            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" disabled={actionsDisabled && !viewOnly} aria-label={`${verb} ${line.label} in the form`} onClick={() => onEdit(line.id)}>{viewOnly ? <EyeIcon /> : <PencilIcon />}</Button></TooltipTrigger><TooltipContent side="top">{verb} in the form</TooltipContent></Tooltip>
            {!viewOnly && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="line-remove" disabled={actionsDisabled} aria-label={`Remove ${line.label}`} onClick={() => onRemove(line.id)}><Trash2Icon /></Button></TooltipTrigger><TooltipContent side="top">Remove</TooltipContent></Tooltip>}
          </div>
        </TableCell>
      </TableRow>
      {error && <TableRow className="line-error-row"><TableCell colSpan={6}><p role="alert"><CircleAlertIcon aria-hidden="true" />{error}</p></TableCell></TableRow>}
      </Fragment>;
    })}</TableBody>
  </Table>;
}
