'use client';
import './plan-documents.css';

import { useMemo, useState } from 'react';
import { DownloadIcon, EyeIcon } from 'lucide-react';
import { DocumentPreview, FileArtwork, type DocumentFile } from '@/components/document-files';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Snapshot } from '@/lib/plan-review';

type PlanDocument = DocumentFile & { url: string; type: string; group: string; school?: string };

const infrastructureTypes = { boq: 'BOQ', drawings: 'Drawings', survey: 'Geophysical survey', land: 'Land documents', photo: 'Photos' } as const;
const fileSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const ALL = 'all', INITIAL = 8;

/** Every document attached to the plan, from the infrastructure dossier and Supervision & Monitoring invoices. */
function collectDocuments(snapshot: Snapshot, visiblePillars: readonly string[]): PlanDocument[] {
  const infrastructure = visiblePillars.includes('infrastructure') ? (snapshot.infrastructureDocuments ?? []).map(doc => ({
    ...doc, url: `/api/infrastructure/documents?id=${doc.id}`, type: infrastructureTypes[doc.kind], group: 'Infrastructure', school: doc.schoolName ?? undefined,
  })) : [];
  const proformas = visiblePillars.includes('monitoring') ? (snapshot.componentDocuments ?? []).filter(doc => doc.component === 'monitoring').map(doc => ({
    ...doc, url: `/api/activities/documents?id=${doc.id}`, type: 'Proforma invoice', group: 'Supervision & Monitoring',
  })) : [];
  return [...infrastructure, ...proformas];
}

/**
 * The plan's documents as one compact list: full names, a type chip, the school, size, and preview/download
 * actions, filterable by type and grouped by component.
 */
export function PlanDocuments({ snapshot, visiblePillars }: { snapshot: Snapshot; visiblePillars: readonly string[] }) {
  const documents = useMemo(() => collectDocuments(snapshot, visiblePillars), [snapshot, visiblePillars]);
  const [type, setType] = useState(ALL), [preview, setPreview] = useState<PlanDocument | null>(null), [showAll, setShowAll] = useState(false);
  const types = useMemo(() => [...new Set(documents.map(doc => doc.type))].map(name => ({ name, count: documents.filter(doc => doc.type === name).length })), [documents]);
  if (!documents.length) return null;
  // All documents fold to the first few; a type filter always shows every match.
  const matching = type === ALL ? documents : documents.filter(doc => doc.type === type);
  const shown = type === ALL && !showAll ? matching.slice(0, INITIAL) : matching;
  const groups = [...new Set(shown.map(doc => doc.group))];

  return <Card className="plan-documents">
    <CardHeader className="plan-documents-header">
      <CardTitle><h2>Documents <span>{documents.length}</span></h2></CardTitle>
      {types.length > 1 && <ToggleGroup type="single" size="sm" variant="outline" value={type} onValueChange={value => setType(value || ALL)} aria-label="Filter documents by type" className="plan-documents-filter">
        <ToggleGroupItem value={ALL}>All</ToggleGroupItem>
        {types.map(item => <ToggleGroupItem key={item.name} value={item.name}>{item.name}<span>{item.count}</span></ToggleGroupItem>)}
      </ToggleGroup>}
    </CardHeader>
    <CardContent>
      {groups.map(group => <section key={group} className="plan-documents-group" aria-label={group}>
        {groups.length > 1 && <h3>{group}</h3>}
        <ul>{shown.filter(doc => doc.group === group).map(doc => <li key={doc.id}>
          <span className="plan-document-art" aria-hidden="true"><FileArtwork name={doc.name} /></span>
          <button type="button" className="plan-document-name" onClick={() => setPreview(doc)}>{doc.name}</button>
          <span className="plan-document-meta">
            <Badge variant="secondary">{doc.type}</Badge>
            {doc.school && <span className="plan-document-school">{doc.school}</span>}
            <span>{fileSize(doc.size)}</span>
          </span>
          <span className="plan-document-actions">
            <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" onClick={() => setPreview(doc)} aria-label={`Preview ${doc.name}`} title="Preview"><EyeIcon /></Button>
            <Button asChild variant="ghost" size="icon-sm" className="rounded-full"><a href={doc.url} download={doc.name} aria-label={`Download ${doc.name}`} title="Download"><DownloadIcon /></a></Button>
          </span>
        </li>)}</ul>
      </section>)}
      {type === ALL && documents.length > INITIAL && <Button type="button" variant="ghost" size="sm" className="plan-documents-more rounded-full" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : `Show all ${documents.length} documents`}</Button>}
    </CardContent>
    {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
  </Card>;
}
