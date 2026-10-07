'use client';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { EditorEmpty } from '@/components/empty-art/editor-empty';
import { EmptyLinesArt } from '@/components/empty-art/editor-lines';
import { ActivityInfoHint, CompulsoryChecklist, RequiredBadge } from '@/components/activity-line-extras';
import { LineTable, lineAmount, type InlineField, type PanelLine } from '@/components/line-panel/line-table';
import { EmptySection, FocusEmpty, LineSection, PanelSummary, PanelToolbar } from '@/components/line-panel/line-section';
import { useCollapsed, type PanelMode } from '@/components/line-panel/use-line-panel';
import { activityLabel, activityNames, selectableActivityIndexes, type ActivityLine, type ActivityWorkstream } from '@/lib/activity-plans';
import { lineDocumentLabel } from '@/lib/activity-extras';

const count = new Intl.NumberFormat('en-NG');
const plural = (n: number, word: string, many = `${word}s`) => `${count.format(n)} ${n === 1 ? word : many}`;
/** Teacher Development lines describe the training itself instead of a strategy and target group. */
export const trainingSummary = (l: ActivityLine) => [l.trainingProvider, l.targetParticipants, l.schoolLevels?.join(', '), l.trainingDays ? `${l.trainingDays} days` : '', l.venueType].filter(Boolean).join(' · ');
/** Everything a line is searched by. */
export const lineSearchText = (workstream: ActivityWorkstream, l: ActivityLine) => [l.description, activityLabel(workstream, l.activity, l.customActivity), l.strategy, l.targetGroup, trainingSummary(l), l.equipment, l.textbookSubject, ...l.textbookClasses, l.code ?? ''].join(' ').toLowerCase();

type ActivityLinePanelProps = {
  workstream: ActivityWorkstream;
  lines: readonly ActivityLine[] | null;
  /** Whether a "documents needed" badge shows on lines without their document. */
  documentsRequired: boolean;
  summary: { label: string; total: ReactNode; meter: ReactNode };
  /** Alerts and the Monitoring proforma upload, between the summary and the list. */
  notices?: ReactNode;
  /** The activity chosen in the form and the line open in it. */
  selectedActivity: number;
  selectedId?: number;
  /** A line open in the form with unsaved changes: not editable in place until those are saved or dropped. */
  dirtyId?: number;
  mode: PanelMode;
  onMode: (mode: PanelMode) => void;
  query: string;
  onQuery: (query: string) => void;
  flashId: number | null;
  /** In-place editing of quantity, unit cost and (except Teacher Development) the description. */
  inlineEditable: boolean;
  actionsDisabled: boolean;
  /** The component is read-only for this user: lines open in the form to be viewed. */
  viewOnly: boolean;
  shareNote: (activity: number) => string | null;
  onSaveCell: (id: number, field: InlineField, value: string) => Promise<string | null>;
  onEdit: (line: ActivityLine) => void;
  onRemove: (line: ActivityLine) => void;
  /** Chooses an activity in the form to add its first item. */
  onStart?: (activity: number) => void;
};

