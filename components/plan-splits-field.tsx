'use client';
import './budget-split-dialog.css';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { CurrencyInput } from '@/components/currency-input';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { fromKobo, isSplitMode, toKobo, type EnvelopePlan } from '@/lib/funding-policy';
import { budgetPairs, sideNames, type BudgetPair } from '@/lib/budget-pairs';
import { nairaFormat } from '@/lib/money-format';

/** The amounts the BEAP Chair gives the stored sides (ICT, TLM) when creating a plan; the partner keeps the rest. */
export type SplitDraft = { ict: string; tlm: string };
const valid = (value: string) => /^\d{1,13}(\.\d{1,2})?$/.test(value);
const pct = (part: bigint, whole: bigint) => whole > BigInt(0) ? Math.round(Number(part * BigInt(1000) / whole)) / 10 : 0;

/** An even split of each shared budget, as a starting point. */
export function evenSplits(plan: EnvelopePlan): SplitDraft {
  const half = (pair: BudgetPair) => { const shared = budgetPairs[pair].envelope(plan); return shared == null ? '' : fromKobo(toKobo(shared) / BigInt(200) * BigInt(100)); };
  return { ict: half('teachers-ict'), tlm: half('infrastructure-tlm') };
}

/**
 * The plan's budget splits, set by the BEAP Chair in the create-plan dialog (client, 26 October 2026): Teacher Development
 * & ICT always, Infrastructure & TLM in split mode. A slider and an amount per pair; the server re-checks every rule.
 */
export function PlanSplitsField({ plan, value, onChange, error, disabled }: { plan: EnvelopePlan; value: SplitDraft; onChange: (next: SplitDraft) => void; error?: string; disabled?: boolean }) {
  const pairs: BudgetPair[] = isSplitMode(plan) ? ['infrastructure-tlm', 'teachers-ict'] : ['teachers-ict'];
  return <div className="flex flex-col gap-3">
    {pairs.map(id => {
      const pair = budgetPairs[id], side = pair.stored as 'ict' | 'tlm', shared = pair.envelope(plan);
      const sharedK = shared == null ? BigInt(0) : toKobo(shared), amount = valid(value[side]) ? toKobo(value[side]) : BigInt(0);
      const keeperK = sharedK > amount ? sharedK - amount : BigInt(0);
      const step = Math.max(1, Math.floor(Math.min(100000, Number(sharedK) / 100 * 0.005)));
      return <Field key={id} className="gap-2 rounded-lg border p-3">
        <FieldLabel htmlFor={`split-${side}`}>{pair.label}</FieldLabel>
        {shared == null || sharedK === BigInt(0) ? <FieldDescription>Enter the state counterpart fund first</FieldDescription> : <>
          <FieldDescription>Shared budget {nairaFormat.format(Number(shared))}. {sideNames[pair.keeper]} keeps what {sideNames[side]} does not use</FieldDescription>
          <div className="budget-split-bar" aria-hidden="true" style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden' }}>
            <span style={{ flex: `${Number(keeperK)} 0 0`, background: componentPalette[pair.keeper].fill }} />
            <span style={{ flex: `${Number(amount)} 0 0`, background: componentPalette[side].fill }} />
          </div>
          {/* The thumb sits on the boundary: left of it is the keeper's part, right of it the stored side's. */}
          <Slider aria-label={`${sideNames[pair.keeper]} amount`} min={0} max={Number(sharedK) / 100} step={step} value={[Number(keeperK) / 100]} disabled={disabled}
            onValueChange={([naira]) => { const keep = BigInt(Math.round(naira * 100)); onChange({ ...value, [side]: fromKobo(sharedK > keep ? sharedK - keep : BigInt(0)) }); }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-sm"><span className="text-muted-foreground">{sideNames[pair.keeper]}</span><br /><strong>{nairaFormat.format(Number(keeperK) / 100)}</strong> <span className="text-muted-foreground">· {pct(keeperK, sharedK)}%</span></div>
            <div><CurrencyInput id={`split-${side}`} aria-label={`${sideNames[side]} amount (₦)`} value={value[side]} maxIntegerDigits={13} disabled={disabled} onValueChange={next => onChange({ ...value, [side]: next })} />
              <span className="text-xs text-muted-foreground">{sideNames[side]} · {pct(amount, sharedK)}%</span></div>
          </div>
        </>}
      </Field>;
    })}
    {error && <FieldError>{error}</FieldError>}
  </div>;
}
