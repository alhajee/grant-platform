'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

export type DeletableUser = { id: number; name: string; email: string };
type Props = {
  /** The account to delete, or null when the dialog is closed. */
  user: DeletableUser | null;
  /** The API that deletes it: /api/admin/users, /api/users or /api/ubec/officers (DELETE `{ id }`). */
  endpoint: string;
  onClose: () => void;
  onDeleted: () => Promise<void> | void;
};

/**
 * UBEC236: "Delete user", asked first. Accounts with recorded work are removed (kept for the history, cannot sign in, email
 * freed); others are deleted outright (lib/user-delete.ts). Used on Admin > Users, /users and /ubec/team.
 */
export function DeleteUserDialog({ user, endpoint, onClose, onDeleted }: Props) {
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  async function remove() {
    if (!user || busy) return;
    setBusy(true); setProblem('');
    try {
      const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.id }) });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || 'The user could not be deleted. Please try again.');
      toast.success(result.message || `${user.name} was deleted`);
      onClose();
      await onDeleted();
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : 'The user could not be deleted. Please try again.'); }
    finally { setBusy(false); }
  }
  return <AlertDialog open={!!user} onOpenChange={open => { if (!open && !busy) { setProblem(''); onClose(); } }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {user?.name}?</AlertDialogTitle>
        <AlertDialogDescription>{user?.email} loses access at once and is signed out. If they have recorded work (reviews, decisions, comments), that stays in the history under their name; the email can then be used for a new account. This cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void remove(); }}>{busy && <Spinner data-icon="inline-start" />}Delete user</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
