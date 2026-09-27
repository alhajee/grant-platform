"use client";

import { useMemo, useState } from "react";
import { ListFilterIcon, RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
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

const toggle = <Value extends string | number>(values: Value[], value: Value, checked: boolean) => checked ? [...values, value] : values.filter(item => item !== value);

export function investmentFilterCount(value: InvestmentFilters) {
  return value.years.length + value.quarters.length + value.statuses.length + value.areas.length + Number(Boolean(value.minimumBudget)) + Number(Boolean(value.maximumBudget)) + Number(value.hasBudgetLines) + Number(value.hasSchools);
}

export function InvestmentFilter({ plans, value, onChange }: { plans: PlanOverview[]; value: InvestmentFilters; onChange: (value: InvestmentFilters) => void }) {
  const [open, setOpen] = useState(false);
  const years = useMemo(() => [...new Set(plans.flatMap(plan => Array.from({ length: plan.endYear - plan.startYear + 1 }, (_, index) => plan.startYear + index)))].sort((a, b) => b - a), [plans]);
  const statuses = useMemo(() => [...new Set(plans.map(plan => plan.status))], [plans]);
  const count = investmentFilterCount(value);
  const checkbox = <Key extends "years" | "quarters" | "statuses" | "areas">(key: Key, option: InvestmentFilters[Key][number], label: string) => {
    const id = `investment-${key}-${option}`;
    const selected = (value[key] as (string | number)[]).includes(option);
    return <Field key={id} orientation="horizontal"><Checkbox id={id} checked={selected} onCheckedChange={checked => onChange({ ...value, [key]: toggle(value[key] as typeof option[], option, checked === true) })} /><FieldLabel htmlFor={id}>{label}</FieldLabel></Field>;
  };

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" className="investment-filter-trigger"><ListFilterIcon data-icon="inline-start" />Filter investments{count > 0 && <Badge variant="secondary">{count}</Badge>}</Button></PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="investment-filter-popover w-[390px] max-w-[calc(100vw-24px)]" aria-labelledby="investment-filter-title">
      <PopoverHeader><PopoverTitle id="investment-filter-title">Filter investments</PopoverTitle><PopoverDescription>Combine filters to focus the budget breakdown.</PopoverDescription></PopoverHeader>
      <FieldGroup className="gap-4">
        <FieldSet className="gap-2"><FieldLegend variant="label">Funding year</FieldLegend><FieldGroup data-slot="checkbox-group" className="grid grid-cols-2 gap-2">{years.map(year => checkbox("years", year, String(year)))}</FieldGroup></FieldSet>
        <FieldSet className="gap-2"><FieldLegend variant="label">Funding quarters</FieldLegend><FieldGroup data-slot="checkbox-group" className="grid grid-cols-2 gap-2">{[1, 2, 3, 4].map(quarter => checkbox("quarters", quarter, `Q${quarter}`))}</FieldGroup></FieldSet>
        <FieldSet className="gap-2"><FieldLegend variant="label">Review status</FieldLegend><FieldGroup data-slot="checkbox-group" className="gap-2">{statuses.map(status => checkbox("statuses", status, planStatusLabels[status]))}</FieldGroup></FieldSet>
        <FieldSet className="gap-2"><FieldLegend variant="label">Investment area</FieldLegend><FieldGroup data-slot="checkbox-group" className="grid grid-cols-2 gap-2">{(Object.keys(areaLabels) as InvestmentArea[]).map(area => checkbox("areas", area, areaLabels[area]))}</FieldGroup></FieldSet>
        <FieldSet className="gap-2"><FieldLegend variant="label">Proposed budget range</FieldLegend><FieldGroup className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="investment-minimum">Minimum</FieldLabel><CurrencyInput id="investment-minimum" placeholder="0.00" value={value.minimumBudget} onValueChange={minimumBudget => onChange({ ...value, minimumBudget })} /></Field><Field><FieldLabel htmlFor="investment-maximum">Maximum</FieldLabel><CurrencyInput id="investment-maximum" placeholder="Any amount" value={value.maximumBudget} onValueChange={maximumBudget => onChange({ ...value, maximumBudget })} /></Field></FieldGroup></FieldSet>
        <FieldSet className="gap-2"><FieldLegend variant="label">Plan contents</FieldLegend><FieldGroup data-slot="checkbox-group" className="gap-2">{([['hasBudgetLines', 'Has budgeted activities'], ['hasSchools', 'Targets schools']] as const).map(([key, label]) => <Field key={key} orientation="horizontal"><Checkbox id={`investment-${key}`} checked={value[key]} onCheckedChange={checked => onChange({ ...value, [key]: checked === true })} /><FieldLabel htmlFor={`investment-${key}`}>{label}</FieldLabel></Field>)}</FieldGroup></FieldSet>
      </FieldGroup>
      <div className="mt-5 flex items-center justify-between gap-3"><Button type="button" variant="ghost" size="sm" disabled={!count} onClick={() => onChange(emptyInvestmentFilters)}><RotateCcwIcon data-icon="inline-start" />Clear all</Button><Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button></div>
    </PopoverContent>
  </Popover>;
}
