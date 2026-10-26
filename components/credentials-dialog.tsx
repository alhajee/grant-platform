'use client';
import { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export type Credentials = { email: string; password: string };

/**
 * The sign-in details of a new or reset account, shown once (state Users, Admin > Users, UBEC Officers). The password is
 * a readable one-off (lib/generated-password.ts), never the stored hash; "Copy details" copies both for sharing.
 */
export function CredentialsDialog({ credentials, onClose, idPrefix = 'credential', className }: { credentials: Credentials | null; onClose: () => void; idPrefix?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!credentials) return;
    try { await navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`); setCopied(true); toast.success('Login details copied'); }
    catch { toast.error('Copy failed. Select the details and copy them instead.'); }
  }
  return <Dialog open={!!credentials} onOpenChange={open => { if (!open) { setCopied(false); onClose(); } }}>
    <DialogContent className={className}>
      <DialogHeader><DialogTitle>Login details</DialogTitle><DialogDescription>Share these details securely. The password is shown only now; they can change it after signing in</DialogDescription></DialogHeader>
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel><Input id={`${idPrefix}-email`} readOnly value={credentials?.email ?? ''} /></Field>
        <Field><FieldLabel htmlFor={`${idPrefix}-password`}>Password</FieldLabel><Input id={`${idPrefix}-password`} readOnly className="font-mono tracking-wide" value={credentials?.password ?? ''} onFocus={event => event.currentTarget.select()} /></Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => void copy()}>{copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}{copied ? 'Copied' : 'Copy details'}</Button>
        <Button onClick={() => { setCopied(false); onClose(); }}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
