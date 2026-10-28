'use client';
import './assess-items-dialog.css';
import { useMemo, useState } from 'react';
import { CheckIcon, ChevronDownIcon, ClipboardCheckIcon, FileTextIcon, HistoryIcon, LayoutGridIcon, ListIcon, MessageSquareTextIcon, ShieldCheckIcon, Undo2Icon, XIcon } from 'lucide-react';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import type { CommentSheet } from '@/lib/plan-comments';
import { DocumentPreview, type DocumentFile } from '@/components/document-files';
import { InfrastructurePackageDetails } from '@/components/infrastructure-package-details';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import type { WorkbookAssessment } from '@/components/plan-workbook/assessment-context';
import { assessmentItems, componentDocuments, groupItems, type AssessmentDocument, type AssessmentItem } from '@/lib/assessment-items';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import type { Snapshot } from '@/lib/plan-review';
import type { ItemDecisionValue } from '@/lib/ubec-flow';
import { nairaFormat } from '@/lib/money-format';

type Filter = 'all' | 'open' | 'accept' | 'reject' | 'corrected';
const filterLabels: Record<Filter, string> = { all: 'All', open: 'To decide', accept: 'Accepted', reject: 'Rejected', corrected: 'Corrected' };

/**
 * UBEC138: the Assessment Officer's "Assess items" screen, laid out like the SUBEB editors. Activities (or Sports
 * sections, package types) on the left with their progress; their items on the right with the figures that matter and
 * every uploaded document as a link. Accept or reject one item, or tick several (or a whole activity) and decide them
 * together; a rejection needs a reason (UBEC176). Documents open in the app (UBEC175); Infrastructure items show their
 * package's requirements (UBEC174). Ticking works on the items the filter shows. Saves through the page's `assessment.decide` (PUT /api/ubec/decisions),
 * the same as the workbook, which stays available.
 * UBEC186: the Oversight Departments (Directors and their officers) open the same screen to review items: each item takes
 * an observation (a UBEC row comment, or a reply to the open one), and the Oversight Director finishes with Observations
 * done. Items show as a list or a grid.
 */
export function AssessItemsDialog({ open, onOpenChange, pillar, name, snapshot, assessment, comments }: {
  open: boolean; onOpenChange: (open: boolean) => void; pillar: ImplementedPillar; name: string; snapshot: Snapshot; assessment: WorkbookAssessment | null; comments?: CommentsController | null;
}) {
  if (!assessment) return null;
  return <AssessItems open={open} onOpenChange={onOpenChange} pillar={pillar} name={name} snapshot={snapshot} assessment={assessment} comments={comments ?? null} />;
}

