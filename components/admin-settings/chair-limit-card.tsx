'use client';

import { DepartmentArt } from '@/components/ubec/department-art';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LimitStepper } from './limit-stepper';
import { validLimit, type ChairSettings } from './officers-model';
import { SettingsCard } from './settings-primitives';

interface ChairLimitCardProps {
  chairs: ChairSettings;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/**
 * How many people may hold the UBEC BEAP Chair at once (migration 101): the UBEC BEAP Chair accounts and the UBEC
 * Directors given the duty on Users ("Also UBEC BEAP Chair"). Laid out like a department row of the officers table.
 */
export function ChairLimitCard({ chairs, value, disabled, onChange }: ChairLimitCardProps) {
  const limit = validLimit(value) ? Number(value) : chairs.limit, over = chairs.active > limit;
  return <SettingsCard className="admin-chair-limit">
    <div className="admin-chair-limit-name">
      <DepartmentArt department="chair" className="department-art admin-chair-limit-art" />
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">UBEC BEAP Chair</span>
        <span className="text-xs text-muted-foreground">BEAP Chair accounts and UBEC Directors given the duty on Users</span>
      </div>
    </div>
    <div>
      <div className="admin-officer-meter" data-over={over || undefined}>
        <Tooltip>
          <TooltipTrigger asChild><span className="admin-underline-hint tabular-nums" tabIndex={0}>{chairs.active} of {limit}</span></TooltipTrigger>
          <TooltipContent>{chairs.holders.length
            ? <ul className="flex flex-col gap-0.5">{chairs.holders.map(h => <li key={h.id}>{h.name} <span className="opacity-70">· {h.role === 'UBEC Director' ? 'Director with the duty' : 'BEAP Chair'}</span></li>)}</ul>
            : 'Nobody holds the BEAP Chair yet'}</TooltipContent>
        </Tooltip>
        <Progress value={Math.min(100, limit ? chairs.active / limit * 100 : 0)} aria-label={`${chairs.active} BEAP Chairs of ${limit} allowed`} className="h-1.5 w-16" />
      </div>
      {over ? <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Over limit: no new BEAP Chairs until one is removed</p>
        : <Badge variant="secondary" className="mt-1">{limit - chairs.active} more can be added</Badge>}
    </div>
    <LimitStepper id="ubec-chair-limit" label="UBEC BEAP Chair limit" value={value} defaultValue={chairs.defaultLimit} disabled={disabled} onChange={onChange} />
  </SettingsCard>;
}
