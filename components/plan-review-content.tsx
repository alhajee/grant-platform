'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Search, ArrowDownWideNarrow, School, Building2, Trophy, Hash, Clock3, Tag, Banknote, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { Snapshot } from '@/lib/plan-review';
import { ActivityReviewContent } from '@/components/activity-review-content';
import { InfrastructurePackageDetails, InfrastructureDocumentLinks } from '@/components/infrastructure-package-details';
import { PlanSetupSummary } from '@/components/plan-setup-summary';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const cost = (line: { unit_cost: string; quantity: number }) => Math.round(Number(line.unit_cost) * 100) * line.quantity / 100;
const sectionNames: Record<string, string> = { equipment: 'Equipment', competitions: 'Competitions', publicity: 'Publicity', supervision: 'Supervision' };
type ViewOptions = { query: string; sort: string; filter: string };
const initialView: ViewOptions = { query: '', sort: 'saved', filter: 'all' };
function ReviewToolbar({ label, view, onChange, filters, filterLabel }: { label: string; view: ViewOptions; onChange: (value: ViewOptions) => void; filters: string[]; filterLabel: string }) {
  return <div className="review-table-toolbar">
    <InputGroup className="review-table-search"><InputGroupInput aria-label={`Search ${label}`} placeholder={`Search ${label}…`} value={view.query} onChange={event => onChange({ ...view, query: event.target.value })} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
    <div className="review-table-controls">
      <Select value={view.filter} onValueChange={filter => onChange({ ...view, filter })}><SelectTrigger size="sm" aria-label={`Filter ${label}`}><ListFilter /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All {filterLabel}</SelectItem>{filters.map(filter => <SelectItem key={filter} value={filter}>{sectionNames[filter] || filter}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={view.sort} onValueChange={sort => onChange({ ...view, sort })}><SelectTrigger size="sm" aria-label={`Sort ${label}`}><ArrowDownWideNarrow /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="saved">Saved order</SelectItem><SelectItem value="name">Name A–Z</SelectItem><SelectItem value="high">Amount: high to low</SelectItem><SelectItem value="low">Amount: low to high</SelectItem></SelectGroup></SelectContent></Select>
    </div>
  </div>;
}

export function PlanReviewContent({ snapshot, sbmcEditHref, tlmEditHref, visiblePillars = ['infrastructure', 'sports', 'sbmc', 'tlm'] }: { snapshot: Snapshot; sbmcEditHref?: string; tlmEditHref?: string; visiblePillars?: readonly string[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [infrastructureView, setInfrastructureView] = useState(initialView);
  const [sportsView, setSportsView] = useState(initialView);
  const compare = (view: ViewOptions, a: { unit_cost: string; quantity: number }, b: { unit_cost: string; quantity: number }, aName: string, bName: string) => view.sort === 'name' ? aName.localeCompare(bName) : view.sort === 'high' ? cost(b) - cost(a) : view.sort === 'low' ? cost(a) - cost(b) : 0;
  const infrastructure = snapshot.infrastructure.filter(line => (infrastructureView.filter === 'all' || line.school.lga === infrastructureView.filter) && [line.school.name, line.school.lga, line.construction.name, line.code].join(' ').toLowerCase().includes(infrastructureView.query.trim().toLowerCase())).sort((a, b) => compare(infrastructureView, a, b, a.school.name, b.school.name));
  const sports = snapshot.sports.filter(line => (sportsView.filter === 'all' || line.section === sportsView.filter) && [line.description, line.code, line.section, line.activity_type].join(' ').toLowerCase().includes(sportsView.query.trim().toLowerCase())).sort((a, b) => compare(sportsView, a, b, a.description, b.description));
  function toggle(id: string, label: string) {
    return <Button variant="ghost" size="icon" aria-label={`${expanded[id] ? 'Hide' : 'Show'} details for ${label}`} aria-expanded={!!expanded[id]} aria-controls={`${id}-details`} onClick={() => setExpanded(previous => ({ ...previous, [id]: !previous[id] }))}>{expanded[id] ? <ChevronDown /> : <ChevronRight />}</Button>;
  }
  return <div className="review-sections">
    {snapshot.setup && <PlanSetupSummary setup={snapshot.setup} />}
    {visiblePillars.includes('infrastructure') && <Card id="review-infrastructure" className="review-table-card">
      <CardHeader><CardTitle><Building2 aria-hidden="true" />Infrastructure <Badge variant="secondary">{snapshot.infrastructure.length}</Badge></CardTitle><CardDescription>Project lines</CardDescription></CardHeader>
      <ReviewToolbar label="projects" view={infrastructureView} onChange={setInfrastructureView} filters={[...new Set(snapshot.infrastructure.map(line => line.school.lga))].sort()} filterLabel="LGAs" />
      <Table className="review-data-table" aria-label="Infrastructure projects">
        <TableHeader><TableRow><TableHead><span className="sr-only">Details</span></TableHead><TableHead><School />School</TableHead><TableHead><Building2 />Project</TableHead><TableHead><Clock3 />Duration</TableHead><TableHead className="review-number"><Hash />Qty.</TableHead><TableHead className="review-number"><Banknote />Unit cost</TableHead><TableHead className="review-number"><Banknote />Amount</TableHead></TableRow></TableHeader>
        <TableBody>
          {!infrastructure.length && <TableRow><TableCell colSpan={7} className="review-table-empty">{snapshot.infrastructure.length ? 'No projects match your search or filter.' : 'No infrastructure projects.'}</TableCell></TableRow>}
          {infrastructure.map(line => {
            const id = `infrastructure-${line.id}`;
            return <Fragment key={id}>
              <TableRow id={id}><TableCell>{toggle(id, line.school.name)}</TableCell>
                <TableCell className="review-school-cell"><strong>{line.school.name}</strong><span>{line.school.lga} · {line.school.level} · {line.school.location}</span></TableCell>
                <TableCell className="review-project-cell"><div className="review-project-tags"><Badge variant="secondary" title={line.construction.name}>{line.construction.name.split(' · ')[0]}</Badge>{line.construction.name.split(' · ').length > 1 && <Badge variant="secondary" title={line.construction.name}>+{line.construction.name.split(' · ').length - 1}</Badge>}</div><span>{line.code}</span></TableCell>
                <TableCell>{line.package ? 'See package' : `${line.duration} weeks`}</TableCell><TableCell className="review-number">{line.quantity.toLocaleString()}</TableCell><TableCell className="review-number">{money.format(Number(line.unit_cost))}</TableCell><TableCell className="review-number font-semibold">{money.format(cost(line))}</TableCell>
              </TableRow>
              <TableRow id={`${id}-details`} hidden={!expanded[id]} className="review-detail-row"><TableCell colSpan={7}><div className="review-row-details">{line.package ? <InfrastructurePackageDetails record={line.package}/> : <><h3>Project</h3><p className="review-comment">{line.construction.name}</p><dl className="review-facts"><div><dt>Implementation strategy</dt><dd>{line.strategy || '—'}</dd></div><div><dt>Latitude</dt><dd>{line.latitude || '—'}</dd></div><div><dt>Longitude</dt><dd>{line.longitude || '—'}</dd></div></dl><h3>Rationale</h3><p className="review-comment">{line.rationale || 'No rationale provided.'}</p></>}</div></TableCell></TableRow>
            </Fragment>;
          })}
        </TableBody>
        <TableFooter><TableRow><TableCell colSpan={6}>{infrastructure.length} of {snapshot.infrastructure.length} project lines <span className="review-total-label">{infrastructure.length === snapshot.infrastructure.length ? 'Total' : 'Filtered total'}</span></TableCell><TableCell className="review-number">{money.format(infrastructure.reduce((sum, line) => sum + cost(line), 0))}</TableCell></TableRow></TableFooter>
      </Table>
    </Card>}
    {!!snapshot.infrastructureDocuments?.length && <Card><CardHeader><CardTitle>Infrastructure technical dossier</CardTitle></CardHeader><div className="px-6"><InfrastructureDocumentLinks documents={snapshot.infrastructureDocuments}/></div></Card>}
    {visiblePillars.includes('sports') && <Card id="review-sports" className="review-table-card">
      <CardHeader><CardTitle><Trophy aria-hidden="true" />Sports activities <Badge variant="secondary">{snapshot.sports.length}</Badge></CardTitle><CardDescription>Budget items</CardDescription></CardHeader>
      <ReviewToolbar label="budget items" view={sportsView} onChange={setSportsView} filters={[...new Set(snapshot.sports.map(line => line.section))].sort()} filterLabel="sections" />
      <Table className="review-data-table" aria-label="Sports budget items">
        <TableHeader><TableRow><TableHead><span className="sr-only">Details</span></TableHead><TableHead><Trophy />Budget item</TableHead><TableHead><Tag />Section</TableHead><TableHead><Tag />Activity</TableHead><TableHead className="review-number"><Hash />Qty.</TableHead><TableHead className="review-number"><Banknote />Unit cost</TableHead><TableHead className="review-number"><Banknote />Amount</TableHead></TableRow></TableHeader>
        <TableBody>
          {!sports.length && <TableRow><TableCell colSpan={7} className="review-table-empty">{snapshot.sports.length ? 'No budget items match your search or filter.' : 'No sports budget items.'}</TableCell></TableRow>}
          {sports.map(line => {
            const id = `sports-${line.id}`;
            return <Fragment key={id}>
              <TableRow id={id}><TableCell>{line.section === 'equipment' && toggle(id, line.description)}</TableCell><TableCell className="review-school-cell"><strong>{line.description}</strong><span>{line.code}</span></TableCell><TableCell><Badge variant="secondary">{sectionNames[line.section] || line.section}</Badge></TableCell><TableCell className="review-project-cell">{line.activity_type || '—'}</TableCell><TableCell className="review-number">{line.quantity.toLocaleString()}</TableCell><TableCell className="review-number">{money.format(Number(line.unit_cost))}</TableCell><TableCell className="review-number font-semibold">{money.format(cost(line))}</TableCell></TableRow>
              {line.section === 'equipment' && <TableRow id={`${id}-details`} hidden={!expanded[id]} className="review-detail-row"><TableCell colSpan={7}><div className="review-row-details">
                <div className="review-allocation-heading"><h3>School allocations</h3><span>{line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0).toLocaleString()} of {line.quantity.toLocaleString()} items allocated</span></div>
                <Table aria-label={`School allocations for ${line.description}`}><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead>Latitude</TableHead><TableHead>Longitude</TableHead><TableHead className="review-number">Qty.</TableHead></TableRow></TableHeader><TableBody>
                  {!line.allocations.length && <TableRow><TableCell colSpan={7}>No school allocations.</TableCell></TableRow>}
                  {line.allocations.map(allocation => <TableRow key={allocation.id}><TableCell className="review-school-cell">{allocation.school.name}</TableCell><TableCell>{allocation.school.lga}</TableCell><TableCell>{allocation.school.level}</TableCell><TableCell>{allocation.school.location}</TableCell><TableCell>{allocation.latitude || '—'}</TableCell><TableCell>{allocation.longitude || '—'}</TableCell><TableCell className="review-number">{allocation.quantity.toLocaleString()}</TableCell></TableRow>)}
                </TableBody></Table>
              </div></TableCell></TableRow>}
            </Fragment>;
          })}
        </TableBody>
        <TableFooter><TableRow><TableCell colSpan={6}>{sports.length} of {snapshot.sports.length} budget items <span className="review-total-label">{sports.length === snapshot.sports.length ? 'Total' : 'Filtered total'}</span></TableCell><TableCell className="review-number">{money.format(sports.reduce((sum, line) => sum + cost(line), 0))}</TableCell></TableRow></TableFooter>
      </Table>
    </Card>}
    <ActivityReviewContent snapshot={snapshot} sbmcEditHref={sbmcEditHref} tlmEditHref={tlmEditHref} />
  </div>;
}
