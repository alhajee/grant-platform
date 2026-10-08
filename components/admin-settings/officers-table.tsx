'use client';

import { Fragment, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { NoOfficersArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import { cn } from '@/lib/utils';
import { LimitStepper } from './limit-stepper';
import { OfficerPicker } from './officer-picker';
import { validLimit, type Department, type OfficerDraft } from './officers-model';

type Props = {
  departments: Department[]; draft: OfficerDraft; disabled: boolean;
  onLimit: (department: string, value: string) => void; onDefaults: (pillar: ImplementedPillar, ids: number[]) => void;
};

/** One row per UBEC department: components, active officers against the limit, the limit, and (expanded) default officers per component. */
export function OfficersTable({ departments, draft, disabled, onLimit, onDefaults }: Props) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <Table className="admin-officers-table">
    <TableHeader>
      <TableRow>
        <TableHead className="w-10"><span className="sr-only">Default officers</span></TableHead>
        <TableHead>Department</TableHead>
        <TableHead>Components</TableHead>
        <TableHead>Active officers</TableHead>
        <TableHead>Limit</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {departments.map(department => {
        const expanded = open.has(department.department), detailId = `officer-defaults-${department.department}`;
        const limit = draft.limits[department.department], numeric = validLimit(limit) ? Number(limit) : department.limit;
        const over = department.active > numeric;
        const withDefaults = department.components.filter(c => (draft.defaults[c.pillar] ?? []).length > 0).length;
        return <Fragment key={department.department}>
          <TableRow data-state={expanded ? 'selected' : undefined} className="admin-officers-row">
            <TableCell className="pr-0">
              <Button type="button" variant="ghost" size="icon-sm" aria-expanded={expanded} aria-controls={detailId} aria-label={`${expanded ? 'Hide' : 'Show'} default officers for ${department.name}`} onClick={() => toggle(department.department)}>
                <ChevronRightIcon className={cn('transition-transform', expanded && 'rotate-90')} />
              </Button>
            </TableCell>
            <TableCell>
              <button type="button" className="admin-officers-dept" onClick={() => toggle(department.department)}>
                <span className="truncate font-medium">{department.name}</span>
                <Badge variant="outline" className="font-mono text-[11px]">{department.short}</Badge>
              </button>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <Tooltip>
                  <TooltipTrigger asChild><span className="admin-underline-hint w-fit" tabIndex={0}>{department.components.length} {department.components.length === 1 ? 'component' : 'components'}</span></TooltipTrigger>
                  <TooltipContent><ul className="flex flex-col gap-0.5">{department.components.map(c => <li key={c.pillar}>{c.name}</li>)}</ul></TooltipContent>
                </Tooltip>
                <span className="text-xs text-muted-foreground tabular-nums">{withDefaults ? `${withDefaults} with defaults` : 'Director assigns'}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="admin-officer-meter" data-over={over || undefined}>
                <span className="tabular-nums" data-testid={`active-${department.department}`}>{department.active} of {numeric}</span>
                <Progress title={over ? 'No new officers until one is deactivated or the limit is raised' : undefined} value={Math.min(100, numeric ? department.active / numeric * 100 : 0)} aria-label={`${department.active} active of ${numeric} allowed`} className="h-1.5 w-16" />
              </div>
              {over && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Over limit</p>}
            </TableCell>
            <TableCell>
              <LimitStepper id={`officer-limit-${department.department}`} label={`${department.short} officer limit`} value={limit} defaultValue={department.defaultLimit} disabled={disabled} onChange={value => onLimit(department.department, value)} />
            </TableCell>
          </TableRow>
          {expanded && <TableRow id={detailId} className="admin-officers-detail hover:bg-transparent">
            <TableCell />
            <TableCell colSpan={4} className="whitespace-normal">
              {department.officers.length === 0
                ? <UbecEmpty art={<NoOfficersArt />} title={`No Assessment Officers in ${department.short} yet`} compact>Add them on Users or the UBEC Officers page. Until then the Director assigns.</UbecEmpty>
                : <dl className="admin-defaults-list">
                  {department.components.map(component => <div key={component.pillar}>
                    <dt>{component.name}</dt>
                    <dd><OfficerPicker component={component.name} officers={department.officers} value={draft.defaults[component.pillar] ?? []} disabled={disabled} onChange={ids => onDefaults(component.pillar, ids)} /></dd>
                  </div>)}
                </dl>}
            </TableCell>
          </TableRow>}
        </Fragment>;
      })}
    </TableBody>
  </Table>;
}
