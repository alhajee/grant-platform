'use client';

import './confirm-step.css';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowLeftIcon, InfoIcon, LockIcon, MessageSquareQuoteIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/** One line of the summary: "Goes to · BEAP Chair". */
export type ConfirmFact = { label: string; value: ReactNode };
/** A consequence of the step: lock (you lose edit access), warning (cannot be undone) or info. */
export type ConfirmNote = { kind?: 'lock' | 'warning' | 'info'; text: ReactNode };
/** default: an ordinary hand-off; strong: final but not destructive (approval); destructive: sends work back. */
export type ConfirmTone = 'default' | 'strong' | 'destructive';

/** Exact naira amounts for the summary (the cards use compact figures; a confirmation states the full sum). */
export const confirmMoney = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

const noteIcons = { lock: LockIcon, warning: TriangleAlertIcon, info: InfoIcon } as const;

/**
 * Two steps in one workflow dialog: the comment step, then a confirmation of exactly what will happen.
 * `review` moves to the confirmation (after the comment step's own validation); `back` returns with the text
 * kept and focuses `focusId` (the comment field). `escape` is the dialog's onEscapeKeyDown: on the
 * confirmation step Esc goes back instead of closing, and nothing closes while saving.
 */
export function useConfirmStep(focusId?: string) {
  const [confirming, setConfirming] = useState(false), [returned, setReturned] = useState(false);
  const review = useCallback(() => setConfirming(true), []);
  const back = useCallback(() => {
    setConfirming(false); setReturned(true);
    if (focusId) requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }, [focusId]);
  const reset = useCallback(() => { setConfirming(false); setReturned(false); }, []);
  const escape = useCallback((event: { preventDefault: () => void }, saving: boolean) => {
    if (saving) { event.preventDefault(); return; }
    if (confirming) { event.preventDefault(); back(); }
  }, [confirming, back]);
  /** Class for the comment step's header and body: slides back in after Back. */
  const commentStepClass = returned ? 'confirm-step-return' : undefined;
  return { confirming, review, back, reset, escape, commentStepClass };
}

/**
 * The confirmation step of a workflow dialog. Render it in place of the dialog's header and form while
 * `useConfirmStep().confirming` is true, so no second modal opens. Enter confirms (once any acknowledgement
 * is ticked), Back keeps the comment.
 */
export function ConfirmStep({ title, description, facts, notes = [], comment, commentLabel = 'Your comment', tone = 'default', acknowledge, confirmLabel, saving, error, bodyClassName, onBack, onConfirm }: {
  title: string; description?: ReactNode; facts: readonly ConfirmFact[]; notes?: readonly ConfirmNote[];
  /** The comment from the first step, quoted back. Undefined hides the quote (steps without a comment field). */
  comment?: string; commentLabel?: string; tone?: ConfirmTone;
  /** "I have reviewed …": the final button stays disabled until it is ticked. */
  acknowledge?: string;
  /** The real action, e.g. "Yes, send to BEAP Chair". */
  confirmLabel: string; saving: boolean; error?: string;
  /** Padding for the body, matching the dialog's own layout (inset-footer dialogs pad their sections). */
  bodyClassName?: string; onBack: () => void; onConfirm: () => void;
}) {
  const [acked, setAcked] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null), ackRef = useRef<HTMLButtonElement>(null), backRef = useRef<HTMLButtonElement>(null);
  const ackId = useId();
  const ready = !saving && (!acknowledge || acked);
  // The comment step's button disappears with the step, so focus moves to the first thing to act on here.
  useEffect(() => { (acknowledge ? ackRef : confirmRef).current?.focus(); }, [acknowledge]);
  const run = () => { if (ready) onConfirm(); };
  // Enter confirms from anywhere in the step except Back (the checkbox swallows Enter, so catch it here).
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (backRef.current && event.target instanceof Node && backRef.current.contains(event.target)) return;
    event.preventDefault(); run();
  };
  const trimmed = comment?.trim();
  return <>
    <DialogHeader className="confirm-step-enter confirm-step-head" data-tone={tone}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description ?? 'Check the details below before you continue.'}</DialogDescription>
    </DialogHeader>
    <form className="confirm-step-enter confirm-step-form" data-tone={tone} onSubmit={event => { event.preventDefault(); run(); }} onKeyDown={onKeyDown}>
      <div className={cn('confirm-step', bodyClassName)}>
        {facts.length > 0 && <dl className="confirm-facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
        {comment !== undefined && <figure className="confirm-quote" data-empty={!trimmed || undefined}>
          <figcaption><MessageSquareQuoteIcon aria-hidden="true" />{commentLabel}</figcaption>
          {trimmed ? <blockquote>{trimmed}</blockquote> : <p>No comment added.</p>}
        </figure>}
        {notes.length > 0 && <ul className="confirm-notes">{notes.map((note, index) => {
          const Icon = noteIcons[note.kind ?? 'info'];
          return <li key={index} data-kind={note.kind ?? 'info'}><Icon aria-hidden="true" /><span>{note.text}</span></li>;
        })}</ul>}
        {acknowledge && <Field orientation="horizontal" className="confirm-ack" data-checked={acked || undefined}>
          <Checkbox ref={ackRef} id={ackId} checked={acked} disabled={saving} onCheckedChange={next => setAcked(next === true)} />
          <FieldLabel htmlFor={ackId} className="font-normal">{acknowledge}</FieldLabel>
        </Field>}
        {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      </div>
      <DialogFooter className="confirm-step-footer">
        <Button ref={backRef} type="button" variant="outline" disabled={saving} onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />Back</Button>
        <Button ref={confirmRef} type="submit" variant={tone === 'destructive' ? 'destructive' : 'default'} disabled={!ready}>{saving && <Spinner data-icon="inline-start" />}{confirmLabel}</Button>
      </DialogFooter>
    </form>
  </>;
}
