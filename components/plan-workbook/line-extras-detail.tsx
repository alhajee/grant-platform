'use client';
import { DocumentFiles } from '@/components/document-files';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { lineDocumentLabel } from '@/lib/activity-extras';
import type { ActivitySnapshotLine } from '@/lib/activity-plans';

/** Expanded row of a Quality Assurance or ICT line: its extra details, chosen schools and documents (download links). */
export function LineExtrasDetail({ workstream, line }: { workstream: 'quality' | 'ict'; line: ActivitySnapshotLine }) {
  const schools = line.schools ?? [], documents = line.documents ?? [], label = lineDocumentLabel(workstream, line.activity);
  const facts = [
    ['Equipment type', line.equipment_type], ['Subscription types', line.subscription_types?.join(', ')], ['Website type', line.website_type],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  return <>
    {facts.length > 0 && <dl className="review-facts">{facts.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>}
    {label && <><h3>{label}</h3>{documents.length ? <DocumentFiles compact documents={documents.map(doc => ({ ...doc, url: `/api/activities/line-documents?id=${doc.id}`, description: label }))} /> : <p className="review-comment">No document uploaded.</p>}</>}
    {schools.length > 0 && <><div className="review-allocation-heading"><h3>Schools</h3><span>{schools.length.toLocaleString()} school{schools.length === 1 ? '' : 's'}</span></div>
      <Table aria-label={`Schools for ${line.description}`}><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead></TableRow></TableHeader><TableBody>
        {schools.map(s => <TableRow key={s.id}><TableCell className="whitespace-normal">{s.name}</TableCell><TableCell>{s.lga}</TableCell><TableCell>{s.level}</TableCell></TableRow>)}
      </TableBody></Table></>}
    {!facts.length && !label && !schools.length && <p className="review-comment">No further details.</p>}
  </>;
}