function AssessItems({ open, onOpenChange, pillar, name, snapshot, assessment, comments }: {
  open: boolean; onOpenChange: (open: boolean) => void; pillar: ImplementedPillar; name: string; snapshot: Snapshot; assessment: WorkbookAssessment; comments: CommentsController | null;
}) {
  const items = useMemo(() => assessmentItems(snapshot, pillar), [snapshot, pillar]);
  const groups = useMemo(() => groupItems(items), [items]);
  const extraDocuments = useMemo(() => componentDocuments(snapshot, pillar), [snapshot, pillar]);
  const decisions = assessment.decisions(pillar), previous = assessment.previous(pillar), corrected = assessment.corrected?.(pillar) ?? new Set<string>();
  const can = assessment.canDecide(pillar);
  // UBEC186: Oversight Directors and their officers review items and add observations.
  const observing = !can && (assessment.canObserve(pillar) || !!assessment.canComment?.(pillar));
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const threadsFor = (rowRef: string) => (comments?.threads ?? []).filter(t => t.scope === 'ubec' && t.sheet === pillar && t.rowRef === rowRef);
  const observations = items.filter(i => threadsFor(i.rowRef).some(t => !t.resolvedAt)).length;
  const [group, setGroup] = useState<string | null>(null), [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string[] | null>(null), [reason, setReason] = useState('');
  const [preview, setPreview] = useState<DocumentFile | null>(null);
  const openDocument = (doc: AssessmentDocument) => setPreview({ id: doc.id, name: doc.name, size: doc.size, url: doc.href });

  const status = (item: AssessmentItem): Filter => decisions.get(item.rowRef)?.decision ?? 'open';
  const inGroup = group ? items.filter(i => i.group === group) : items;
  // UBEC195: "Corrected" lists the items rejected last time that the SUBEB changed.
  const matches = (i: AssessmentItem, f: Filter) => f === 'all' || (f === 'corrected' ? corrected.has(i.rowRef) : status(i) === f);
  const shown = inGroup.filter(i => matches(i, filter));
  const decided = items.filter(i => decisions.has(i.rowRef)).length;
  const counts = (list: readonly AssessmentItem[]) => ({ decided: list.filter(i => decisions.has(i.rowRef)).length, total: list.length });
  // Only the ticked items the filter shows count (UBEC175: "To decide · 6" then Select all must be 6, not 7).
  const picked = selected.filter(r => shown.some(i => i.rowRef === r));
  const allShownSelected = shown.length > 0 && shown.every(i => selected.includes(i.rowRef));
  const toggle = (rowRef: string, on: boolean) => setSelected(current => on ? [...new Set([...current, rowRef])] : current.filter(r => r !== rowRef));

  async function decide(rowRefs: readonly string[], decision: ItemDecisionValue | null, note = '') {
    if (!rowRefs.length || busy) return;
    setBusy(true);
    try { if (await assessment.decide(pillar, rowRefs, decision, note)) setSelected(current => current.filter(r => !rowRefs.includes(r))); }
    finally { setBusy(false); }
  }
  const askReject = (rowRefs: string[]) => { setReason(''); setRejecting(rowRefs); };
  const complete = assessment.canComplete(pillar);

  return <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="assess-dialog" showCloseButton={!busy} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="assess-head">
        <div className="assess-head-title"><DialogTitle>{observing ? 'Review' : 'Assess'} {name}</DialogTitle>
          <DialogDescription>{can ? 'Accept or reject each item. Tick several to decide them together' : observing ? 'Add your observation on any item. Accepting and rejecting is for the component\'s officers' : 'You can read the items and their documents; deciding is for the assigned officers'}</DialogDescription></div>
        <div className="assess-progress"><Progress value={items.length ? decided / items.length * 100 : 0} aria-label={`${decided} of ${items.length} decided`} /><span>{decided} of {items.length} decided</span></div>
        {observing && <span className="assess-observed"><MessageSquareTextIcon aria-hidden="true" />{observations} {observations === 1 ? 'item' : 'items'} with open observations</span>}
        {assessment.canObserve(pillar) && <Button className="rounded-full" disabled={busy} onClick={() => { onOpenChange(false); assessment.observe(pillar); }}><ShieldCheckIcon data-icon="inline-start" />Observations done</Button>}
        {complete && <Button className="rounded-full" disabled={busy || decided < items.length} title={decided < items.length ? `Decide the remaining ${items.length - decided} items first` : undefined} onClick={() => { onOpenChange(false); assessment.complete(pillar); }}><ClipboardCheckIcon data-icon="inline-start" />Complete assessment</Button>}
      </DialogHeader>
      <div className="assess-body">
        <nav className="assess-groups" aria-label="Activities">
          <button type="button" aria-pressed={group === null} onClick={() => { setGroup(null); setSelected([]); }}><span>All items</span><small>{counts(items).decided}/{counts(items).total}</small></button>
          {groups.map(g => { const c = counts(g.items); return <button key={g.name} type="button" aria-pressed={group === g.name} data-done={c.decided === c.total || undefined} onClick={() => { setGroup(g.name); setSelected([]); }}>
            <span>{g.name}</span><small>{c.decided === c.total ? <CheckIcon aria-label="All decided" /> : `${c.decided}/${c.total}`}</small></button>; })}
          {extraDocuments.length > 0 && <div className="assess-component-docs"><p>Component documents</p>{extraDocuments.map(d => <a key={d.id} href={d.href} onClick={e => { e.preventDefault(); openDocument(d); }}><FileTextIcon aria-hidden="true" />{d.name}</a>)}</div>}
        </nav>
        <section className="assess-items" aria-label={group ?? 'All items'}>
          <div className="assess-toolbar">
            {can && <Checkbox checked={allShownSelected} disabled={!shown.length || busy} aria-label="Select every item shown" onCheckedChange={on => setSelected(on === true ? [...new Set([...selected, ...shown.map(i => i.rowRef)])] : selected.filter(r => !shown.some(i => i.rowRef === r)))} />}
            <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={value => { if (value) { setFilter(value as Filter); setSelected([]); } }} aria-label="Show">
              {(Object.keys(filterLabels) as Filter[]).filter(f => f !== 'corrected' || corrected.size > 0).map(f => <ToggleGroupItem key={f} value={f}>{filterLabels[f]} · {inGroup.filter(i => matches(i, f)).length}</ToggleGroupItem>)}
            </ToggleGroup>
            <ToggleGroup type="single" variant="outline" size="sm" value={layout} onValueChange={value => { if (value) setLayout(value as 'list' | 'grid'); }} aria-label="Layout">
              <ToggleGroupItem value="list" aria-label="List" title="List"><ListIcon /></ToggleGroupItem><ToggleGroupItem value="grid" aria-label="Grid" title="Grid"><LayoutGridIcon /></ToggleGroupItem>
            </ToggleGroup>
            {can && <span className="assess-bulk">
              <span>{picked.length ? `${picked.length} selected` : 'Tick items to decide several'}</span>
              <Button size="sm" className="rounded-full" disabled={!picked.length || busy} onClick={() => void decide(picked, 'accept')}>{busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}Accept</Button>
              <Button size="sm" variant="outline" className="rounded-full assess-reject" disabled={!picked.length || busy} onClick={() => askReject(picked)}><XIcon data-icon="inline-start" />Reject…</Button>
              {group && <Button size="sm" variant="ghost" className="rounded-full" disabled={busy || inGroup.every(i => status(i) === 'accept')} onClick={() => void decide(inGroup.filter(i => status(i) !== 'accept').map(i => i.rowRef), 'accept')}>Accept all in this activity</Button>}
            </span>}
          </div>
          {!shown.length ? <UbecEmpty art={<NoItemsArt />} title={filter === 'all' ? 'No items here' : `No ${filterLabels[filter].toLowerCase()} items`}>{filter === 'open' ? 'Every item here has been decided' : 'Choose another activity or filter'}</UbecEmpty>
            : <ul className="assess-list" data-layout={layout}>{shown.map(item => {
              const d = decisions.get(item.rowRef), before = previous.get(item.rowRef);
              return <li key={item.rowRef} className="assess-item" data-observing={observing || undefined} data-decision={d?.decision ?? 'open'} data-corrected={corrected.has(item.rowRef) || undefined} data-selected={selected.includes(item.rowRef) || undefined}>
                {can && <Checkbox checked={selected.includes(item.rowRef)} disabled={busy} aria-label={`Select ${item.title}`} onCheckedChange={on => toggle(item.rowRef, on === true)} />}
                <div className="assess-item-main">
                  <div className="assess-item-head"><div><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}{!group && <small>{item.group}</small>}</div><b>{nairaFormat.format(item.amount)}</b></div>
                  {item.facts.length > 0 && <dl className="assess-facts">{item.facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
                  <div className="assess-docs">{item.documents.length ? item.documents.map(doc => <a key={doc.id} href={doc.href} title={`Open ${doc.name}`} onClick={e => { e.preventDefault(); openDocument(doc); }}><FileTextIcon aria-hidden="true" />{doc.label ? <em>{doc.label}</em> : null}<span>{doc.name}</span></a>) : <span className="assess-no-docs">No documents uploaded</span>}</div>
                  {item.package && <details className="assess-package"><summary><ChevronDownIcon aria-hidden="true" />Requirements</summary><InfrastructurePackageDetails record={item.package} /></details>}
                  {before && <p className="assess-previous"><HistoryIcon aria-hidden="true" />Previous submission: {before.decision === 'accept' ? 'Accepted' : 'Rejected'}{before.note ? ` · ${before.note}` : ''}</p>}
                  {corrected.has(item.rowRef) && <p className="assess-corrected">Corrected by the SUBEB since it was rejected. Accept or reject it again</p>}
                  {comments && (observing || threadsFor(item.rowRef).length > 0) && <ItemObservations sheet={pillar as CommentSheet} rowRef={item.rowRef} threads={threadsFor(item.rowRef)} comments={comments} canWrite={observing && comments.abilities(pillar).start} />}
                </div>
                <div className="assess-item-decision">
                  {d ? <Badge variant={d.decision === 'accept' ? 'secondary' : 'destructive'}>{d.decision === 'accept' ? <CheckIcon aria-hidden="true" /> : <XIcon aria-hidden="true" />}{d.decision === 'accept' ? 'Accepted' : 'Rejected'}</Badge> : <Badge variant="outline">To decide</Badge>}
                  {d?.note && <p className="assess-note">{d.note}</p>}
                  {can && <span className="assess-item-actions">
                    {d?.decision !== 'accept' && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => void decide([item.rowRef], 'accept')}><CheckIcon data-icon="inline-start" />Accept</Button>}
                    {d?.decision !== 'reject' && <Button size="sm" variant="outline" className="rounded-full assess-reject" disabled={busy} onClick={() => askReject([item.rowRef])}><XIcon data-icon="inline-start" />Reject</Button>}
                    {d && <Button size="icon-sm" variant="ghost" className="rounded-full" disabled={busy} aria-label="Clear decision" title="Clear decision" onClick={() => void decide([item.rowRef], null)}><Undo2Icon /></Button>}
                  </span>}
                </div>
              </li>;
            })}</ul>}
        </section>
      </div>
      <Dialog open={!!rejecting} onOpenChange={next => { if (!next && !busy) setRejecting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reject {rejecting?.length === 1 ? 'this item' : `${rejecting?.length ?? 0} items`}</DialogTitle><DialogDescription>The reason is shown to the Director and, when the plan is returned, to the SUBEB</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="assess-reject-reason">Reason</FieldLabel><Textarea id="assess-reject-reason" required rows={3} maxLength={1000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="What needs to change" /></Field>
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => { const rows = rejecting ?? []; void decide(rows, 'reject', reason.trim()).then(() => setRejecting(null)); }}>{busy ? <Spinner data-icon="inline-start" /> : <XIcon data-icon="inline-start" />}Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </DialogContent>
  </Dialog>;
}

/** UBEC186: the UBEC comments on one item, and a box to add an observation (a reply when the item already has an open one). */
function ItemObservations({ sheet, rowRef, threads, comments, canWrite }: { sheet: CommentSheet; rowRef: string; threads: CommentsController['threads']; comments: CommentsController; canWrite: boolean }) {
  const [body, setBody] = useState(''), [saving, setSaving] = useState(false);
  const open = threads.find(t => !t.resolvedAt);
  async function send() {
    if (!body.trim() || saving) return;
    setSaving(true);
    try { if (await (open ? comments.reply(open.id, body.trim()) : comments.create(sheet, rowRef, null, body.trim()))) setBody(''); }
    finally { setSaving(false); }
  }
  return <div className="assess-observations">
    {threads.map(t => <div key={t.id} className="assess-observation" data-resolved={t.resolvedAt ? true : undefined}>
      <p><b>{t.authorName}</b> {t.body}</p>
      {t.replies.map(r => <p key={r.id} className="assess-observation-reply"><b>{r.authorName}</b> {r.body}</p>)}
      {t.resolvedAt && <small>Resolved{t.resolvedByName ? ` by ${t.resolvedByName}` : ''}</small>}
    </div>)}
    {canWrite && <div className="assess-observation-add">
      <Textarea rows={2} maxLength={2000} value={body} disabled={saving} placeholder={open ? 'Reply to the observation on this item' : 'Add an observation on this item'} aria-label={`Observation on this item`} onChange={e => setBody(e.target.value)} />
      <Button size="sm" variant="outline" className="rounded-full self-end" disabled={!body.trim() || saving} onClick={() => void send()}>{saving ? <Spinner data-icon="inline-start" /> : <MessageSquareTextIcon data-icon="inline-start" />}{open ? 'Reply' : 'Add observation'}</Button>
    </div>}
  </div>;
}
