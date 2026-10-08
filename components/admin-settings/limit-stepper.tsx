'use client';

import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { maxLimit, minLimit, validLimit } from './officers-model';

/** Compact − n + stepper for an officer limit, with "Default N · Reset" once it differs from the default. */
export function LimitStepper({ id, label, value, defaultValue, disabled, onChange }: {
  id: string; label: string; value: string; defaultValue: number; disabled: boolean; onChange: (value: string) => void;
}) {
  const valid = validLimit(value), n = valid ? Number(value) : defaultValue;
  const changed = value !== String(defaultValue);
  return <div className="admin-limit">
    <ButtonGroup aria-label={label}>
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Lower ${label}`} disabled={disabled || (valid && n <= minLimit)} onClick={() => onChange(String(Math.max(minLimit, n - 1)))}><MinusIcon /></Button>
      <Input id={id} aria-label={label} inputMode="numeric" className="h-8 w-11 px-1 text-center tabular-nums" value={value} disabled={disabled}
        aria-invalid={!valid || undefined} onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 2))} />
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Raise ${label}`} disabled={disabled || (valid && n >= maxLimit)} onClick={() => onChange(String(Math.min(maxLimit, n + 1)))}><PlusIcon /></Button>
    </ButtonGroup>
    <span className="admin-limit-default">
      {changed ? <>Default {defaultValue} · <Button type="button" variant="link" size="xs" className="h-auto p-0 text-xs" disabled={disabled} onClick={() => onChange(String(defaultValue))}>Reset</Button></> : 'Default'}
    </span>
  </div>;
}
