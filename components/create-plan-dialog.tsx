"use client";

import { useRef, useState, type FormEvent } from 'react';
import { CheckIcon, LockKeyholeIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldSet, FieldLegend, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import { CurrencyInput } from '@/components/currency-input';
import { FileUpload, DocumentFiles } from '@/components/document-files';
import { FieldHelp } from '@/components/field-help';
import { planSetupSchema, fundingTotal, maxRatFileBytes, maxRatTotalBytes } from '@/lib/plan-setup';
import { planHref, type PlanOverview } from '@/lib/action-plans';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

function FundingSummaryArtwork() {
  return <svg className="funding-summary-art" viewBox="0 0 76 68" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="66" height="62" rx="19" fill="#fffdf9" />
    <path d="M12 27 33 14l21 13H12Z" fill="#004740" />
    <path d="M16 29h34v24H16V29Z" fill="#fff" />
    <path d="M20 32v17M28.5 32v17M37 32v17M45.5 32v17" stroke="#8dac98" strokeWidth="4" strokeLinecap="round" />
    <path d="M12 52h42M9 57h48" stroke="#004740" strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="57" cy="48" rx="14" ry="5" fill="#f2b68e" />
    <path d="M43 43v5c0 2.8 6.3 5 14 5s14-2.2 14-5v-5" fill="#ffd8bd" />
    <ellipse cx="57" cy="43" rx="14" ry="5" fill="#ffe5d2" stroke="#d88957" strokeWidth="1.5" />
    <path d="M56 39.5v7M52.5 42h7M52.5 44h7" stroke="#9b4b22" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="63" cy="17" r="9" fill="#b9ce8e" stroke="#fff" strokeWidth="3" />
    <path d="m59 17 2.5 2.5 5-5.5" stroke="#004740" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function CreatePlanDialog({ stateName, plans, onClose }: { stateName: string; plans: PlanOverview[]; onClose: () => void }) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [implementation, setImplementation] = useState(year);
  const [quarters, setQuarters] = useState<string[]>([]);
  const [lodgment, setLodgment] = useState('');
  const [other, setOther] = useState('0');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const reserved = (value: string) => new Set(plans.filter(p => p.startYear <= Number(value) && p.endYear >= Number(value)).flatMap(p => p.fundingQuarters ?? [1, 2, 3, 4]));
  const occupied = reserved(year);
  const total = /^\d{0,13}(\.\d{0,2})?$/.test(lodgment) && /^\d{0,13}(\.\d{0,2})?$/.test(other) ? fundingTotal(lodgment || '0', other || '0') : '0';
  const displayedTotal = money.format(Number(total));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = planSetupSchema.safeParse({ planningYear: Number(year), implementationYear: Number(implementation), quarters: quarters.map(Number), stateLodgment: lodgment, otherFunding: other || '0' });
    const issues: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) issues[String(issue.path[0])] = issue.message;
    if (!files.length) issues.rat = 'Attach the Rapid Assessment Tool (RAT) document.';
    else if (files.length > 3 || files.some(f => !f.size || f.size > maxRatFileBytes) || files.reduce((sum, f) => sum + f.size, 0) > maxRatTotalBytes) issues.rat = 'Use 1–3 files, up to 5 MB each and 10 MB in total.';
    setErrors(issues);
    if (!parsed.success || Object.keys(issues).length) return;
    pending.current = true; setSaving(true);
    try {
      const body = new FormData(); body.set('setup', JSON.stringify(parsed.data));
      files.forEach(file => body.append('rat', file));
      const response = await fetch('/api/plans', { method: 'POST', body });
      const result = await response.json() as { error?: string; plan: { id: number } };
      if (!response.ok) throw new Error(result.error || 'Could not create your plan.');
      window.location.assign(planHref('/beap', result.plan.id));
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'Please try again.' });
      pending.current = false; setSaving(false);
    }
  }

  return <Dialog open onOpenChange={value => { if (!value && !pending.current) onClose(); }}>
    <DialogContent variant="inset-footer" className="create-plan-dialog flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]" showCloseButton={!saving} onEscapeKeyDown={e => { if (pending.current) e.preventDefault(); }} onInteractOutside={e => { if (pending.current) e.preventDefault(); }}>
      <DialogHeader className="border-b bg-[linear-gradient(135deg,color-mix(in_oklab,var(--sage)_18%,transparent),transparent_62%)] px-6 py-5">
        <div className="flex items-start gap-3 pr-8">
          <svg className="plan-calendar-art" viewBox="0 0 120 108" fill="none" aria-hidden="true">
            <ellipse cx="61" cy="96" rx="48" ry="7" fill="#004740" opacity=".08" />
            <rect x="15" y="22" width="77" height="68" rx="12" fill="#e2e9d5" transform="rotate(-9 15 22)" />
            <rect x="27" y="15" width="77" height="75" rx="12" fill="#fff" stroke="#b9cec5" />
            <path d="M27 27a12 12 0 0 1 12-12h53a12 12 0 0 1 12 12v13H27V27Z" fill="#004740" />
            <path d="M46 10v14M85 10v14" stroke="#8daf9a" strokeWidth="5" strokeLinecap="round" />
            <rect x="38" y="50" width="22" height="12" rx="4" fill="#dfe9d2" /><rect x="69" y="50" width="22" height="12" rx="4" fill="#ffdcc4" />
            <rect x="38" y="69" width="22" height="12" rx="4" fill="#e9e0f4" /><rect x="69" y="69" width="22" height="12" rx="4" fill="#dfe9d2" />
            <circle cx="101" cy="83" r="16" fill="#004740" stroke="white" strokeWidth="4" /><path d="m94 83 5 5 9-11" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="space-y-1">
            <DialogTitle>Create action plan</DialogTitle>
            <DialogDescription>Choose the plan period, enter the funding and upload the assessment.</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden" noValidate>
        <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4">
          <Card className="plan-funding-summary gap-0 overflow-hidden py-0 shadow-none">
            <CardContent className="p-0">
              <div className="plan-funding-layout">
                <div className="plan-funding-total flex items-center gap-3 p-4">
                  <span className="funding-art-wrap"><FundingSummaryArtwork /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Total funding</p>
                    <p className="funding-total-value" data-long={displayedTotal.length > 18 || undefined}>{displayedTotal}</p>
                  </div>
                </div>
                <dl className="plan-funding-breakdown">
                  <div><dt>State contribution</dt><dd>{money.format(Number(lodgment || 0))}</dd></div>
                  <div><dt>UBEC match</dt><dd>{money.format(Number(lodgment || 0))}</dd></div>
                  <div><dt>Other funding</dt><dd>{money.format(Number(other || 0))}</dd></div>
                </dl>
              </div>
            </CardContent>
          </Card>

          <FieldGroup className="gap-3">
            <FieldSet disabled={saving} className="gap-3 rounded-xl border bg-card p-3 shadow-xs"><FieldLegend className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>Plan period</FieldLegend><FieldGroup className="gap-3">
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                <Field data-invalid={!!errors.planningYear}><FieldLabel htmlFor="planning-year">Funding year<FieldHelp>The year the grant allocation belongs to.</FieldHelp></FieldLabel><Input id="planning-year" type="number" min={2004} max={2100} value={year} aria-invalid={!!errors.planningYear} onChange={e => { const value = e.target.value; setYear(value); setImplementation(current => value && Number(current) < Number(value) ? value : current); setQuarters(q => q.filter(n => !reserved(value).has(Number(n)))); }} />{errors.planningYear && <FieldError>{errors.planningYear}</FieldError>}</Field>
                <Field data-invalid={!!errors.implementationYear}><FieldLabel htmlFor="implementation-year">Implementation year<FieldHelp>The year the funded activities are expected to be carried out.</FieldHelp></FieldLabel><Input id="implementation-year" type="number" min={Number(year) || 2004} max={2100} value={implementation} aria-invalid={!!errors.implementationYear} onChange={e => setImplementation(e.target.value)} />{errors.implementationYear && <FieldError>{errors.implementationYear}</FieldError>}</Field>
              </FieldGroup>
              <Field data-invalid={!!errors.quarters}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel id="quarters-label">Quarters<FieldHelp>Select every quarter covered by this plan. Locked quarters already belong to another plan.</FieldHelp></FieldLabel>
                  {occupied.size < 4 && <Button type="button" variant="ghost" size="sm" className="quarter-select-all" disabled={saving} onClick={() => setQuarters(quarters.length === 4 - occupied.size ? [] : [1,2,3,4].filter(q => !occupied.has(q)).map(String))}>{quarters.length > 0 && quarters.length === 4 - occupied.size ? 'Clear' : occupied.size ? 'Select available' : 'Select all'}</Button>}
                </div>
                <ToggleGroup type="multiple" variant="outline" spacing={2} value={quarters} onValueChange={value => setQuarters(value.sort())} aria-labelledby="quarters-label" aria-describedby="quarter-guidance" aria-invalid={!!errors.quarters} className="plan-quarter-grid" disabled={saving}>
                  {['Jan – Mar', 'Apr – Jun', 'Jul – Sep', 'Oct – Dec'].map((months, index) => {
                    const q = index + 1; const taken = occupied.has(q); const selected = quarters.includes(String(q));
                    return <ToggleGroupItem key={q} value={String(q)} className="plan-quarter" disabled={taken} aria-label={`Quarter ${q}, ${months}${taken ? ', already assigned' : ''}`}>
                      <span className="quarter-top"><span className="quarter-number">Q{q}</span><span className="quarter-indicator">{taken ? <LockKeyholeIcon /> : selected ? <CheckIcon /> : null}</span></span>
                      <span className="quarter-months">{months}</span>
                    </ToggleGroupItem>;
                  })}
                </ToggleGroup>
                <FieldDescription id="quarter-guidance" className="quarter-guidance" aria-live="polite">{occupied.size === 4 ? 'All quarters are in another plan. Choose a different funding year.' : quarters.length ? `${quarters.length} ${quarters.length === 1 ? 'quarter' : 'quarters'} selected · ${quarters.length * 3} months` : 'Choose one or more quarters.'}</FieldDescription>
                {errors.quarters && <FieldError>{errors.quarters}</FieldError>}
              </Field>
            </FieldGroup></FieldSet>
            <FieldSet disabled={saving} className="gap-3 rounded-xl border bg-card p-3 shadow-xs"><FieldLegend className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>Funding amounts</FieldLegend><FieldGroup className="grid gap-3 md:grid-cols-2">
              <Field data-invalid={!!errors.stateLodgment}><FieldLabel htmlFor="state-lodgment">State contribution (₦)<FieldHelp>The amount paid by the state. UBEC adds the same amount.</FieldHelp></FieldLabel><CurrencyInput id="state-lodgment" placeholder="0.00" value={lodgment} maxIntegerDigits={13} onValueChange={setLodgment} aria-invalid={!!errors.stateLodgment} />{errors.stateLodgment && <FieldError>{errors.stateLodgment}</FieldError>}</Field>
              <Field data-invalid={!!errors.otherFunding}><FieldLabel htmlFor="other-funding">Other funding (₦)</FieldLabel><CurrencyInput id="other-funding" value={other} maxIntegerDigits={13} onValueChange={setOther} aria-invalid={!!errors.otherFunding} />{errors.otherFunding && <FieldError>{errors.otherFunding}</FieldError>}</Field>
            </FieldGroup></FieldSet>
            <Field data-invalid={!!errors.rat} className="gap-3 rounded-xl border bg-card p-3 shadow-xs">
              <div className="space-y-1"><FieldLabel htmlFor="rat-document"><span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>Assessment documents<FieldHelp>Upload the approved Rapid Assessment Tool (RAT). Each file can be up to 5 MB, with a 10 MB total.</FieldHelp></FieldLabel><FieldDescription>PDF, XLSX or DOCX · up to 3 files</FieldDescription></div>
              <FileUpload compact id="rat-document" label="assessment documents" multiple accept=".pdf,.xlsx,.docx" disabled={saving} onFiles={incoming=>{const combined=[...files,...incoming];if(combined.length>3||combined.reduce((sum,f)=>sum+f.size,0)>maxRatTotalBytes){setErrors(e=>({...e,rat:'Use up to 3 files and 10 MB in total.'}));return;}setFiles(combined);setErrors(e=>({...e,rat:''}));}}/>
              <DocumentFiles compact documents={files.map((file,i)=>({id:String(i),name:file.name,size:file.size,file}))} disabled={saving} onRemove={id=>setFiles(current=>current.filter((_,i)=>String(i)!==id))}/>{errors.rat && <FieldError>{errors.rat}</FieldError>}
            </Field>
          </FieldGroup>
        </div>
        {errors.form && <FieldError role="alert" className="px-6 pt-3">{errors.form}</FieldError>}
        <DialogFooter className="shrink-0 px-5 py-3"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}{saving ? 'Creating…' : 'Create action plan'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
