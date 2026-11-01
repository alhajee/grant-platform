"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activityLabel, allocateByEnrolment, type ActivityLine, type ActivityWorkstream, type DistributionSchool } from "@/lib/activity-plans";
import { isDistributedLine } from "@/lib/distribution-lists";
import { currentPlanHref } from "@/lib/action-plans";
import { nairaFormat } from "@/lib/money-format";

const count = new Intl.NumberFormat("en-NG");
const allocatedOf = (line: ActivityLine) => Object.values(line.allocations ?? {}).reduce((sum, q) => sum + q, 0);
const itemName = (workstream: ActivityWorkstream, line: ActivityLine) => line.description.trim() || activityLabel(workstream, line.activity, line.customActivity);

/** UBEC161/163: what each listed school gets across the items: the number of items and their value (items × unit cost). */
export function schoolItems(workstream: ActivityWorkstream, lines: readonly ActivityLine[]) {
  const totals = new Map<number, { items: number; value: number }>();
  for (const line of lines) {
    if (!isDistributedLine(workstream, line.activity)) continue;
    for (const [id, quantity] of Object.entries(line.allocations ?? {})) {
      const now = totals.get(Number(id)) ?? { items: 0, value: 0 };
      totals.set(Number(id), { items: now.items + quantity, value: now.value + quantity * Number(line.unitCost) });
    }
  }
  return totals;
}

/**
 * UBEC161/163: the items bought for schools, each shared out across the distribution list by quantity (replacing the
 * share by enrolment). Every item must be shared in full, and every listed school must get items, before sending.
 */
export function DistributionAllocations({ workstream, lines, schools, disabled, onSaved }: { workstream: ActivityWorkstream; lines: readonly ActivityLine[]; schools: readonly DistributionSchool[]; disabled: boolean; onSaved: () => Promise<unknown> }) {
  const items = lines.filter(line => isDistributedLine(workstream, line.activity));
  const [open, setOpen] = useState<ActivityLine | null>(null);
  if (!items.length) return null;
  const done = items.filter(line => allocatedOf(line) === line.quantity).length;
  return <section className="distribution-items" aria-labelledby="distribution-items-title">
    <div className="distribution-items-head"><h3 id="distribution-items-title">Items for schools</h3><Badge variant={done === items.length ? "secondary" : "warning"}>{done} of {items.length} shared out</Badge></div>
    <p className="distribution-note">Share each item&apos;s quantity across the schools on the list. Every item must be shared in full, and every school must get items, before sending</p>
    <ul>{items.map(line => {
      const allocated = allocatedOf(line), full = allocated === line.quantity;
      return <li key={line.id} data-full={full || undefined}>
        <PackageIcon aria-hidden="true" />
        <div><strong>{itemName(workstream, line)}</strong><small>{activityLabel(workstream, line.activity, line.customActivity)} · {count.format(Object.keys(line.allocations ?? {}).length)} school{Object.keys(line.allocations ?? {}).length === 1 ? "" : "s"}</small>
          <Progress value={line.quantity ? allocated / line.quantity * 100 : 0} aria-label={`${allocated} of ${line.quantity} allocated`} /></div>
        <span className="tabular-nums">{count.format(allocated)} / {count.format(line.quantity)}</span>
        <Button size="sm" variant={full ? "outline" : "default"} className="rounded-full" disabled={disabled || !schools.length} title={!schools.length ? "Add schools to the list first" : undefined} onClick={() => setOpen(line)}>{full ? "Adjust" : "Allocate"}</Button>
      </li>;
    })}</ul>
    {open && <AllocateDialog key={open.id} workstream={workstream} line={open} schools={schools} onClose={() => setOpen(null)} onSaved={onSaved} />}
  </section>;
}

