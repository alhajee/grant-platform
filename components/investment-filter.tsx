"use client";

import { useMemo, useState } from "react";
import { CalendarRangeIcon, Layers3Icon, ListFilterIcon, RotateCcwIcon, WalletCardsIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CurrencyInput } from "@/components/currency-input";
import { planStatusLabels, type PlanOverview, type PlanStatus } from "@/lib/action-plans";

export type InvestmentArea = "infrastructure" | "sports" | "sbmc" | "tlm";
export type InvestmentFilters = {
  years: number[];
  quarters: number[];
  statuses: PlanStatus[];
  areas: InvestmentArea[];
  minimumBudget: string;
  maximumBudget: string;
  hasBudgetLines: boolean;
  hasSchools: boolean;
};

export const emptyInvestmentFilters: InvestmentFilters = {
  years: [], quarters: [], statuses: [], areas: [], minimumBudget: "", maximumBudget: "", hasBudgetLines: false, hasSchools: false,
};

const areaLabels: Record<InvestmentArea, string> = {
  infrastructure: "Infrastructure", sports: "Sports development", sbmc: "SBMC", tlm: "TLM",
};

export function investmentFilterCount(value: InvestmentFilters) {
  return value.years.length + value.quarters.length + value.statuses.length + value.areas.length + Number(Boolean(value.minimumBudget)) + Number(Boolean(value.maximumBudget)) + Number(value.hasBudgetLines) + Number(value.hasSchools);
}

function SectionLabel({ icon: Icon, label, count }: { icon: typeof CalendarRangeIcon; label: string; count: number }) {
  return <span className="investment-filter-section-label"><Icon aria-hidden="true" /><span>{label}</span>{count > 0 && <Badge variant="secondary">{count}</Badge>}</span>;
}

