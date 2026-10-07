'use client';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/**
 * The one "unsaved work" confirmation used by every component editor. Keep editing is the safe default (focused,
 * also chosen by Esc); discarding is the red, deliberate choice.
 */
export function DiscardChangesDialog({ open, item = 'line', saved, onKeep, onDiscard }: {
  open: boolean;
  /** What is unsaved, e.g. "line" or "package". */
  item?: string;
  /** What stays safe, e.g. "Your saved items stay as they are." */
  saved: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return <AlertDialog open={open} onOpenChange={value => { if (!value) onKeep(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Discard this unsaved {item}?</AlertDialogTitle>
        <AlertDialogDescription>{saved}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep editing</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onDiscard}>Discard {item}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
