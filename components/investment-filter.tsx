"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ListFilterIcon, XIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { CurrencyInput } from "@/components/currency-input";
import { planStatusLabels, type PlanOverview, type PlanStatus } from "@/lib/action-plans";

export type InvestmentArea = "infrastructure" | "sports" | "sbmc" | "tlm" | "monitoring" | "gscci" | "curriculum";
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
  infrastructure: "Infrastructure", sports: "Sports development", sbmc: "SBMC", tlm: "TLM", monitoring: "Supervision & Monitoring", gscci: "Greening & Safeguards", curriculum: "Curriculum",
};
const contentLabels = { hasBudgetLines: "Has budgeted activities", hasSchools: "Targets schools" } as const;
const compactMoney = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", notation: "compact", maximumFractionDigits: 2 });

export function investmentFilterCount(value: InvestmentFilters) {
  return value.years.length + value.quarters.length + value.statuses.length + value.areas.length + Number(Boolean(value.minimumBudget)) + Number(Boolean(value.maximumBudget)) + Number(value.hasBudgetLines) + Number(value.hasSchools);
}

const toggled = <T,>(list: T[], item: T, on: boolean) => on ? (list.includes(item) ? list : [...list, item]) : list.filter(entry => entry !== item);
const filterLabel = (count: number) => count ? `${count} ${count === 1 ? "filter" : "filters"}` : "";

/** Every active filter as a removable chip. */
function activeChips(value: InvestmentFilters, onChange: (value: InvestmentFilters) => void) {
  return [
    ...value.years.map(year => ({ key: `year-${year}`, label: String(year), clear: () => onChange({ ...value, years: value.years.filter(item => item !== year) }) })),
    ...value.quarters.map(quarter => ({ key: `q-${quarter}`, label: `Q${quarter}`, clear: () => onChange({ ...value, quarters: value.quarters.filter(item => item !== quarter) }) })),
    ...value.statuses.map(status => ({ key: `s-${status}`, label: planStatusLabels[status], clear: () => onChange({ ...value, statuses: value.statuses.filter(item => item !== status) }) })),
    ...value.areas.map(area => ({ key: `a-${area}`, label: areaLabels[area], clear: () => onChange({ ...value, areas: value.areas.filter(item => item !== area) }) })),
    ...(Object.keys(contentLabels) as (keyof typeof contentLabels)[]).filter(key => value[key]).map(key => ({ key, label: contentLabels[key], clear: () => onChange({ ...value, [key]: false }) })),
    ...(value.minimumBudget ? [{ key: "min", label: `From ${compactMoney.format(Number(value.minimumBudget))}`, clear: () => onChange({ ...value, minimumBudget: "" }) }] : []),
    ...(value.maximumBudget ? [{ key: "max", label: `Up to ${compactMoney.format(Number(value.maximumBudget))}`, clear: () => onChange({ ...value, maximumBudget: "" }) }] : []),
  ];
}

function Section({ value, title, options, active, children }: { value: string; title: string; options?: number; active: number; children: ReactNode }) {
  return <AccordionItem value={value}>
    <AccordionTrigger><span className="filter-section-title">{title}{options !== undefined && <small>{options}</small>}</span>{active > 0 && <span className="filter-section-active">{filterLabel(active)}</span>}</AccordionTrigger>
    <AccordionContent>{children}</AccordionContent>
  </AccordionItem>;
}

function CheckList<T extends string | number>({ name, options, selected, label, onToggle, columns = 1 }: { name: string; options: readonly T[]; selected: readonly T[]; label: (option: T) => string; onToggle: (option: T, on: boolean) => void; columns?: 1 | 2 }) {
  return <FieldGroup data-slot="checkbox-group" className="filter-checks" data-columns={columns}>
    {options.map(option => <Field key={option} orientation="horizontal">
      <Checkbox id={`filter-${name}-${option}`} checked={selected.includes(option)} onCheckedChange={checked => onToggle(option, checked === true)} />
      <FieldLabel htmlFor={`filter-${name}-${option}`}>{label(option)}</FieldLabel>
    </Field>)}
  </FieldGroup>;
}

