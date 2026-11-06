'use client';
import { useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/**
 * A school checklist whose list folds away under its header row (UBEC223): the chevron on the right hides or shows the
 * schools, and the header (count, Select all, Clear) stays visible either way. Used by the activity editor's pickers.
 */
export function CollapsibleSchoolPicker({ label, header, children, defaultOpen = true }: { label: string; header: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <Collapsible open={open} onOpenChange={setOpen} className="school-picker" role="group" aria-label={label} data-collapsed={open ? undefined : true}>
    <div className="school-pick school-pick-all">
      {header}
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="school-picker-toggle" aria-label={open ? 'Hide the school list' : 'Show the school list'} title={open ? 'Hide the school list' : 'Show the school list'}><ChevronDownIcon /></Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent>{children}</CollapsibleContent>
  </Collapsible>;
}
