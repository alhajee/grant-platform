'use client';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CheckIcon, CircleAlertIcon, PencilIcon } from 'lucide-react';
import { CurrencyInput } from '@/components/currency-input';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type InlineKind = 'integer' | 'money' | 'text';
/** Saves one cell. Resolves to an error message to show under the cell, or null once saved. */
export type InlineSave = (value: string) => Promise<string | null>;

const maxQuantity = 1_000_000;
const maxMoney = 999_999_999_999.99;
const savedMs = 1600;

/** The same limits as the line forms, worded for a single cell. */
function problem(kind: InlineKind, raw: string): string | null {
  const value = raw.trim();
  if (kind === 'text') return value ? value.length > 1000 ? 'Use up to 1,000 characters.' : null : 'Enter a description.';
  if (kind === 'integer') {
    const n = Number(value);
    return /^\d+$/.test(value) && n >= 1 && n <= maxQuantity ? null : `Enter a whole number from 1 to ${maxQuantity.toLocaleString('en-NG')}.`;
  }
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 && n <= maxMoney ? null : 'Enter an amount greater than zero.';
}

type InlineCellProps = {
  kind: InlineKind;
  /** The saved value as the form holds it ("12", "4500.5", "Exercise books"). */
  value: string;
  /** How a value reads in the table. */
  format: (value: string) => ReactNode;
  /** Names the cell for assistive technology, e.g. "Quantity for Footballs". */
  label: string;
  editable: boolean;
  /** Why an otherwise editable cell is locked right now (shown as its tooltip). */
  lockedReason?: string | null;
  onSave: InlineSave;
  /** Takes over showing the message (e.g. as a full-width strip under the row); '' clears it. */
  onError?: (message: string) => void;
  className?: string;
};

/**
 * A table cell that edits in place: click or Enter to edit, Enter or leaving the cell saves, Esc cancels.
 * It shows a spinner while saving and a tick when done; a refused save restores the saved value and
 * shows the reason under the cell. Clicks and keys stay inside, so the row's own action does not fire.
 */
export function InlineCell({ kind, value, format, label, editable, lockedReason, onSave, onError, className }: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setErrorState] = useState('');
  const setError = (message: string) => { setErrorState(message); onError?.(message); };
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committing = useRef(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const locked = !editable || Boolean(lockedReason) || status === 'saving';
  const start = () => { if (locked) return; setText(value); setError(''); setEditing(true); };
  const close = (refocus: boolean) => { setEditing(false); if (refocus) requestAnimationFrame(() => trigger.current?.focus()); };

  async function commit(refocus: boolean) {
    if (committing.current) return;
    const next = text.trim();
    if (next === value.trim() || (kind !== 'text' && next !== '' && Number(next) === Number(value))) { setError(''); close(refocus); return; }
    // Enter keeps the cell open to fix the value; leaving the cell restores the saved value and says why.
    const invalid = problem(kind, next);
    if (invalid) { setError(invalid); if (!refocus) close(false); return; }
    committing.current = true;
    setError(''); setPending(next); setStatus('saving'); close(refocus);
    try {
      const refused = await onSave(next);
      if (refused) { setError(refused); setStatus('idle'); }
      else {
        setStatus('saved');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus('idle'), savedMs);
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Unable to save this change.');
      setStatus('idle');
    } finally { setPending(null); committing.current = false; }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setError(''); close(true); }
    else if (event.key === 'Enter' && !(kind === 'text' && event.shiftKey)) { event.preventDefault(); void commit(true); }
  }

  const field = { 'aria-label': label, 'aria-invalid': Boolean(error) || undefined, autoFocus: true, onKeyDown, onBlur: () => void commit(false), className: 'inline-cell-input' };
  const shown = pending ?? value;
  return <div className={cn('inline-cell', className)} data-kind={kind} data-status={status} data-error={error ? true : undefined} data-editing={editing || undefined}
    onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {editing
      ? kind === 'money' ? <CurrencyInput {...field} value={text} onValueChange={setText} maxIntegerDigits={12} />
        : kind === 'integer' ? <Input {...field} type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} value={text} onChange={event => setText(event.target.value)} />
          : <Textarea {...field} rows={2} maxLength={1000} value={text} onChange={event => setText(event.target.value)} />
      : locked && status !== 'saving'
        ? <span className="inline-cell-value" title={lockedReason ?? undefined}>{format(value)}</span>
        : <button ref={trigger} type="button" className="inline-cell-trigger" disabled={status === 'saving'} aria-label={`${label}: ${shown}. Edit`} title="Click to edit" onClick={start}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); start(); } }}>
          <span className="inline-cell-value">{format(shown)}</span>
          {status === 'saving' ? <Spinner className="inline-cell-icon" /> : status === 'saved' ? <CheckIcon className="inline-cell-icon inline-cell-saved" aria-label="Saved" /> : <PencilIcon className="inline-cell-icon inline-cell-pencil" aria-hidden="true" />}
        </button>}
    {error && !onError && <p className="inline-cell-error" role="alert"><CircleAlertIcon aria-hidden="true" />{error}</p>}
  </div>;
}
