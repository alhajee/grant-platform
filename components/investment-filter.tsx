"use client";

import { useMemo } from "react";
import { FilterDialog, type FilterSection } from "@/components/filter-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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

type ContentKey = keyof typeof contentLabels;

/** Dashboard filters in the shared filter dialog. Changes apply as you go. */
export function InvestmentFilter({ plans, value, onChange, matchCount }: { plans: PlanOverview[]; value: InvestmentFilters; onChange: (value: InvestmentFilters) => void; matchCount: number }) {
  const years = useMemo(() => [...new Set(plans.flatMap(plan => Array.from({ length: plan.endYear - plan.startYear + 1 }, (_, index) => plan.startYear + index)))].sort((a, b) => b - a), [plans]);
  const statuses = useMemo(() => [...new Set(plans.map(plan => plan.status))], [plans]);
  const contentKeys = Object.keys(contentLabels) as ContentKey[];
  const sections: FilterSection[] = [
    { id: 'years', title: 'Funding year', columns: 2, options: years.map(year => ({ value: String(year), label: String(year) })), selected: value.years.map(String), onChange: values => onChange({ ...value, years: values.map(Number) }) },
    { id: 'quarters', title: 'Quarters', columns: 2, options: [1, 2, 3, 4].map(quarter => ({ value: String(quarter), label: `Q${quarter}` })), selected: value.quarters.map(String), onChange: values => onChange({ ...value, quarters: values.map(Number) }) },
    { id: 'status', title: 'Review status', options: statuses.map(status => ({ value: status, label: planStatusLabels[status] })), selected: value.statuses, onChange: values => onChange({ ...value, statuses: values as PlanStatus[] }) },
    { id: 'areas', title: 'Component', options: (Object.keys(areaLabels) as InvestmentArea[]).map(area => ({ value: area, label: areaLabels[area] })), selected: value.areas, onChange: values => onChange({ ...value, areas: values as InvestmentArea[] }) },
    { id: 'contents', title: 'Plan contents', options: contentKeys.map(key => ({ value: key, label: contentLabels[key] })), selected: contentKeys.filter(key => value[key]), onChange: values => onChange({ ...value, hasBudgetLines: values.includes('hasBudgetLines'), hasSchools: values.includes('hasSchools') }) },
    {
      id: 'budget', title: 'Proposed budget',
      chips: [
        ...(value.minimumBudget ? [{ key: 'min', label: `From ${compactMoney.format(Number(value.minimumBudget))}`, clear: () => onChange({ ...value, minimumBudget: '' }) }] : []),
        ...(value.maximumBudget ? [{ key: 'max', label: `Up to ${compactMoney.format(Number(value.maximumBudget))}`, clear: () => onChange({ ...value, maximumBudget: '' }) }] : []),
      ],
      content: <FieldGroup className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="investment-minimum">From</FieldLabel><CurrencyInput id="investment-minimum" placeholder="0.00" value={value.minimumBudget} onValueChange={minimumBudget => onChange({ ...value, minimumBudget })} /></Field><Field><FieldLabel htmlFor="investment-maximum">Up to</FieldLabel><CurrencyInput id="investment-maximum" placeholder="Any amount" value={value.maximumBudget} onValueChange={maximumBudget => onChange({ ...value, maximumBudget })} /></Field></FieldGroup>,
    },
  ];
  return <FilterDialog sections={sections} onClearAll={() => onChange(emptyInvestmentFilters)} showLabel={matchCount === 1 ? 'Show 1 plan' : `Show ${matchCount} plans`} triggerLabel="Filter dashboard" triggerClassName="investment-filter-trigger" />;
}
