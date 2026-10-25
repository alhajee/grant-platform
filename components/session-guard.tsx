'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MonitorSmartphoneIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { signInHref } from '@/components/login-shell';

// One device per account (UBEC115, migration 072): signing in on a new device signs the older one out. On the older
// device this guard notices (any API call answered 401 while the server says the session was superseded, or a check
// every minute and when the tab comes back) and shows a sign-in dialog over the page instead of letting the page leave
// for the login screen, so unsaved work stays where it is. Requests that hit the 401 wait; after signing in again they
// are sent once more, so a save that was clicked completes by itself.
const checkEveryMs = 60 * 1000;
type Held = { retry: () => void };

async function superseded(fetcher: typeof fetch): Promise<boolean> {
  try {
    const response = await fetcher('/api/auth/session', { cache: 'no-store' });
    if (response.status !== 401) return false;
    return ((await response.json().catch(() => ({}))) as { reason?: string }).reason === 'superseded';
  } catch { return false; }
}

export function SessionGuard() {
  const [open, setOpen] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const held = useRef<Held[]>([]), original = useRef<typeof fetch | null>(null), openRef = useRef(false);
  const show = () => { openRef.current = true; setOpen(true); };

  useEffect(() => {
    if (original.current) return;
    const base = window.fetch.bind(window);
    original.current = base;
    // Who is signed in here, for the dialog (signed-out pages get a 401 and keep it empty).
    void base('/api/auth/session', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<{ user?: { email?: string } }> : null).then(body => { if (body?.user?.email) setEmail(body.user.email); }).catch(() => {});
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.href);
      const watched = path.origin === window.location.origin && path.pathname.startsWith('/api/') && !path.pathname.startsWith('/api/auth/');
      const again = (input instanceof Request ? input.clone() : input) as RequestInfo | URL;
      const response = await base(input, init);
      if (!watched || response.status !== 401 || !(openRef.current || await superseded(base))) return response;
      show();
      // Held until the user signs in again here, then sent once more with the new sign-in.
      return new Promise<Response>(resolve => { held.current.push({ retry: () => { void base(again, init).then(next => resolve(next)); } }); });
    };
    const check = () => { if (!openRef.current && document.visibilityState === 'visible') void superseded(base).then(yes => { if (yes) show(); }); };
    const timer = window.setInterval(check, checkEveryMs);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (saving || !original.current) return;
    setSaving(true); setError('');
    try {
      const response = await original.current('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'You could not be signed in');
      const waiting = held.current; held.current = [];
      openRef.current = false; setOpen(false); setPassword('');
      waiting.forEach(request => request.retry());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'You could not be signed in'); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={() => {}}>
    <DialogContent className="sm:max-w-md" showCloseButton={false} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader>
        <span className="session-guard-icon" aria-hidden="true"><MonitorSmartphoneIcon /></span>
        <DialogTitle>Signed in on another device</DialogTitle>
        <DialogDescription>Your account was just used to sign in somewhere else, so this device was signed out. Anything you had not saved is still on this page: sign in again here and it will be saved</DialogDescription>
      </DialogHeader>
      <form onSubmit={event => void signIn(event)}><FieldGroup>
        <Field><FieldLabel htmlFor="session-guard-email">Work email</FieldLabel><Input id="session-guard-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={saving} /></Field>
        <Field><FieldLabel htmlFor="session-guard-password">Password</FieldLabel><Input id="session-guard-password" type="password" autoComplete="current-password" required autoFocus value={password} onChange={event => setPassword(event.target.value)} disabled={saving} /><FieldDescription>Signing in here signs out the other device</FieldDescription></Field>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </FieldGroup>
      <DialogFooter className="mt-6"><Button asChild variant="outline"><a href={signInHref}>Go to sign in</a></Button><Button type="submit" disabled={saving || !password}>{saving && <Spinner data-icon="inline-start" />}Sign in here</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
