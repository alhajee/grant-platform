'use client';
import type { ReactNode } from 'react';
import { LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './locked-overlay.css';

/** Why a form section is locked: `title` is always shown on the lock, `detail` opens on hover or focus. */
export type LockReason = { title: string; detail: string; action?: { label: string; run: () => void } };

/**
 * Lays a see-through, lightly hatched lock over a disabled form section. The lock badge stays in view while the
 * form scrolls; pointing at (or tabbing to) the section opens it into the reason and, when there is one, the step
 * that unlocks it. Without a reason the children render as they are.
 */
export function LockedOverlay({ reason, children }: { reason: LockReason | null; children: ReactNode }) {
  return <div className="locked-area" data-locked={reason ? true : undefined}>
    <div inert={reason ? true : undefined}>{children}</div>
    {reason && <div className="locked-overlay" tabIndex={0} role="note" aria-label={`${reason.title}. ${reason.detail}`}>
      <div className="locked-badge">
        <span className="locked-icon" aria-hidden="true"><LockIcon /></span>
        <span className="locked-copy">
          <strong>{reason.title}</strong>
          <span className="locked-more"><span>
            <span className="locked-detail">{reason.detail}</span>
            {reason.action && <Button type="button" size="sm" className="locked-action rounded-full" onClick={reason.action.run}>{reason.action.label}</Button>}
          </span></span>
        </span>
      </div>
    </div>}
  </div>;
}