function AllocateDialog({ workstream, line, schools, onClose, onSaved }: { workstream: ActivityWorkstream; line: ActivityLine; schools: readonly DistributionSchool[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(line.allocations ?? {}).map(([id, q]) => [id, String(q)])));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const quantities = useMemo(() => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, /^\d+$/.test(v.trim()) ? Number(v) : 0]).filter(([, q]) => Number(q) > 0)) as Record<string, number>, [values]);
  const allocated = Object.values(quantities).reduce((sum, q) => sum + q, 0), left = line.quantity - allocated;
  const fill = (shares: Map<number, number>) => { setValues(Object.fromEntries([...shares].filter(([, q]) => q > 0).map(([id, q]) => [String(id), String(q)]))); setError(""); };
  // Even: whole items, the remainder to the first schools; by learners: in proportion to enrolment (DNEMIS).
  const even = () => fill(new Map(schools.map((s, i) => [s.id, Math.floor(line.quantity / schools.length) + (i < line.quantity % schools.length ? 1 : 0)])));
  const byLearners = () => fill(allocateByEnrolment(line.quantity, schools));
  const hasLearners = schools.some(s => (s.enrolment ?? 0) > 0);

  async function save() {
    if (saving) return;
    if (left < 0) { setError(`Share at most ${count.format(line.quantity)} items: ${count.format(allocated)} allocated`); return; }
    setSaving(true);
    try {
      const response = await fetch(currentPlanHref("/api/activities"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workstream, entity: "allocation", action: "update", id: line.id, allocations: quantities }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "The allocation could not be saved");
      toast.success(left ? `Saved · ${count.format(left)} item${left === 1 ? "" : "s"} still to share` : "Saved · every item shared out");
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The allocation could not be saved"); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={next => { if (!next && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-2xl distribution-allocate-dialog">
      <DialogHeader><DialogTitle>Allocate · {itemName(workstream, line)}</DialogTitle><DialogDescription>{count.format(line.quantity)} items at {nairaFormat.format(Number(line.unitCost))} each. Give each school its number of items; schools left blank get none</DialogDescription></DialogHeader>
      <div className="distribution-allocate-tools">
        <Button size="sm" variant="outline" className="rounded-full" disabled={saving} onClick={even}>Share evenly</Button>
        {hasLearners && <Button size="sm" variant="outline" className="rounded-full" disabled={saving} onClick={byLearners}>Share by learners</Button>}
        <Button size="sm" variant="ghost" className="rounded-full" disabled={saving || !allocated} onClick={() => fill(new Map())}>Clear</Button>
        <span className="distribution-allocate-left" data-over={left < 0 || undefined} data-done={left === 0 || undefined}>{left === 0 ? "All items shared" : left > 0 ? `${count.format(left)} left to share` : `${count.format(-left)} too many`}</span>
      </div>
      <div className="distribution-allocate-table"><Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead className="text-right">Learners</TableHead><TableHead className="text-right w-28">Items</TableHead></TableRow></TableHeader>
        <TableBody>{schools.map(s => <TableRow key={s.id}><TableCell className="whitespace-normal">{s.name}</TableCell><TableCell>{s.lga}</TableCell><TableCell className="text-right tabular-nums">{count.format(s.enrolment ?? 0)}</TableCell>
          <TableCell className="text-right"><Input type="number" inputMode="numeric" min={0} max={line.quantity} className="h-8 w-24 ml-auto text-right" aria-label={`Items for ${s.name}`} value={values[String(s.id)] ?? ""} disabled={saving} onChange={e => { setValues({ ...values, [String(s.id)]: e.target.value }); setError(""); }} /></TableCell></TableRow>)}</TableBody>
        <TableFooter><TableRow><TableCell colSpan={3}>Allocated</TableCell><TableCell className="text-right tabular-nums">{count.format(allocated)} / {count.format(line.quantity)}</TableCell></TableRow></TableFooter></Table></div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || left < 0} onClick={() => void save()}>{saving && <Spinner data-icon="inline-start" />}Save allocation</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
