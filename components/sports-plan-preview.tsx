"use client";

import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptySchoolPackageArt } from "@/components/empty-art/infrastructure";
import { EmptySportsFieldArt } from "@/components/empty-art/sports";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sportsBudget, sportsMoney as money, sportsSections, type SportsAllocation, type SportsLine, type SportsPlan, type SportsSection } from "@/lib/sports";
import { LineTable, type InlineField, type PanelLine } from "@/components/line-panel/line-table";
import { EmptySection, FocusEmpty, LineSection } from "@/components/line-panel/line-section";
import { useCollapsed, type PanelMode } from "@/components/line-panel/use-line-panel";

export type SportsTarget = { entity: "budget"; item: SportsLine } | { entity: "allocation"; item: SportsAllocation };
type PreviewProps = { plan: SportsPlan; disabled: boolean; onEdit: (target: SportsTarget) => void; onRemove: (target: SportsTarget) => void; editingId?: number };

function RowActions({ label, disabled, onEdit, onRemove }: { label: string; disabled: boolean; onEdit: () => void; onRemove: () => void }) {
  const editAfterClose = useRef(false);
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Actions for ${label}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (editAfterClose.current) { event.preventDefault(); editAfterClose.current = false; onEdit(); } }}><DropdownMenuGroup><DropdownMenuItem onSelect={() => { editAfterClose.current = true; }}><PencilIcon />Edit line</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={onRemove}><Trash2Icon />Remove line</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>;
}

type BudgetPreviewProps = {
  plan: SportsPlan;
  disabled: boolean;
  /** The section and sport/sub-activity chosen in the form; that section leads and its group comes first. */
  selectedSection: SportsSection;
  selectedType: string;
  editingId?: number;
  /** A line open in the form with unsaved changes: locked for in-place editing. */
  dirtyId?: number;
  flashId: number | null;
  mode: PanelMode;
  onShowAll: () => void;
  query: string;
  onEdit: (target: SportsTarget) => void;
  onRemove: (target: SportsTarget) => void;
  onSaveCell: (id: number, field: InlineField, value: string) => Promise<string | null>;
  /** Chooses a section in the form to add its first line. */
  onStart: (section: SportsSection) => void;
};

const sameType = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const panelLine = (line: SportsLine): PanelLine => ({ id: line.id, label: line.description, description: line.description, code: line.section === "equipment" ? line.code : undefined, quarters: line.quarters, quantity: line.quantity, unitCost: line.unitCost });

/** The sports budget beside the form: one section per UBEC budget section, grouped by sport or sub-activity. */
export function SportsBudgetPreview({ plan, disabled, selectedSection, selectedType, editingId, dirtyId, flashId, mode, onShowAll, query, onEdit, onRemove, onSaveCell, onStart }: BudgetPreviewProps) {
  const { isOpen, toggle } = useCollapsed();
  if (!plan.lines.length) return <Empty><EmptyHeader><EmptyMedia><EmptySportsFieldArt label="No sports items yet" /></EmptyMedia><EmptyTitle>Your sports plan starts here</EmptyTitle></EmptyHeader></Empty>;
  const needle = query.trim().toLowerCase();
  const matching = needle ? plan.lines.filter((line) => `${line.description} ${line.activityType} ${line.code}`.toLowerCase().includes(needle)) : plan.lines;
  const target = (id: number): SportsTarget | null => { const item = plan.lines.find((line) => line.id === id); return item ? { entity: "budget", item } : null; };
  const table = (lines: SportsLine[], itemLabel: string) => <LineTable lines={lines.map(panelLine)} itemLabel={itemLabel} editable={!disabled} describe
    lockReason={(id) => id === dirtyId ? "Save or cancel the changes in the form first." : null} actionsDisabled={disabled} selectedId={editingId} flashId={flashId}
    onSave={onSaveCell} onEdit={(id) => { const t = target(id); if (t) onEdit(t); }} onRemove={(id) => { const t = target(id); if (t) onRemove(t); }} />;
  const section = (item: typeof sportsSections[number]) => {
    const lines = matching.filter((line) => line.section === item.id), selected = item.id === selectedSection;
    // The sport or sub-activity chosen in the form leads its section.
    const types = [...new Set(lines.map((line) => line.activityType))].sort((a, b) => Number(selected && sameType(b, selectedType)) - Number(selected && sameType(a, selectedType)));
    return <LineSection key={item.id} title={item.label} note={`Up to ${item.share}% of the sports budget`} count={lines.length} total={sportsBudget(lines)} selected={selected}
      open={isOpen(item.id) || lines.some((line) => line.id === flashId)} onOpenChange={(open) => toggle(item.id, open)}>
      {item.id === "supervision" ? table(lines, item.itemLabel) : types.map((type) => {
        const typeLines = lines.filter((line) => line.activityType === type);
        return <div className="line-subgroup" key={type} data-selected={(selected && sameType(type, selectedType)) || undefined}>
          <div className="line-subgroup-head"><h3>{type}</h3><span>{typeLines.length} {typeLines.length === 1 ? "line" : "lines"} · {money.format(sportsBudget(typeLines))}</span></div>
          {table(typeLines, item.itemLabel)}
        </div>;
      })}
    </LineSection>;
  };
  const has = (id: SportsSection) => matching.some((line) => line.section === id);
  const chosen = sportsSections.find((item) => item.id === selectedSection)!;
  if (mode === "focus") {
    if (has(selectedSection)) return section(chosen);
    if (needle) return <p className="line-focus-empty">No lines in {chosen.label} match your search.</p>;
    return <FocusEmpty title={chosen.label} others={plan.lines.length} onShowAll={onShowAll} />;
  }
  const empty = sportsSections.filter((item) => !plan.lines.some((line) => line.section === item.id));
  const emptyRow = (item: typeof sportsSections[number]) => <EmptySection key={item.id} title={item.label} selected={item.id === selectedSection} startLabel={`Add a line to ${item.label}`} onStart={disabled ? undefined : () => onStart(item.id)} />;
  return <>
    {has(selectedSection) ? section(chosen) : !needle && <div className="line-empty-group">{emptyRow(chosen)}</div>}
    {sportsSections.filter((item) => item.id !== selectedSection && has(item.id)).map(section)}
    {!needle && empty.some((item) => item.id !== selectedSection) && <div className="line-empty-group" role="group" aria-label="Sections without lines"><h3>No lines yet</h3>{empty.filter((item) => item.id !== selectedSection).map(emptyRow)}</div>}
    {needle && !matching.length && <p className="line-focus-empty">No sports lines match your search.</p>}
  </>;
}

export function SportsBeneficiaryPreview({ plan, disabled, onEdit, onRemove, editingId }: PreviewProps) {
  if (!plan.allocations.length) return <Empty><EmptyHeader><EmptyMedia><EmptySchoolPackageArt label="No beneficiary schools yet" /></EmptyMedia><EmptyTitle>No beneficiary schools yet</EmptyTitle></EmptyHeader></Empty>;
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