export function InvestmentFilter({ plans, value, onChange }: { plans: PlanOverview[]; value: InvestmentFilters; onChange: (value: InvestmentFilters) => void }) {
  const [open, setOpen] = useState(false);
  const years = useMemo(() => [...new Set(plans.flatMap(plan => Array.from({ length: plan.endYear - plan.startYear + 1 }, (_, index) => plan.startYear + index)))].sort((a, b) => b - a), [plans]);
  const statuses = useMemo(() => [...new Set(plans.map(plan => plan.status))], [plans]);
  const count = investmentFilterCount(value);
  const periodCount = value.years.length + value.quarters.length;
  const detailCount = value.statuses.length + value.areas.length + Number(value.hasBudgetLines) + Number(value.hasSchools);
  const budgetCount = Number(Boolean(value.minimumBudget)) + Number(Boolean(value.maximumBudget));

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button type="button" variant="outline" className="investment-filter-trigger"><ListFilterIcon data-icon="inline-start" />Filter investments{count > 0 && <Badge variant="secondary">{count}</Badge>}</Button></SheetTrigger>
    <SheetContent side="right" className="investment-filter-sheet" aria-labelledby="investment-filter-title">
      <SheetHeader className="investment-filter-header">
        <span className="investment-filter-emblem"><ListFilterIcon aria-hidden="true" /></span>
        <span className="min-w-0"><span className="flex items-center gap-2"><SheetTitle id="investment-filter-title">Filter investments</SheetTitle>{count > 0 && <Badge>{count} active</Badge>}</span><SheetDescription>Combine options to refine the budget breakdown.</SheetDescription></span>
      </SheetHeader>
      <Separator />
      <ScrollArea className="investment-filter-scroll">
        <Accordion type="multiple" defaultValue={["period", "details"]} className="investment-filter-accordion">
          <AccordionItem value="period">
            <AccordionTrigger><SectionLabel icon={CalendarRangeIcon} label="Plan period" count={periodCount} /></AccordionTrigger>
            <AccordionContent><FieldGroup className="gap-4">
              <FieldSet className="gap-2"><FieldLegend variant="label">Funding year</FieldLegend><ToggleGroup type="multiple" variant="outline" spacing={2} value={value.years.map(String)} onValueChange={selected => onChange({ ...value, years: selected.map(Number) })} aria-label="Filter by funding year" className="investment-filter-options">{years.map(year => <ToggleGroupItem key={year} value={String(year)}>{year}</ToggleGroupItem>)}</ToggleGroup></FieldSet>
              <FieldSet className="gap-2"><FieldLegend variant="label">Funding quarters</FieldLegend><ToggleGroup type="multiple" variant="outline" spacing={2} value={value.quarters.map(String)} onValueChange={selected => onChange({ ...value, quarters: selected.map(Number) })} aria-label="Filter by funding quarter" className="investment-filter-options">{[1, 2, 3, 4].map(quarter => <ToggleGroupItem key={quarter} value={String(quarter)}>Q{quarter}</ToggleGroupItem>)}</ToggleGroup></FieldSet>
            </FieldGroup></AccordionContent>
          </AccordionItem>
          <AccordionItem value="details">
            <AccordionTrigger><SectionLabel icon={Layers3Icon} label="Plan details" count={detailCount} /></AccordionTrigger>
            <AccordionContent><FieldGroup className="gap-4">
              <FieldSet className="gap-2"><FieldLegend variant="label">Review status</FieldLegend><ToggleGroup type="multiple" variant="outline" spacing={2} value={value.statuses} onValueChange={selected => onChange({ ...value, statuses: selected as PlanStatus[] })} aria-label="Filter by review status" className="investment-filter-options investment-filter-options-wide">{statuses.map(status => <ToggleGroupItem key={status} value={status}>{planStatusLabels[status]}</ToggleGroupItem>)}</ToggleGroup></FieldSet>
              <FieldSet className="gap-2"><FieldLegend variant="label">Investment area</FieldLegend><ToggleGroup type="multiple" variant="outline" spacing={2} value={value.areas} onValueChange={selected => onChange({ ...value, areas: selected as InvestmentArea[] })} aria-label="Filter by investment area" className="investment-filter-options">{(Object.keys(areaLabels) as InvestmentArea[]).map(area => <ToggleGroupItem key={area} value={area}>{areaLabels[area]}</ToggleGroupItem>)}</ToggleGroup></FieldSet>
              <FieldSet className="gap-2"><FieldLegend variant="label">Plan contents</FieldLegend><FieldGroup data-slot="checkbox-group" className="investment-filter-checks">{([['hasBudgetLines', 'Has budgeted activities'], ['hasSchools', 'Targets schools']] as const).map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`investment-${key}`} checked={value[key]} onCheckedChange={checked => onChange({ ...value, [key]: checked === true })} /><FieldLabel htmlFor={`investment-${key}`}>{label}</FieldLabel></Field>)}</FieldGroup></FieldSet>
            </FieldGroup></AccordionContent>
          </AccordionItem>
          <AccordionItem value="budget">
            <AccordionTrigger><SectionLabel icon={WalletCardsIcon} label="Budget range" count={budgetCount} /></AccordionTrigger>
            <AccordionContent><FieldGroup className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="investment-minimum">Minimum</FieldLabel><CurrencyInput id="investment-minimum" placeholder="0.00" value={value.minimumBudget} onValueChange={minimumBudget => onChange({ ...value, minimumBudget })} /></Field><Field><FieldLabel htmlFor="investment-maximum">Maximum</FieldLabel><CurrencyInput id="investment-maximum" placeholder="Any amount" value={value.maximumBudget} onValueChange={maximumBudget => onChange({ ...value, maximumBudget })} /></Field></FieldGroup></AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
      <Separator />
      <SheetFooter className="investment-filter-footer"><Button type="button" variant="ghost" size="sm" disabled={!count} onClick={() => onChange(emptyInvestmentFilters)}><RotateCcwIcon data-icon="inline-start" />Clear all</Button><Button type="button" size="sm" onClick={() => setOpen(false)}>Show results</Button></SheetFooter>
    </SheetContent>
  </Sheet>;
}