function details(workstream: ActivityWorkstream, l: ActivityLine): string {
  const training = workstream === 'teachers';
  return [l.equipment, l.textbookSubject, l.textbookClasses.join(', '), l.equipmentType || l.websiteType, (l.subscriptionTypes ?? []).join(', '),
    l.schools?.length ? plural(l.schools.length, 'school') : '', lineDocumentLabel(workstream, l.activity) && l.documents?.length ? plural(l.documents.length, 'document') : '',
    training ? trainingSummary(l) : [l.strategy, l.targetGroup].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
}

/** The saved lines beside the activity editor: summary, view toggle and one section per activity. */
export function ActivityLinePanel(props: ActivityLinePanelProps) {
  const { workstream, lines, documentsRequired, summary, notices, selectedActivity, selectedId, dirtyId, mode, onMode, query, onQuery, flashId, inlineEditable, actionsDisabled, viewOnly, shareNote, onSaveCell, onEdit, onRemove, onStart } = props;
  const { isOpen, toggle } = useCollapsed();
  const all = lines ?? [];
  const needle = query.trim().toLowerCase();
  const matching = needle ? all.filter(l => lineSearchText(workstream, l).includes(needle)) : all;
  const selectable = selectableActivityIndexes[workstream] as readonly number[];
  const nameOf = (i: number) => (activityNames[workstream][i] ?? 'Legacy activity') + (selectable.includes(i) ? '' : ' (earlier activity)');
  const linesOf = (i: number) => matching.filter(l => l.activity === i);
  const withLines = [...new Set(all.map(l => l.activity))].sort((a, b) => a - b);
  // TLM has a long checklist, so its empty activities are not listed.
  const empties = workstream === 'tlm' ? [] : selectable.filter(i => !withLines.includes(i) && i !== selectedActivity);
  const training = workstream === 'teachers';
  const panelLine = (l: ActivityLine): PanelLine => ({
    id: l.id, label: l.description || activityLabel(workstream, l.activity, l.customActivity), heading: l.customActivity || undefined, description: l.description,
    details: details(workstream, l) || undefined, code: l.code, quarters: l.quarters, quantity: l.quantity, unitCost: l.unitCost,
    badges: lineDocumentLabel(workstream, l.activity) && !l.documents?.length && documentsRequired ? <Badge variant="warning">{lineDocumentLabel(workstream, l.activity)} needed</Badge> : undefined,
  });
  const titleOf = (i: number) => <>{nameOf(i)}</>;
  const badgesOf = (i: number) => <><RequiredBadge workstream={workstream} activity={i} /><ActivityInfoHint workstream={workstream} activity={i} /></>;
  const section = (i: number) => {
    const own = linesOf(i), key = String(i);
    return <LineSection key={key} title={titleOf(i)} badges={badgesOf(i)} note={shareNote(i)} count={own.length} total={own.reduce((sum, l) => sum + lineAmount(l), 0)}
      selected={i === selectedActivity} open={isOpen(key) || own.some(l => l.id === flashId)} onOpenChange={open => toggle(key, open)}>
      <LineTable lines={own.map(panelLine)} itemLabel={workstream === 'sbmc' ? 'Description' : training ? 'Training' : 'Description / targeting'} quantityLabel={training ? 'Participants' : 'Qty'}
        editable={inlineEditable} describe={!training} lockReason={id => id === dirtyId ? 'Save or cancel the changes in the form first.' : null}
        actionsDisabled={actionsDisabled} viewOnly={viewOnly} selectedId={selectedId} flashId={flashId} onSave={onSaveCell}
        onEdit={id => { const line = all.find(l => l.id === id); if (line) onEdit(line); }} onRemove={id => { const line = all.find(l => l.id === id); if (line) onRemove(line); }} />
    </LineSection>;
  };
  const emptyRow = (i: number) => <EmptySection key={i} title={titleOf(i)} badges={badgesOf(i)} selected={i === selectedActivity} startLabel={`Add an item to ${nameOf(i)}`} onStart={onStart && inlineEditable ? () => onStart(i) : undefined} />;

  let body: ReactNode;
  if (mode === 'focus') {
    const own = linesOf(selectedActivity);
    body = own.length ? section(selectedActivity)
      : needle && all.some(l => l.activity === selectedActivity) ? <p className="line-focus-empty">No items in {nameOf(selectedActivity)} match your search.</p>
        : <FocusEmpty title={nameOf(selectedActivity)} others={all.length} onShowAll={() => onMode('all')} />;
  } else {
    const rest = withLines.filter(i => i !== selectedActivity && linesOf(i).length);
    const pinned = linesOf(selectedActivity).length ? section(selectedActivity) : needle ? null : <div className="line-empty-group">{emptyRow(selectedActivity)}</div>;
    body = <>
      {pinned}
      {rest.map(section)}
      {!needle && empties.length > 0 && <div className="line-empty-group" role="group" aria-label="Activities without items"><h3>No items yet</h3>{empties.map(emptyRow)}</div>}
      {needle && !matching.length && <p className="line-focus-empty">No saved items match your search.</p>}
    </>;
  }
  const others = mode === 'focus' ? all.length - all.filter(l => l.activity === selectedActivity).length : 0;
  return <>
    <PanelSummary label={summary.label} total={summary.total} meta={lines ? `${plural(all.length, 'item')} in ${plural(withLines.length, 'activity', 'activities')}` : undefined} meter={summary.meter}>
      <PanelToolbar mode={mode} onMode={onMode} focusLabel="This activity" allLabel={`All activities${others > 0 ? ` · ${others} more` : ''}`} query={query} onQuery={onQuery} searchLabel="Search saved items" />
    </PanelSummary>
    {notices}
    {lines && <CompulsoryChecklist workstream={workstream} lines={lines} />}
    <div className="line-panel">
      {lines && !lines.length && workstream === 'tlm' && <EditorEmpty art={<EmptyLinesArt />} caption="No saved items yet" />}
      {lines && body}
    </div>
  </>;
}
