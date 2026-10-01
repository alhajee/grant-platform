"use client";

import { MoreHorizontalIcon, PackageIcon, PencilIcon, SchoolIcon, Trash2Icon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sportsBudget, sportsLineTotal, sportsMoney as money, sportsSections, type SportsAllocation, type SportsLine, type SportsPlan } from "@/lib/sports";

export type SportsTarget = { entity: "budget"; item: SportsLine } | { entity: "allocation"; item: SportsAllocation };
type PreviewProps = { plan: SportsPlan; disabled: boolean; onEdit: (target: SportsTarget) => void; onRemove: (target: SportsTarget) => void; editingId?: number };

function RowActions({ label, disabled, onEdit, onRemove }: { label: string; disabled: boolean; onEdit: () => void; onRemove: () => void }) {
  const editAfterClose = useRef(false);
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Actions for ${label}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (editAfterClose.current) { event.preventDefault(); editAfterClose.current = false; onEdit(); } }}><DropdownMenuGroup><DropdownMenuItem onSelect={() => { editAfterClose.current = true; }}><PencilIcon />Edit line</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2Icon />Remove line</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>;
}

export function SportsBudgetPreview({ plan, disabled, onEdit, onRemove, editingId }: PreviewProps) {
  if (!plan.lines.length) return <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageIcon /></EmptyMedia><EmptyTitle>Your sports plan starts here</EmptyTitle><EmptyDescription>Add an equipment item or activity to build your budget.</EmptyDescription></EmptyHeader></Empty>;
  return <div className="sports-schedules">{sportsSections.map((section) => {
    const lines = plan.lines.filter((line) => line.section === section.id);
    if (!lines.length) return null;
    const types = [...new Set(lines.map((line) => line.activityType))];
    return <section key={section.id} aria-labelledby={`preview-${section.id}`} className="sports-schedule">
      <div className="sports-section-total"><h2 id={`preview-${section.id}`}>{section.label} <span className="font-normal text-muted-foreground">· {section.share}%</span></h2><strong>{money.format(sportsBudget(lines))}</strong></div>
      {types.map((type) => {
        const typeLines = lines.filter((line) => line.activityType === type);
        return <div className="sports-table" key={type}>
          {section.id !== "supervision" && <div className="sports-type-heading"><h3>{type}</h3><span>{typeLines.length} {typeLines.length === 1 ? "line" : "lines"}</span></div>}
          <Table className="table-fixed sports-editable-table" data-view="budget"><colgroup><col /><col className="sports-amount-column" /><col className="actions-column" /></colgroup>
            <TableHeader><TableRow><TableHead>{section.itemLabel}</TableHead><TableHead className="text-right">Amount</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{typeLines.map((line) => <TableRow key={line.id} className="sports-editable-row" tabIndex={0} aria-label={`Edit ${line.description}`} aria-selected={editingId === line.id} data-sports-row-id={`budget-${line.id}`} data-state={editingId === line.id ? "selected" : undefined} onClick={() => !disabled && onEdit({ entity: "budget", item: line })} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onEdit({ entity: "budget", item: line }); } }}>
              <TableCell className="school-cell"><div className="school-name">{line.description}</div><div className="school-location">{line.quantity.toLocaleString()} × {money.format(line.unitCost)}</div>{line.section === "equipment" && <div className="school-code">{line.code}</div>}<div className="sports-mobile-amount">{money.format(sportsLineTotal(line))}</div></TableCell>
              <TableCell className="sports-amount-cell">{money.format(sportsLineTotal(line))}</TableCell>
              <TableCell className="line-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><RowActions label={line.description} disabled={disabled} onEdit={() => onEdit({ entity: "budget", item: line })} onRemove={() => onRemove({ entity: "budget", item: line })} /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {typeLines.length > 1 && <div className="schedule-total"><span>Subtotal</span><strong>{money.format(sportsBudget(typeLines))}</strong></div>}
        </div>;
      })}
    </section>;
  })}</div>;
}

export function SportsBeneficiaryPreview({ plan, disabled, onEdit, onRemove, editingId }: PreviewProps) {
  if (!plan.allocations.length) return <Empty><EmptyHeader><EmptyMedia variant="icon"><SchoolIcon /></EmptyMedia><EmptyTitle>No beneficiary schools yet</EmptyTitle><EmptyDescription>Choose a school and allocate items from your equipment budget.</EmptyDescription></EmptyHeader></Empty>;
  const schoolIds = [...new Set(plan.allocations.map((allocation) => allocation.schoolId))];
  return <div className="sports-schedules">{schoolIds.map((schoolId) => {
    const allocations = plan.allocations.filter((item) => item.schoolId === schoolId);
    const school = allocations[0];
    return <section key={schoolId} className="sports-table" aria-label={school.name}>
      <div className="sports-school-heading"><h2>{school.name}</h2><p>{school.lga} · {school.level} · {school.location}</p></div>
      <Table className="table-fixed sports-editable-table" data-view="allocation"><colgroup><col /><col className="quantity-column" /><col className="actions-column" /></colgroup>
        <TableHeader><TableRow><TableHead>Sport / equipment</TableHead><TableHead className="text-right">Qty.</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{allocations.map((allocation) => {
          const line = plan.lines.find((item) => item.id === allocation.lineId);
          return <TableRow key={allocation.id} className="sports-editable-row" tabIndex={0} aria-label={`Edit ${line?.description ?? "equipment"} for ${school.name}`} aria-selected={editingId === allocation.id} data-sports-row-id={`allocation-${allocation.id}`} data-state={editingId === allocation.id ? "selected" : undefined} onClick={() => !disabled && onEdit({ entity: "allocation", item: allocation })} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onEdit({ entity: "allocation", item: allocation }); } }}>
            <TableCell className="school-cell"><div className="school-name">{line?.description}</div><div className="school-location">{line?.activityType}</div>{(allocation.longitude || allocation.latitude) && <div className="school-code">Long. {allocation.longitude || "—"} · Lat. {allocation.latitude || "—"}</div>}</TableCell>
            <TableCell className="quantity-cell text-right tabular-nums">{allocation.quantity.toLocaleString()}</TableCell>
            <TableCell className="line-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><RowActions label={`${line?.description} — ${school.name}`} disabled={disabled} onEdit={() => onEdit({ entity: "allocation", item: allocation })} onRemove={() => onRemove({ entity: "allocation", item: allocation })} /></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
      <div className="schedule-total"><span>Total equipment items</span><strong>{allocations.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}</strong></div>
    </section>;
  })}</div>;
}