/** Dashboard filters in a dialog: active filters as chips, then collapsible sections of checkboxes. Changes apply as you go. */
export function InvestmentFilter({ plans, value, onChange, matchCount }: { plans: PlanOverview[]; value: InvestmentFilters; onChange: (value: InvestmentFilters) => void; matchCount: number }) {
  const [open, setOpen] = useState(false);
  const years = useMemo(() => [...new Set(plans.flatMap(plan => Array.from({ length: plan.endYear - plan.startYear + 1 }, (_, index) => plan.startYear + index)))].sort((a, b) => b - a), [plans]);
  const statuses = useMemo(() => [...new Set(plans.map(plan => plan.status))], [plans]);
  const count = investmentFilterCount(value), chips = activeChips(value, onChange);
  const contentCount = Number(value.hasBudgetLines) + Number(value.hasSchools), budgetCount = Number(Boolean(value.minimumBudget)) + Number(Boolean(value.maximumBudget));
  // Open the sections already in use; otherwise start with the most used ones.
  const [sections, setSections] = useState<string[]>([]);
  const onOpenChange = (next: boolean) => {
    if (next) {
      const used = [value.years.length && "years", value.quarters.length && "quarters", value.statuses.length && "status", value.areas.length && "areas", contentCount && "contents", budgetCount && "budget"].filter(Boolean) as string[];
      setSections(used.length ? used : ["status", "areas"]);
    }
    setOpen(next);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild><Button type="button" variant="outline" className="investment-filter-trigger"><ListFilterIcon data-icon="inline-start" />Filter dashboard{count > 0 && <Badge variant="secondary">{count}</Badge>}</Button></DialogTrigger>
    <DialogContent className="investment-filter-dialog" showCloseButton={false}>
      <DialogHeader className="filter-dialog-header">
        <DialogTitle>Filters</DialogTitle>
        <Button type="button" variant="link" size="sm" className="filter-clear" disabled={!count} onClick={() => onChange(emptyInvestmentFilters)}>Clear all</Button>
        <DialogDescription className="sr-only">Refine the plans and the budget breakdown on your dashboard. Changes apply as you select them.</DialogDescription>
      </DialogHeader>
      <div className="filter-dialog-body">
        {chips.length > 0 && <ul className="filter-chips" aria-label="Active filters">{chips.map(chip => <li key={chip.key}><span>{chip.label}</span><button type="button" aria-label={`Remove ${chip.label}`} onClick={chip.clear}><XIcon /></button></li>)}</ul>}
        <Accordion type="multiple" value={sections} onValueChange={setSections} className="filter-sections">
          <Section value="years" title="Funding year" options={years.length} active={value.years.length}>
            <CheckList name="year" columns={2} options={years} selected={value.years} label={String} onToggle={(year, on) => onChange({ ...value, years: toggled(value.years, year, on) })} />
          </Section>
          <Section value="quarters" title="Quarters" options={4} active={value.quarters.length}>
            <CheckList name="quarter" columns={2} options={[1, 2, 3, 4]} selected={value.quarters} label={quarter => `Q${quarter}`} onToggle={(quarter, on) => onChange({ ...value, quarters: toggled(value.quarters, quarter, on) })} />
          </Section>
          <Section value="status" title="Review status" options={statuses.length} active={value.statuses.length}>
            <CheckList name="status" options={statuses} selected={value.statuses} label={status => planStatusLabels[status]} onToggle={(status, on) => onChange({ ...value, statuses: toggled(value.statuses, status, on) })} />
          </Section>
          <Section value="areas" title="Component" options={7} active={value.areas.length}>
            <CheckList name="area" options={Object.keys(areaLabels) as InvestmentArea[]} selected={value.areas} label={area => areaLabels[area]} onToggle={(area, on) => onChange({ ...value, areas: toggled(value.areas, area, on) })} />
          </Section>
          <Section value="contents" title="Plan contents" options={2} active={contentCount}>
            <CheckList name="contents" options={Object.keys(contentLabels) as (keyof typeof contentLabels)[]} selected={(Object.keys(contentLabels) as (keyof typeof contentLabels)[]).filter(key => value[key])} label={key => contentLabels[key]} onToggle={(key, on) => onChange({ ...value, [key]: on })} />
          </Section>
          <Section value="budget" title="Proposed budget" active={budgetCount}>
            <FieldGroup className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="investment-minimum">From</FieldLabel><CurrencyInput id="investment-minimum" placeholder="0.00" value={value.minimumBudget} onValueChange={minimumBudget => onChange({ ...value, minimumBudget })} /></Field><Field><FieldLabel htmlFor="investment-maximum">Up to</FieldLabel><CurrencyInput id="investment-maximum" placeholder="Any amount" value={value.maximumBudget} onValueChange={maximumBudget => onChange({ ...value, maximumBudget })} /></Field></FieldGroup>
          </Section>
        </Accordion>
      </div>
      <div className="filter-dialog-footer">
        <span className="filter-keys" aria-hidden="true"><Kbd>Tab</Kbd>to move<Kbd>Space</Kbd>to select</span>
        <DialogClose asChild><Button type="button" size="sm" className="rounded-full">{matchCount === 1 ? "Show 1 plan" : `Show ${matchCount} plans`}</Button></DialogClose>
      </div>
    </DialogContent>
  </Dialog>;
}
