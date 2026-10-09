import { confirmMoney, type ConfirmFact, type ConfirmNote, type ConfirmTone } from '@/components/confirm-step';
import { departmentName, oversightDepartments } from '@/lib/ubec';
import { componentName, oversightPending, type DecisionCounts, type PipelineComponent, type UbecFlow } from '@/lib/ubec-flow';
import type { FlowRequest } from './flow-dialog';

export type FlowConfirmation = { title: string; description: string; facts: ConfirmFact[]; notes: ConfirmNote[]; confirm: string; tone: ConfirmTone; acknowledge?: string };

const decisions = (c: DecisionCounts) => `${c.accepted} accepted · ${c.rejected} rejected${c.undecided ? ` · ${c.undecided} undecided` : ''}`;
const oversightNames = (ids: readonly string[]) => ids.map(id => oversightDepartments.find(d => d.id === id)?.name ?? id).join(', ');

/**
 * What each UBEC step's confirmation says: the plan or component, its amount and decisions, who receives it,
 * and what can't be undone. `components` are the round's components (with amounts), `officerNames` the
 * officers being assigned, `shared` how many UBEC comments the return sends to the SUBEB.
 */
export function flowConfirmation({ request, plan, flow, components, officerNames, threads, shared }: {
  request: FlowRequest; plan: string; flow: UbecFlow; components: readonly PipelineComponent[]; officerNames: string[]; threads: number; shared: number;
}): FlowConfirmation {
  const planFact: ConfirmFact = { label: 'Plan', value: plan };
  const total = components.reduce((sum, c) => sum + c.amount, 0);
  const list = (show: (c: PipelineComponent) => string) => <ul>{components.map(c => <li key={c.pillar}>{componentName(c.pillar)} <small>· {show(c)}</small></li>)}</ul>;
  if (request.kind === 'release') {
    const departments = new Set(components.map(c => c.department)).size;
    return { title: `Release the ${plan} to the UBEC departments?`, confirm: 'Yes, release to departments', tone: 'default',
      description: 'Each department Director is notified and assigns Assessment Officers.',
      facts: [planFact, { label: 'Components', value: list(c => departmentName(c.department)) }, { label: 'Total proposed', value: confirmMoney.format(total) }, { label: 'Goes to', value: `${departments} UBEC department ${departments === 1 ? 'Director' : 'Directors'}` }],
      notes: [{ kind: 'info', text: 'Your comment is shared with the Directors and shown on the plan.' }, { kind: 'warning', text: 'A release can’t be undone. You decide on the plan once every component has finished oversight.' }] };
  }
  if (request.kind === 'approve' || request.kind === 'return') {
    const facts: ConfirmFact[] = [planFact, { label: 'Components', value: list(c => decisions(c.counts)) }, { label: 'Total proposed', value: confirmMoney.format(total) }];
    if (request.kind === 'approve') return { title: `Approve the ${plan}?`, confirm: 'Yes, approve action plan', tone: 'strong',
      description: 'The SUBEB is notified that UBEC has approved its action plan.',
      facts: [...facts, { label: 'Decision', value: 'Approved by UBEC' }],
      notes: [{ kind: 'warning', text: 'Approval is final. The plan is locked as approved and this UBEC review closes.' }, { kind: 'info', text: 'Approval does not disburse funds.' }],
      acknowledge: 'I have reviewed every component’s results and my decision note.' };
    return { title: `Return the ${plan} to the SUBEB?`, confirm: 'Yes, return to SUBEB', tone: 'destructive',
      description: 'Its BEAP Chair, the Directors and Data Entry Staff of these components are notified.',
      facts: [...facts, { label: 'Returns to', value: 'SUBEB, for changes' }, { label: 'Comments shared', value: shared ? `${shared} UBEC ${shared === 1 ? 'comment' : 'comments'} sent with your feedback` : 'None; all UBEC comments stay internal' }],
      notes: [{ kind: 'warning', text: 'This UBEC review closes and can’t be reopened. Every component goes back to the SUBEB as Changes requested, and UBEC reviews it again only when the SUBEB resubmits.' }],
      acknowledge: 'I have reviewed every component’s results and the changes required.' };
  }
  const component = flow.components.find(c => c.pillar === request.pillar), name = componentName(request.pillar);
  const amount = components.find(c => c.pillar === request.pillar)?.amount ?? component?.amount ?? 0;
  const base: ConfirmFact[] = [planFact, { label: 'Component', value: name }, { label: 'Proposed amount', value: confirmMoney.format(amount) }];
  const counts = component ? [{ label: 'Items', value: decisions(component.counts) }] : [];
  const open = threads ? [{ label: 'Open comments', value: String(threads) }] : [];
  if (request.kind === 'assign') return { title: `Assign ${officerNames.length === 1 ? officerNames[0] : `${officerNames.length} officers`} to ${name}?`, confirm: officerNames.length === 1 ? 'Yes, assign officer' : 'Yes, assign officers', tone: 'default',
    description: 'They are notified and can start accepting or rejecting its items.',
    facts: [...base, { label: 'Assessment Officers', value: <ul>{officerNames.map(n => <li key={n}>{n}</li>)}</ul> }],
    notes: [{ kind: 'info', text: 'You can remove an officer later while their assessment is still open.' }] };
  if (request.kind === 'complete') return { title: `Submit your assessment of ${name}?`, confirm: 'Yes, submit assessment', tone: 'default',
    description: `Your Director${component ? `, ${departmentName(component.department)},` : ''} is notified and reviews your decisions.`,
    facts: [...base, ...counts, ...open, { label: 'Goes to', value: 'Your Director' }],
    notes: [{ kind: 'lock', text: 'Your decisions are locked once submitted. You can’t change them afterwards.' }] };
  if (request.kind === 'oversight') return { title: `Send ${name} for oversight?`, confirm: 'Yes, send for oversight', tone: 'default',
    description: 'Audit, Procurement and Finance review it next; then it goes to the UBEC BEAP Chair.',
    facts: [...base, ...counts, ...open, { label: 'Goes to', value: oversightNames(oversightDepartments.map(d => d.id)) }],
    notes: [{ kind: 'lock', text: 'Its item decisions can’t be changed once it is sent, and your department’s assessment ends.' }] };
  const pending = oversightPending(component?.oversight.map(o => o.department) ?? []);
  return { title: `Record your observations on ${name} as done?`, confirm: 'Yes, observations done', tone: 'default',
    description: pending.length <= 1 ? 'You are the last oversight review: the component goes to the UBEC BEAP Chair.' : 'The component goes to the UBEC BEAP Chair once every oversight department is done.',
    facts: [...base, ...counts, ...open, { label: 'Still to finish', value: pending.length ? oversightNames(pending) : 'None' }],
    notes: [{ kind: 'lock', text: 'Your observations are recorded and can’t be reopened. Add any item comments in the workbook first.' }] };
}
