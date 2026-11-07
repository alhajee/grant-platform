'use client';

import { CircleAlertIcon, PencilIcon, SendHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { activityLabel, type ActivityLine, type ActivityWorkstream } from '@/lib/activity-plans';
import { nairaFormat } from '@/lib/money-format';
import { MONEY_SCALE_NUMBER, lineMinor as lineMinorOf } from '@/lib/money';

export interface ComponentSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workstream: ActivityWorkstream;
  title: string;
  lines: readonly ActivityLine[];
  /** The component's ceiling in naira, or null while the plan funding or split is not set. */
  envelope: number | null;
  /** Schools on the distribution list (TLM, Curriculum, Greening), or null for components without one. */
  distribution: number | null;
  /** Required activities that still have no item. */
  missing: readonly string[];
  /** UBEC239: why the component has nothing to send (the budget split gives it ₦0), or null. */
  unfunded?: string | null;
  onContinue: () => void;
}

const lineMinor = (line: ActivityLine) => Number(lineMinorOf(line.unitCost, line.quantity));

/**
 * UBEC107: Review & send first shows what the component holds (items per activity, total against the ceiling, the
 * distribution list) so the officer can check it. Continue opens the send step on the plan page, which asks for
 * confirmation before anything moves.
 */
export function ComponentSummaryDialog({ open, onOpenChange, workstream, title, lines, envelope, distribution, missing, unfunded, onContinue }: ComponentSummaryProps) {
  const groups = [...lines.reduce((map, line) => {
    const label = activityLabel(workstream, line.activity, line.customActivity), entry = map.get(label) ?? { items: 0, minor: 0 };
    return map.set(label, { items: entry.items + 1, minor: entry.minor + lineMinor(line) });
  }, new Map<string, { items: number; minor: number }>())];
  const total = lines.reduce((sum, line) => sum + lineMinor(line), 0) / MONEY_SCALE_NUMBER;
  const left = envelope === null ? null : envelope - total;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="component-summary sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Check {title} before sending</DialogTitle>
        <DialogDescription>Make sure everything below is correct</DialogDescription>
      </DialogHeader>
      <dl className="component-summary-figures">
        <div><dt>Items</dt><dd>{lines.length}</dd></div>
        <div><dt>Total</dt><dd>{nairaFormat.format(total)}</dd></div>
        {envelope !== null && <div><dt>Ceiling</dt><dd>{nairaFormat.format(envelope)}</dd></div>}
        {left !== null && <div data-over={left < 0 || undefined}><dt>{left < 0 ? 'Over' : 'Left'}</dt><dd>{nairaFormat.format(Math.abs(left))}</dd></div>}
        {distribution !== null && <div data-over={!distribution || undefined}><dt>Distribution schools</dt><dd>{distribution}</dd></div>}
      </dl>
      {groups.length ? <div className="component-summary-table"><Table>
        <TableHeader><TableRow><TableHead>Activity</TableHead><TableHead className="text-right">Items</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
        <TableBody>{groups.map(([label, group]) => <TableRow key={label}><TableCell className="whitespace-normal">{label}</TableCell><TableCell className="text-right tabular-nums">{group.items}</TableCell><TableCell className="text-right tabular-nums">{nairaFormat.format(group.minor / MONEY_SCALE_NUMBER)}</TableCell></TableRow>)}</TableBody>
        <TableFooter><TableRow><TableCell>Total</TableCell><TableCell className="text-right tabular-nums">{lines.length}</TableCell><TableCell className="text-right tabular-nums">{nairaFormat.format(total)}</TableCell></TableRow></TableFooter>
      </Table></div> : <p className="text-sm text-muted-foreground">No items saved yet</p>}
      {unfunded && <Alert className="component-summary-missing"><CircleAlertIcon /><AlertTitle>Nothing to send</AlertTitle><AlertDescription>{unfunded}</AlertDescription></Alert>}
      {!unfunded && missing.length > 0 && <Alert className="component-summary-missing"><CircleAlertIcon /><AlertTitle>Required activities without items</AlertTitle><AlertDescription>{missing.join(' · ')}</AlertDescription></Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}><PencilIcon data-icon="inline-start" />Keep editing</Button>
        <Button type="button" disabled={!lines.length} onClick={onContinue}><SendHorizontalIcon data-icon="inline-start" />Continue to send</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
