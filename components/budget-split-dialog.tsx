'use client';
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { CurrencyInput } from '@/components/currency-input';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { fromKobo, percent, policyShare, toKobo, type EnvelopePlan } from '@/lib/funding-policy';
import { budgetPairs, pairOf, sideItems, sideNames, storedAllocation, type SplitSide } from '@/lib/budget-pairs';
import { currentPlanHref } from '@/lib/action-plans';
import './budget-split-dialog.css';

// The split of a shared envelope as one bar (lib/budget-pairs.ts): the pair's keeper on the left (Infrastructure,
// Teacher Development), the stored side on the right (TLM, ICT). Amounts are whole kobo numbers here; the server
// re-checks every rule (PATCH /api/activities/budget-split with the viewer's own side).
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 });
const naira = (kobo: number) => kobo / 100;
const share = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : 0;
const koboOf = (value: string) => /^\d+(\.\d{0,2})?$/.test(value) ? Number(toKobo(value)) : NaN;

type Props = {
  /** The viewer's side: the amount sent to the server is this side's. */
  side: SplitSide; plan: EnvelopePlan;
  /** What this side and the other side already propose (naira). */
  proposed: number; partnerProposed: number;
  open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void>;
};

export function BudgetSplitDialog({ side, plan, proposed, partnerProposed, open, onOpenChange, onSaved }: Props) {
  const pair = budgetPairs[pairOf(side)], keeper = pair.keeper, stored = pair.stored, viewerKeeps = side === keeper;
  const sharedK = Number(toKobo(pair.envelope(plan) ?? '0')), storedNow = storedAllocation(plan, side);
  const floors = { [side]: Math.round(proposed * 100), [viewerKeeps ? stored : keeper]: Math.round(partnerProposed * 100) } as Record<SplitSide, number>;
  const keeperFloor = floors[keeper] ?? 0, storedFloor = floors[stored] ?? 0;
  // The viewer's own amount must be above zero (the API refuses ₦0 for the side that names it); the other side may be ₦0 only with nothing planned.
  const lo = viewerKeeps ? Math.max(keeperFloor, 100) : keeperFloor;
  const hi = sharedK - (viewerKeeps ? storedFloor : Math.max(storedFloor, 100));
  const clamp = (k: number) => Math.min(Math.max(k, lo), hi);
  const initial = storedNow != null ? sharedK - Number(toKobo(storedNow)) : clamp(Math.round(sharedK / 200) * 100);
  const [keeperK, setKeeperK] = useState(initial);
  const [inputs, setInputs] = useState({ keeper: fromKobo(BigInt(initial)), stored: fromKobo(BigInt(sharedK - initial)) });
  const [clamped, setClamped] = useState(''), [serverError, setServerError] = useState(''), [busy, setBusy] = useState(false);
  const storedK = sharedK - keeperK;
  const stepNaira = Math.max(1, Math.floor(Math.min(100000, naira(sharedK) * 0.005)));
  const names = { keeper: sideNames[keeper], stored: sideNames[stored] };
  const label = pair.label.replace(' & ', ' and ');
  const note = `${percent(policyShare(plan, pairOf(side) === 'infrastructure-tlm' ? 'infrastructure' : 'teachers'))}% of this plan's funding`;

  const problem = useMemo(() => {
    if (lo > hi) return `${names.keeper} and ${names.stored} already propose more than ${money.format(naira(sharedK))} together. Reduce their ${sideItems[keeper]} or ${sideItems[stored]} first.`;
    if (!Number.isFinite(keeperK) || keeperK < 0 || keeperK > sharedK) return `Each amount must be between ₦0 and ${money.format(naira(sharedK))}.`;
    const own = viewerKeeps ? keeperK : storedK, ownFloor = viewerKeeps ? keeperFloor : storedFloor, otherK = viewerKeeps ? storedK : keeperK, otherFloor = viewerKeeps ? storedFloor : keeperFloor;
    const ownName = sideNames[side], otherSide = viewerKeeps ? stored : keeper;
    if (own <= 0) return `Give ${ownName} an amount greater than zero.`;
    if (own < ownFloor) return `${ownName} ${sideItems[side]} already propose ${money.format(naira(ownFloor))}.`;
    if (otherK < otherFloor) return `${sideNames[otherSide]} ${sideItems[otherSide]} already propose ${money.format(naira(otherFloor))}, so ${ownName} can use up to ${money.format(naira(sharedK - otherFloor))}.`;
    return '';
  }, [lo, hi, keeperK, storedK, sharedK, viewerKeeps, keeperFloor, storedFloor, side, keeper, stored, names.keeper, names.stored]);

  function setKeeper(k: number, from?: 'keeper' | 'stored') {
    setKeeperK(k); setServerError('');
    setInputs(current => ({ keeper: from === 'keeper' ? current.keeper : fromKobo(BigInt(Math.max(k, 0))), stored: from === 'stored' ? current.stored : fromKobo(BigInt(Math.max(sharedK - k, 0))) }));
  }
  function slide([value]: number[]) {
    const wanted = Math.round(value) * 100, next = clamp(wanted);
    // Explain why the thumb stopped: the side it would squeeze already has lines (or packages), or must keep more than ₦0.
    const squeezed = wanted < lo ? { name: names.keeper, floor: keeperFloor } : wanted > hi ? { name: names.stored, floor: storedFloor } : null;
    setClamped(!squeezed ? '' : squeezed.floor > 0 ? `${squeezed.name} already has ${money.format(naira(squeezed.floor))} planned.` : `${squeezed.name} needs more than ₦0.`);
    setKeeper(next);
  }
  function type(which: 'keeper' | 'stored', value: string) {
    setInputs(current => ({ ...current, [which]: value })); setClamped('');
    const k = koboOf(value);
    if (Number.isFinite(k)) setKeeper(which === 'keeper' ? k : sharedK - k, which);
  }
  const presets = [
    { label: 'Even split', k: Math.round(sharedK / 200) * 100 },
    { label: `All to ${names.keeper}`, k: sharedK },
    ...(storedNow != null ? [{ label: 'As saved', k: sharedK - Number(toKobo(storedNow)) }] : []),
  ].filter(p => p.k >= lo && p.k <= hi && p.k !== keeperK).slice(0, 3);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (problem || busy) return;
    setBusy(true); setServerError('');
    try {
      const amount = fromKobo(BigInt(viewerKeeps ? keeperK : storedK));
      const r = await fetch(currentPlanHref('/api/activities/budget-split'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, side }) });
      const result = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { setServerError(result.error || 'The budget split could not be saved.'); return; }
      toast.success(`${label} split saved.`);
      onOpenChange(false); await onSaved();
    } catch { setServerError('The budget split could not be saved. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  const keeperPct = share(keeperK, sharedK), storedPct = Math.round((100 - keeperPct) * 10) / 10;
  const colours = { '--split-keeper': componentPalette[keeper].fill, '--split-keeper-ink': componentPalette[keeper].ink, '--split-stored': componentPalette[stored].fill, '--split-stored-ink': componentPalette[stored].ink } as CSSProperties;
  const legend = (which: 'keeper' | 'stored', k: number, pct: number, floor: number) => <div className="split-legend-item" data-side={which}>
    <span className="split-legend-name"><i aria-hidden="true" />{names[which]}</span>
    <strong className="split-legend-amount"><span className="split-full">{money.format(naira(k))}</span><span className="split-compact">{compact.format(naira(k))}</span></strong>
    <span className="split-legend-pct">{pct}% of the pool{floor > 0 && <> · {compact.format(naira(floor))} already planned</>}</span>
  </div>;

  return <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="budget-split-dialog sm:max-w-2xl" style={colours}>
      <form onSubmit={save} className="flex flex-col gap-5">
        <DialogHeader>
          <DialogTitle>Share the {money.format(naira(sharedK))}</DialogTitle>
          <DialogDescription>{names.keeper} and {names.stored} share {note}. Choose how much each one gets.</DialogDescription>
        </DialogHeader>

        <div className="split-hero">
          <div className="split-bar" role="img" aria-label={`${names.keeper} ${keeperPct}%, ${names.stored} ${storedPct}%`}>
            <div className="split-segment" data-side="keeper" style={{ width: `${keeperPct}%` }}>{keeperPct >= 12 && <span>{keeperPct}%</span>}</div>
            <div className="split-segment" data-side="stored" style={{ width: `${storedPct}%` }}>{storedPct >= 12 && <span>{storedPct}%</span>}</div>
            {keeperFloor > 0 && <div className="split-floor" data-side="keeper" style={{ width: `${share(keeperFloor, sharedK)}%` }} title={`${money.format(naira(keeperFloor))} already planned`} />}
            {storedFloor > 0 && <div className="split-floor" data-side="stored" style={{ width: `${share(storedFloor, sharedK)}%` }} title={`${money.format(naira(storedFloor))} already planned`} />}
          </div>
          <Slider className="split-slider" min={0} max={Math.floor(naira(sharedK))} step={stepNaira} value={[Math.round(naira(keeperK))]} onValueChange={slide} aria-label={`${names.keeper} amount`} aria-valuetext={`${names.keeper} ${money.format(naira(keeperK))}, ${names.stored} ${money.format(naira(storedK))}`} />
          <div className="split-legend">{legend('keeper', keeperK, keeperPct, keeperFloor)}{legend('stored', storedK, storedPct, storedFloor)}</div>
          {clamped && <p className="split-clamped" role="status">{clamped} The slider stops there.</p>}
        </div>

        {presets.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Quick splits">{presets.map(p => <Button key={p.label} type="button" size="sm" variant="outline" className="rounded-full" onClick={() => { setClamped(''); setKeeper(p.k); }}>{p.label}</Button>)}</div>}

        <div className="split-inputs">
          <Field><FieldLabel htmlFor="split-keeper">{names.keeper} (₦)</FieldLabel><CurrencyInput id="split-keeper" value={inputs.keeper} maxIntegerDigits={12} onValueChange={value => type('keeper', value)} aria-invalid={!!problem} /></Field>
          <Field><FieldLabel htmlFor="split-stored">{names.stored} (₦)</FieldLabel><CurrencyInput id="split-stored" value={inputs.stored} maxIntegerDigits={12} onValueChange={value => type('stored', value)} aria-invalid={!!problem} /></Field>
        </div>
        {problem ? <FieldDescription className="text-destructive" role="alert">{problem}</FieldDescription> : <FieldDescription>{names.keeper} {money.format(naira(keeperK))} + {names.stored} {money.format(naira(storedK))} = {money.format(naira(sharedK))}</FieldDescription>}
        {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}

        <DialogFooter>
          {storedNow != null && <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>}
          <Button type="submit" disabled={busy || !!problem}>{busy && <Spinner data-icon="inline-start" />}Save split</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** The split in miniature: the same two-colour bar with both amounts (the shared budget panel's summary). */
export function BudgetSplitBar({ side, plan }: { side: SplitSide; plan: EnvelopePlan }) {
  const pair = budgetPairs[pairOf(side)], sharedK = Number(toKobo(pair.envelope(plan) ?? '0')), storedNow = storedAllocation(plan, side);
  if (storedNow == null || sharedK <= 0) return null;
  const storedK = Number(toKobo(storedNow)), keeperK = sharedK - storedK, keeperPct = share(keeperK, sharedK);
  const colours = { '--split-keeper': componentPalette[pair.keeper].fill, '--split-stored': componentPalette[pair.stored].fill } as CSSProperties;
  return <div className="split-mini" style={colours}>
    <div className="split-bar split-bar-mini" aria-hidden="true"><div className="split-segment" data-side="keeper" style={{ width: `${keeperPct}%` }} /><div className="split-segment" data-side="stored" style={{ width: `${100 - keeperPct}%` }} /></div>
    <div className="split-mini-legend"><span><i data-side="keeper" />{sideNames[pair.keeper]} <b>{compact.format(naira(keeperK))}</b></span><span><i data-side="stored" />{sideNames[pair.stored]} <b>{compact.format(naira(storedK))}</b></span></div>
  </div>;
}
