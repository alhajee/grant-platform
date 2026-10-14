'use client';
import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type DeletePlanButtonProps = {
  planId: number;
  version: number;
  /** "2027 Q1–Q4 BEAP" */
  title: string;
  /** Set when the plan can no longer be deleted (sent to UBEC); the button is then disabled with this reason. */
  blockedReason: string | null;
};

/** Delete plan on the plan page, for plan creators: asks first, then deletes and returns to the dashboard. */
export function DeletePlanButton({ planId, version, title, blockedReason }: DeletePlanButtonProps) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  async function remove() {
    setBusy(true); setProblem('');
    try {
      const response = await fetch('/api/plans/setup', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planId, version }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The plan could not be deleted. Please try again.');
      window.location.replace('/dashboard');
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'The plan could not be deleted. Please try again.');
      setBusy(false);
    }
  }
  const button = <Button variant="outline" className="rounded-full text-destructive hover:text-destructive" disabled={!!blockedReason} onClick={() => { setProblem(''); setOpen(true); }}><Trash2Icon data-icon="inline-start" />Delete plan</Button>;
  return <>
    {blockedReason
      ? <Tooltip><TooltipTrigger asChild><span tabIndex={0}>{button}</span></TooltipTrigger><TooltipContent className="max-w-64">{blockedReason}</TooltipContent></Tooltip>
      : button}
    <AlertDialog open={open} onOpenChange={value => { if (!value && !busy) setOpen(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the {title}?</AlertDialogTitle>
          <AlertDialogDescription>Every component, line, school list, document, comment and review entry in this plan is deleted with it. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy && <Spinner data-icon="inline-start" />}Delete plan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
