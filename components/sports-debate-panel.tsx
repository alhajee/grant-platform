"use client";

import { useEffect, useRef, useState } from "react";
import { MessagesSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { CurrencyInput } from "@/components/currency-input";
import { formatKobo } from "@/lib/money-format";
import { toKobo } from "@/lib/funding-policy";

type Props = {
  /** The Sports allocation ("123.45"), null until the plan has funding. */
  envelope: string | null;
  /** The Debate amount ("123.45"), null until set. */
  amount: string | null;
  /** What Debate items already come to, in kobo. */
  used: bigint;
  disabled: boolean;
  planHref: (path: string) => string;
  onSaved: () => Promise<unknown>;
};

/**
 * UBEC167: how much of the Sports allocation goes to Debate (₦0 if none; Quiz gets no amount). Asked before any Sports
 * item: the dialog opens by itself while the amount is unset. The other sections' shares apply to what is left.
 */
export function SportsDebatePanel({ envelope, amount, used, disabled, planHref, onSaved }: Props) {
  const unset = amount == null && envelope != null;
  const [open, setOpen] = useState(false), [value, setValue] = useState(amount ?? ""), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const asked = useRef(false);
  useEffect(() => { if (unset && !disabled && !asked.current) { asked.current = true; setOpen(true); } }, [unset, disabled]);
  if (envelope == null) return null;
  const whole = toKobo(envelope), typed = /^\d{1,13}(\.\d{1,2})?$/.test(value) ? toKobo(value) : null;
  const problem = typed == null ? "Enter the Debate amount in naira (₦0 if none)" : typed > whole ? `The Debate amount can be at most the Sports allocation (${formatKobo(whole)})` : typed < used ? `Debate items already come to ${formatKobo(used)}` : "";

  async function save() {
    if (saving || problem) { setError(problem); return; }
    setSaving(true);
    try {
      const response = await fetch(planHref("/api/sports"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: "debate", action: "update", amount: value }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "The Debate amount could not be saved");
      await onSaved(); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Debate amount could not be saved"); }
    finally { setSaving(false); }
  }

  return <>
    <div className="sports-debate" data-unset={unset || undefined}>
      <MessagesSquareIcon aria-hidden="true" />
      <p>{unset ? <><b>Debate</b> · not set yet. Set how much of the Sports allocation goes to Debate</> : <><b>Debate</b> · {formatKobo(toKobo(amount!))} of the Sports allocation{used > BigInt(0) ? ` · ${formatKobo(used)} used` : ""}</>}</p>
      <Button size="sm" variant={unset ? "default" : "outline"} className="rounded-full" disabled={disabled} onClick={() => { setValue(amount ?? ""); setError(""); setOpen(true); }}>{unset ? "Set amount" : "Adjust"}</Button>
    </div>
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Amount for Debate</DialogTitle><DialogDescription>How much of the Sports allocation ({formatKobo(whole)}) goes to Debate? Enter ₦0 if none. Debate items must use this amount in full, and the other Sports sections share what is left</DialogDescription></DialogHeader>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="debate-amount">Debate (₦)</FieldLabel>
          <CurrencyInput id="debate-amount" autoFocus value={value} maxIntegerDigits={13} onValueChange={(next) => { setValue(next); setError(""); }} aria-invalid={!!error} />
          {typed != null && typed <= whole && <FieldDescription>Left for the other Sports sections: {formatKobo(whole - typed)}</FieldDescription>}
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>{unset ? "Later" : "Cancel"}</Button><Button disabled={saving || !value} onClick={() => void save()}>{saving && <Spinner data-icon="inline-start" />}Save amount</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
