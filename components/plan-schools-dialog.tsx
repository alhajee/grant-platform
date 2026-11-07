'use client';

import { useMemo, useState } from 'react';
import { DownloadIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { allLevels, allLgas, filterSchools, SchoolFilters, type SchoolLevelChoice, type SchoolLgaChoice } from '@/components/school-level-filter';
import { EmptyRegisterArt, NoMatchingSchoolsArt } from '@/components/empty-art/school-register';
import { planSchoolsCsv, type PlanSchool } from '@/lib/plan-schools';
import './plan-schools-dialog.css';

const count = new Intl.NumberFormat('en-NG');
const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

interface PlanSchoolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null while loading. */
  schools: readonly PlanSchool[] | null;
  title: string;
  description: string;
  error?: string;
  /** File name for the CSV download, without extension. */
  fileName: string;
}

function SchoolRows({ schools }: { schools: readonly PlanSchool[] }) {
  return <ul className="plan-schools-list">{schools.map(school => <li key={school.key}>
    <div><strong>{school.name}</strong><span>{[school.lga, school.level].filter(Boolean).join(' · ')}</span></div>
    <div className="plan-schools-uses">{school.uses.map(use => <Badge key={`${use.kind}:${use.label}`} variant={use.kind === 'intervened' ? 'default' : 'secondary'}>{use.label}</Badge>)}</div>
  </li>)}</ul>;
}

/**
 * UBEC234: every school in a plan (or the plans shown on the dashboard), split into Schools intervened (Infrastructure
 * packages) and Beneficiary schools (distribution lists, ICT items, Sports allocations, PHE training), with the total
 * up front, a search, the school-type filter and a CSV download.
 */
export function PlanSchoolsDialog({ open, onOpenChange, schools, title, description, error, fileName }: PlanSchoolsDialogProps) {
  const [query, setQuery] = useState(''), [level, setLevel] = useState<SchoolLevelChoice>(allLevels), [lga, setLga] = useState<SchoolLgaChoice>(allLgas);
  const all = useMemo(() => schools ?? [], [schools]);
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return filterSchools(all, level, lga).filter(s => !term || `${s.name} ${s.lga} ${s.uses.map(u => u.label).join(' ')}`.toLowerCase().includes(term));
  }, [all, level, lga, query]);
  const intervened = shown.filter(s => s.intervened), beneficiaries = shown.filter(s => !s.intervened);
  const totalIntervened = all.filter(s => s.intervened).length;

  function download() {
    const url = URL.createObjectURL(new Blob([planSchoolsCsv(shown)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${fileName}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="plan-schools-dialog sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : !schools ? <div className="flex flex-col gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div> : <>
        <dl className="plan-schools-totals">
          <div data-total><dt>Schools</dt><dd>{count.format(all.length)}</dd></div>
          <div><dt>Intervened</dt><dd>{count.format(totalIntervened)}</dd></div>
          <div><dt>Beneficiary</dt><dd>{count.format(all.length - totalIntervened)}</dd></div>
        </dl>
        {all.length === 0 ? <div className="plan-schools-empty"><EmptyRegisterArt /><p>No schools in the plan yet</p></div> : <>
          <div className="plan-schools-tools">
            <InputGroup className="plan-schools-search"><InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon><InputGroupInput aria-label="Search schools" placeholder="Search by school, LGA or intervention" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={download} disabled={!shown.length}><DownloadIcon data-icon="inline-start" />Download CSV</Button>
          </div>
          <SchoolFilters schools={all} level={level} onLevelChange={setLevel} lga={lga} onLgaChange={setLga} />
          <ScrollArea className="plan-schools-scroll">
            {!shown.length ? <div className="plan-schools-empty"><NoMatchingSchoolsArt /><p>No schools match your search</p></div> : <>
              {intervened.length > 0 && <section aria-label="Schools intervened"><h3>Schools intervened <span>{plural(intervened.length, 'school', 'schools')}</span></h3><SchoolRows schools={intervened} /></section>}
              {beneficiaries.length > 0 && <section aria-label="Beneficiary schools"><h3>Beneficiary schools <span>{plural(beneficiaries.length, 'school', 'schools')}</span></h3><SchoolRows schools={beneficiaries} /></section>}
            </>}
          </ScrollArea>
        </>}
      </>}
    </DialogContent>
  </Dialog>;
}
