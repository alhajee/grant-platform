'use client';

import { InfoIcon } from 'lucide-react';
import { Tooltip,TooltipContent,TooltipTrigger } from '@/components/ui/tooltip';

export function FieldHelp({children}:{children:string}){
  return <Tooltip><TooltipTrigger asChild><span className="field-help-trigger" tabIndex={0} aria-label={'More information: '+children}><InfoIcon aria-hidden="true" /></span></TooltipTrigger><TooltipContent side="top" sideOffset={6}><p className="max-w-64">{children}</p></TooltipContent></Tooltip>;
}
