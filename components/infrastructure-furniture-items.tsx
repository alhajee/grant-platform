'use client';
import { useEffect, useRef, useState } from 'react';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput, unitCostDecimals } from '@/components/currency-input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EditorEmpty } from '@/components/empty-art/editor-empty';
import { EmptyFurnitureArt } from '@/components/empty-art/infrastructure';
import { nairaFormat } from '@/lib/money-format';
import type { InfrastructureInput } from '@/lib/infrastructure-model';
import { hasMoneyDecimals, lineMinor, minorToNaira, moneyDecimalsMessage } from '@/lib/money';

type FurnitureItem = InfrastructureInput['furniture'][number];
type Draft = { description: string; quantity: string; cost: string };
type DraftField = keyof Draft;
interface FurnitureItemsProps {
  items: FurnitureItem[];
  disabled: boolean;
  onChange: (items: FurnitureItem[]) => void;
  /** Tells the editor whether something is typed in the form but not yet added, so Continue can ask for it. */
  onPendingChange?: (pending: boolean) => void;
}
const empty: Draft = { description: '', quantity: '1', cost: '' };
const maxItems = 100;

/** Why the item cannot be added, per field (UBEC221: messages under the fields). */
export function furnitureDraftProblems(draft: Draft): Partial<Record<DraftField, string>> {
  const quantity = Number(draft.quantity), cost = Number(draft.cost);
  return {
    ...(!draft.description.trim() ? { description: 'Enter the item, for example Dual-seater desk' } : draft.description.trim().length > 500 ? { description: 'Use up to 500 characters' } : {}),
    ...(!draft.quantity.trim() || !Number.isInteger(quantity) || quantity <= 0 ? { quantity: 'Enter a whole number greater than zero' } : quantity > 1000000 ? { quantity: 'Use at most 1,000,000' } : {}),
    ...(!draft.cost.trim() || !(cost > 0) ? { cost: 'Enter a unit cost greater than zero' } : !hasMoneyDecimals(cost) ? { cost: moneyDecimalsMessage } : {}),
  };
}

/**
 * Furniture/Equipment items (UBEC225): one short form (item, quantity, unit cost, sub-total) with an Add button,
 * and a table of the items added, each with Edit and Remove. The stored shape (input.furniture) is unchanged.
 */
export function FurnitureItemsEditor({ items, disabled, onChange, onPendingChange }: FurnitureItemsProps) {
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const description = useRef<HTMLInputElement>(null);
  const pending = editing !== null || !!draft.description.trim() || !!draft.cost.trim();
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);

  const problems = furnitureDraftProblems(draft);
  const valid = Object.keys(problems).length === 0;
  const subTotal = valid ? minorToNaira(lineMinor(Number(draft.cost), Number(draft.quantity))) : null;
  const total = minorToNaira(items.reduce((sum, item) => sum + lineMinor(item.cost, item.quantity), BigInt(0)));
  const full = editing === null && items.length >= maxItems;

  const reset = () => { setDraft(empty); setEditing(null); setTried(false); };
  function submit() {
    setTried(true);
    if (!valid || full) return;
    const item: FurnitureItem = { description: draft.description.trim(), quantity: Number(draft.quantity), cost: Number(draft.cost) };
    onChange(editing === null ? [...items, item] : items.map((existing, index) => index === editing ? item : existing));
    reset();
    description.current?.focus();
  }
  function edit(index: number) {
    const item = items[index];
    setDraft({ description: item.description, quantity: String(item.quantity), cost: String(item.cost) });
    setEditing(index); setTried(false);
    description.current?.focus();
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
    if (editing === index) reset(); else if (editing !== null && editing > index) setEditing(editing - 1);
  }
  const error = (field: DraftField) => tried ? problems[field] : undefined;

  return <div className="infra-furniture flex flex-col gap-5">
    <FieldSet>
      <FieldLegend>{editing === null ? 'Add an item' : `Edit item ${editing + 1}`}</FieldLegend>
      <FieldDescription>Enter one kind of furniture or equipment at a time, then press {editing === null ? 'Add item' : 'Update item'}</FieldDescription>
      <form noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
        <FieldGroup className="gap-4">
          <Field data-invalid={error('description') ? true : undefined}>
            <FieldLabel htmlFor="furniture-description">Item<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
            <Input ref={description} id="furniture-description" required aria-required="true" aria-invalid={error('description') ? true : undefined} maxLength={500} placeholder="e.g. Dual-seater desk" disabled={disabled}
              value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
            {error('description') && <FieldError>{error('description')}</FieldError>}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={error('quantity') ? true : undefined}>
              <FieldLabel htmlFor="furniture-quantity">Quantity<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
              <Input id="furniture-quantity" type="number" inputMode="numeric" min={1} step={1} required aria-required="true" aria-invalid={error('quantity') ? true : undefined} disabled={disabled}
                value={draft.quantity} onChange={e => setDraft(d => ({ ...d, quantity: e.target.value }))} />
              {error('quantity') && <FieldError>{error('quantity')}</FieldError>}
            </Field>
            <Field data-invalid={error('cost') ? true : undefined}>
              <FieldLabel htmlFor="furniture-cost">Unit cost (₦)<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
              <CurrencyInput id="furniture-cost" decimals={unitCostDecimals} required aria-required="true" aria-invalid={error('cost') ? true : undefined} placeholder="0.0000" disabled={disabled}
                value={draft.cost} onValueChange={cost => setDraft(d => ({ ...d, cost }))} />
              {error('cost') && <FieldError>{error('cost')}</FieldError>}
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm"><span className="text-muted-foreground">Sub-total </span><strong className="tabular-nums">{subTotal === null ? '—' : nairaFormat.format(subTotal)}</strong></p>
            <div className="flex gap-2">
              {editing !== null && <Button type="button" variant="ghost" disabled={disabled} onClick={reset}>Cancel</Button>}
              <Button type="submit" disabled={disabled || full}><PlusIcon data-icon="inline-start" />{editing === null ? 'Add item' : 'Update item'}</Button>
            </div>
          </div>
          {full && <FieldError>A package takes up to {maxItems} items</FieldError>}
        </FieldGroup>
      </form>
    </FieldSet>
    {items.length ? <Table className="infra-furniture-table">
      <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Sub-total</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{items.map((item, index) => <TableRow key={index} data-state={editing === index ? 'selected' : undefined}>
        <TableCell className="whitespace-normal"><strong>{item.description}</strong><p className="text-xs text-muted-foreground tabular-nums">{nairaFormat.format(item.cost)} each</p></TableCell>
        <TableCell className="text-right tabular-nums">{item.quantity.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">{nairaFormat.format(minorToNaira(lineMinor(item.cost, item.quantity)))}</TableCell>
        <TableCell><div className="flex justify-end gap-1">
          <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Edit ${item.description}`} onClick={() => edit(index)}><PencilIcon /></Button>
          <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Remove ${item.description}`} onClick={() => remove(index)}><Trash2Icon /></Button>
        </div></TableCell>
      </TableRow>)}</TableBody>
      <TableFooter><TableRow><TableCell colSpan={2}>{items.length} item{items.length === 1 ? '' : 's'}</TableCell><TableCell className="text-right tabular-nums">{nairaFormat.format(total)}</TableCell><TableCell /></TableRow></TableFooter>
    </Table> : <EditorEmpty art={<EmptyFurnitureArt />} caption="No items yet. Add the first one above" />}
  </div>;
}
