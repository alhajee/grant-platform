'use client';

import type { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** One settings section: heading, one-line description, then its content (usually a card of rows). */
export function SettingsPanel({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <section className="admin-settings-panel" aria-labelledby={id}>
    <header className="admin-settings-panel-head">
      <div className="min-w-0">
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
    {children}
  </section>;
}

/** A card holding setting rows, separated by hairlines. */
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('admin-settings-card gap-0 py-0', className)}>{children}</Card>;
}

/** Small "i" button that reveals the detail a description leaves out. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip>
    <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={label}><InfoIcon /></Button></TooltipTrigger>
    <TooltipContent className="max-w-xs text-pretty">{children}</TooltipContent>
  </Tooltip>;
}

/** Label and one-line description on the left, the control on the right (stacked on phones). */
export function SettingRow({ label, description, info, htmlFor, wide = false, children }: {
  label: string; description?: ReactNode; info?: ReactNode; htmlFor?: string; wide?: boolean; children: ReactNode;
}) {
  return <div className="admin-setting-row" data-wide={wide || undefined}>
    <div className="admin-setting-copy">
      <div className="flex items-center gap-1">
        {htmlFor ? <label htmlFor={htmlFor} className="admin-setting-label">{label}</label> : <span className="admin-setting-label">{label}</span>}
        {info && <InfoTip label={`About ${label}`}>{info}</InfoTip>}
      </div>
      {description && <p className="admin-setting-description">{description}</p>}
    </div>
    <div className="admin-setting-control">{children}</div>
  </div>;
}

export type Choice<T extends string> = { value: T; title: string; description: string };

/** Two or three explained options as selectable cards (a RadioGroup). */
export function ChoiceCards<T extends string>({ name, value, options, onChange, disabled }: {
  name: string; value: T; options: Choice<T>[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <RadioGroup className="admin-choice-cards" value={value} onValueChange={next => onChange(next as T)} aria-label={name} disabled={disabled}>
    {options.map(option => {
      const id = `${name}-${option.value}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return <FieldLabel key={option.value} htmlFor={id}>
        <Field orientation="horizontal">
          <FieldContent><FieldTitle>{option.title}</FieldTitle><FieldDescription>{option.description}</FieldDescription></FieldContent>
          <RadioGroupItem id={id} value={option.value} />
        </Field>
      </FieldLabel>;
    })}
  </RadioGroup>;
}

/** Appears only with unsaved changes; sticks to the bottom of the viewport while the section scrolls. */
export function SaveBar({ dirty, saving, invalid, onDiscard, onSave, message }: {
  dirty: boolean; saving: boolean; invalid?: string; onDiscard: () => void; onSave: () => void; message?: string;
}) {
  if (!dirty) return null;
  return <div className="admin-save-bar" role="region" aria-label="Unsaved changes">
    <span className="admin-save-bar-dot" aria-hidden="true" />
    <p>{invalid || message || <><span className="max-sm:hidden">You have unsaved changes</span><span className="sm:hidden">Unsaved changes</span></>}</p>
    <div className="admin-save-bar-actions">
      <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>Discard</Button>
      <Button type="button" size="sm" onClick={onSave} disabled={saving || Boolean(invalid)}>{saving && <Spinner data-icon="inline-start" />}Save changes</Button>
    </div>
  </div>;
}

export function PanelError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return <Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription>{message}<Button variant="outline" size="sm" onClick={onRetry}>Try again</Button></AlertDescription></Alert>;
}

export function PanelSkeleton({ rows = 2 }: { rows?: number }) {
  return <SettingsCard>{Array.from({ length: rows }, (_, i) => <div key={i} className="admin-setting-row">
    <div className="admin-setting-copy gap-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64 max-w-full" /></div>
    <Skeleton className="h-16 w-full" />
  </div>)}</SettingsCard>;
}
