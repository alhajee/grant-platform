'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { SubebHeader } from '@/components/subeb-header';
import { CurrencyInput, unitCostDecimals } from '@/components/currency-input';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { nairaFormat } from '@/lib/money-format';
import { procurementItemSearch, type ProcurementItem } from '@/lib/procurement';

type Data = { items: ProcurementItem[]; canEdit: boolean; canApprove: boolean; required: boolean };
type Form = { id?: number; name: string; maker: string; modelYear: string; description: string; unitPrice: string };
const blank: Form = { name: '', maker: '', modelYear: '', description: '', unitPrice: '' };

/**
 * The state's Procurement price list (UBEC130 part 2): Procurement Data Entry adds and edits items, which wait for the
 * Procurement Director's approval; the Director approves them and may add or edit items directly. Approved items are
 * what component Data Entry picks for the items it buys. Saved plan items keep the price they were saved with.
 */
export default function ProcurementPage() {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [onlyPending, setOnlyPending] = useState(false);
  const [form, setForm] = useState<Form | null>(null), [saving, setSaving] = useState(false), [formError, setFormError] = useState(''), [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/procurement/items', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as Data & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the price list');
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the price list'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function send(body: Record<string, unknown>, done: string) {
    const response = await fetch('/api/procurement/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw Error(result.error || 'The price list could not be saved');
    toast.success(done); await load();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    const unitPrice = Number(form.unitPrice), modelYear = form.modelYear.trim() ? Number(form.modelYear) : null;
    if (!form.name.trim()) { setFormError('Enter the item name'); return; }
    if (modelYear !== null && !(/^\d{4}$/.test(form.modelYear.trim()) && modelYear >= 1950 && modelYear <= 2100)) { setFormError('Enter the year as four digits, e.g. 2025, or leave it empty'); return; }
    if (!form.description.trim()) { setFormError('Enter the description'); return; }
    if (!(unitPrice > 0)) { setFormError('Enter an amount above ₦0'); return; }
    setSaving(true); setFormError('');
    try {
      await send({ action: form.id ? 'update' : 'create', ...(form.id ? { id: form.id } : {}), name: form.name, maker: form.maker, modelYear, description: form.description, unitPrice },
        data?.canApprove ? 'Saved to the price list' : 'Saved. It waits for the Procurement Director’s approval');
      setForm(null);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'The item could not be saved'); }
    finally { setSaving(false); }
  }
  async function act(item: ProcurementItem, action: 'approve' | 'archive') {
    if (busy) return;
    setBusy(item.id);
    try { await send({ action, id: item.id }, action === 'approve' ? `${item.name} approved` : `${item.name} removed from the price list`); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The price list could not be saved'); }
    finally { setBusy(null); }
  }

  const pending = data?.items.filter(i => i.status === 'pending').length ?? 0;
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = data?.items.filter(item => (!onlyPending || item.status === 'pending') && words.every(word => procurementItemSearch(item).toLowerCase().includes(word))) ?? [];
  const startEdit = (item: ProcurementItem) => { setFormError(''); setForm({ id: item.id, name: item.name, maker: item.maker, modelYear: item.modelYear ? String(item.modelYear) : '', description: item.description, unitPrice: item.unitPrice.toFixed(4) }); };
  return <div className="dashboard-page"><SubebHeader procurement /><main className="state-users-main">
    <div className="state-users-heading"><div><h1>Price list</h1><p>{data?.canEdit ? 'Things to be procured and their prices. Everyone in the state can pick approved items, and the price is filled in for them' : 'Things to be procured and their prices, kept by Procurement. Pick them when you add an item, and the price is filled in for you'}</p></div>
      {data?.canEdit && <Button className="rounded-full" onClick={() => { setFormError(''); setForm(blank); }}><PlusIcon data-icon="inline-start" />Add item</Button>}</div>
    {error && <Alert variant="destructive"><AlertTitle>Price list unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {data?.canApprove && pending > 0 && <Banner tone="warning" className="mb-4" title={`${pending} ${pending === 1 ? 'item waits' : 'items wait'} for your approval`}
      action={<Button size="sm" className="rounded-full" onClick={() => setOnlyPending(value => !value)}>{onlyPending ? 'Show all items' : 'Review them'}</Button>}>Only approved items can be picked in the plan</Banner>}
    {onlyPending && pending === 0 && <Alert variant="success" className="mb-4"><AlertTitle>Nothing waits for your approval</AlertTitle><AlertDescription><Button size="sm" variant="outline" className="rounded-full" onClick={() => setOnlyPending(false)}>Show all items</Button></AlertDescription></Alert>}
    {!data && !error ? <Skeleton className="h-64 w-full rounded-2xl" /> : data && <Card>
      <CardHeader><CardTitle>Items <Badge variant="secondary">{data.items.length}</Badge></CardTitle><CardDescription>{data.canEdit ? 'Changing a price does not change items already saved in a plan' : 'Approved items you can pick when adding an item to buy'}</CardDescription>
        {data.items.length > 0 && <CardAction><InputGroup className="w-64 max-w-full"><InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search the price list" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} /></InputGroup></CardAction>}</CardHeader>
      <CardContent>{!data.items.length ? <UbecEmpty art={<NoItemsArt />} title="No items on the price list yet">{data.canEdit ? 'Add the things your state procures, with their prices' : 'Procurement has not added any approved items yet'}</UbecEmpty>
        : !shown.length ? <p className="py-6 text-center text-sm text-muted-foreground">No item matches your search</p>
        : <Table><TableHeader><TableRow><TableHead className="w-12">SN</TableHead><TableHead>Item</TableHead><TableHead>Maker</TableHead><TableHead>Year</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead>{data.canEdit && <TableHead>Status</TableHead>}{data.canEdit && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader><TableBody>
        {shown.map((item, index) => <TableRow key={item.id}>
          <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
          <TableCell className="font-medium">{item.name}</TableCell>
          <TableCell>{item.maker || <span className="text-muted-foreground">—</span>}</TableCell>
          <TableCell className="tabular-nums">{item.modelYear ?? <span className="text-muted-foreground">—</span>}</TableCell>
          <TableCell className="min-w-56 max-w-md whitespace-normal text-muted-foreground">{item.description || '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{nairaFormat.format(item.unitPrice)}</TableCell>
          {data.canEdit && <TableCell>{item.status === 'approved' ? <Badge variant="secondary"><CheckIcon aria-hidden="true" />Approved</Badge> : <Badge variant="warning">Waiting for approval</Badge>}<small className="block text-muted-foreground">{item.status === 'approved' && item.approvedByName ? `by ${item.approvedByName}` : `by ${item.updatedByName}`}</small></TableCell>}
          {data.canEdit && <TableCell className="text-right"><span className="inline-flex gap-1">
            {data.canApprove && item.status === 'pending' && <Button size="sm" className="rounded-full" disabled={busy !== null} onClick={() => void act(item, 'approve')}>{busy === item.id ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}Approve</Button>}
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => startEdit(item)}><PencilIcon data-icon="inline-start" />Edit</Button>
            {(data.canApprove || item.status === 'pending') && <Button size="sm" variant="ghost" className="rounded-full" aria-label={`Remove ${item.name}`} disabled={busy !== null} onClick={() => void act(item, 'archive')}><Trash2Icon /></Button>}
          </span></TableCell>}
        </TableRow>)}
      </TableBody></Table>}</CardContent>
    </Card>}
    <Dialog open={!!form} onOpenChange={open => { if (!open && !saving) setForm(null); }}><DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
      <DialogHeader><DialogTitle>{form?.id ? 'Edit item' : 'Add item'}</DialogTitle><DialogDescription>{data?.canApprove ? 'Your changes are approved at once' : 'The Procurement Director approves it before it can be picked'}</DialogDescription></DialogHeader>
      {form && <form onSubmit={event => void save(event)}><FieldGroup>
        <Field><FieldLabel htmlFor="item-name">Item <span className="text-destructive" aria-label="required">*</span></FieldLabel><Input id="item-name" required maxLength={160} value={form.name} disabled={saving} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Desktop computer" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field><FieldLabel htmlFor="item-maker">Maker <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="item-maker" maxLength={120} value={form.maker} disabled={saving} onChange={e => setForm({ ...form, maker: e.target.value })} placeholder="e.g. HP" /></Field>
          <Field><FieldLabel htmlFor="item-year">Year <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="item-year" inputMode="numeric" maxLength={4} value={form.modelYear} disabled={saving} onChange={e => setForm({ ...form, modelYear: e.target.value.replace(/\D/g, '') })} placeholder="e.g. 2025" /></Field>
        </div>
        <Field><FieldLabel htmlFor="item-description">Description <span className="text-destructive" aria-label="required">*</span></FieldLabel><Textarea id="item-description" rows={3} maxLength={1000} value={form.description} disabled={saving} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. HP all in one PC, Intel Core i5, 8GB RAM, 512GB SSD" /></Field>
        <Field><FieldLabel htmlFor="item-price">Amount (₦) <span className="text-destructive" aria-label="required">*</span></FieldLabel><CurrencyInput id="item-price" decimals={unitCostDecimals} placeholder="0.0000" maxIntegerDigits={11} value={form.unitPrice} disabled={saving} onValueChange={unitPrice => setForm({ ...form, unitPrice })} /></Field>
        {formError && <FieldError role="alert">{formError}</FieldError>}
      </FieldGroup><DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={saving} onClick={() => setForm(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Save item</Button></DialogFooter></form>}
    </DialogContent></Dialog>
  </main></div>;
}
