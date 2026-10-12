'use client';
import { useState, type ReactNode } from 'react';
import { LockIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import './locked-overlay.css';

/** Why a form section is locked: `title` is the short label, `detail` the explanation shown on hover or focus. */
export type LockReason = { title: string; detail: string };

/**
 * A quiet lock for a disabled form section: a small "Locked · reason" label above it and a dimmed form. Pointing
 * anywhere at the locked form (or focusing the label) shows the explanation by the label. Without a reason the
 * children render as they are.
 */
export function LockedOverlay({ reason, children }: { reason: LockReason | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!reason) return <>{children}</>;
  return <div className="locked-area">
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <p className="locked-label" tabIndex={0}><LockIcon aria-hidden="true" /><span>Locked</span><span aria-hidden="true">·</span><span>{reason.title}</span></p>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-xs">{reason.detail}</TooltipContent>
    </Tooltip>
    <div className="locked-body" inert>{children}</div>
    <div className="locked-cover" aria-hidden="true" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} />
  </div>;
}
