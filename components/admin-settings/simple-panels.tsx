'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { defaultWorkflowSettings, type BeapChairSubmissionMode, type UbecSubmissionMode, type WorkflowSettings } from '@/lib/workflow-settings';
import type { InfrastructureTlmMode } from '@/lib/funding-policy';
import type { SchoolRegisterSource } from '@/lib/school-register-source';
import { ChoiceCards, PanelError, PanelSkeleton, SaveBar, SettingRow, SettingsCard, SettingsPanel, type Choice } from './settings-primitives';
import { useSetting } from './use-setting';

type PanelProps = { onDirty?: (dirty: boolean) => void };

const chairOptions: Choice<BeapChairSubmissionMode>[] = [
  { value: 'complete_plan', title: 'Complete plan at once', description: 'Waits for every component, then sends one collated submission.' },
  { value: 'individual_components', title: 'Individual components', description: 'Sends reviewed components separately.' },
];
const ubecOptions: Choice<UbecSubmissionMode>[] = [
  { value: 'complete_plan', title: 'Complete plan only', description: 'Every component complete and reviewed first.' },
  { value: 'reviewed_components', title: 'Allow incomplete plans', description: 'Sends what has arrived; the rest is left out.' },
];
const readWorkflow = (body: unknown): WorkflowSettings => {
  const value = body as { setting?: WorkflowSettings } & Partial<WorkflowSettings>;
  return value.setting ?? (value.mode && value.ubecMode ? { mode: value.mode, ubecMode: value.ubecMode } : defaultWorkflowSettings);
};
const sameWorkflow = (a: WorkflowSettings, b: WorkflowSettings) => a.mode === b.mode && a.ubecMode === b.ubecMode;

export function WorkflowPanel({ onDirty }: PanelProps) {
  const s = useSetting<WorkflowSettings>({ url: '/api/admin/workflow-settings', method: 'POST', read: readWorkflow, write: value => value, same: sameWorkflow, noun: 'workflow setting', saved: () => 'Platform workflow updated', onDirty });
  return <SettingsPanel title="SUBEB workflow" description="How reviewed work moves up the SUBEB chain. Applies to every state.">
    {s.error ? <PanelError title="Workflow settings unavailable" message={s.error} onRetry={() => void s.load()} />
      : !s.draft ? <PanelSkeleton /> : <>
        <SettingsCard>
          <SettingRow label="Sending to the Executive Chairman" description="How the BEAP Chair hands reviewed components on."
            info="With a complete plan, the BEAP Chair waits until every implemented component is ready and sends one collated BEAP submission.">
            <ChoiceCards name="BEAP Chair submission mode" value={s.draft.mode} options={chairOptions} disabled={s.saving} onChange={mode => s.setDraft(current => ({ ...current, mode }))} />
          </SettingRow>
          <Separator />
          <SettingRow label="Sending to UBEC" description="Whether the Executive Chairman may send before every component is finished."
            info="With incomplete plans allowed, unfinished components are left out of the UBEC submission and the plan is locked during UBEC review. Useful for testing.">
            <ChoiceCards name="UBEC submission mode" value={s.draft.ubecMode} options={ubecOptions} disabled={s.saving} onChange={ubecMode => s.setDraft(current => ({ ...current, ubecMode }))} />
          </SettingRow>
        </SettingsCard>
        <SaveBar dirty={s.dirty} saving={s.saving} onDiscard={s.discard} onSave={() => void s.save()} />
      </>}
  </SettingsPanel>;
}

const readRequired = (body: unknown) => Boolean((body as { required?: boolean }).required);

export function DocumentsPanel({ onDirty }: PanelProps) {
  const s = useSetting<boolean>({ url: '/api/admin/component-documents', read: readRequired, write: required => ({ required }), noun: 'supporting documents setting', saved: required => required ? 'Supporting documents are now required' : 'Supporting documents are now optional', onDirty });
  return <SettingsPanel title="Supporting documents" description="Whether component uploads must be attached before saving or sending.">
    {s.error ? <PanelError title="Supporting documents setting unavailable" message={s.error} onRetry={() => void s.load()} />
      : s.draft === null ? <PanelSkeleton rows={1} /> : <>
        <SettingsCard>
          <SettingRow label="Require supporting documents" htmlFor="component-documents-required" description={s.draft ? 'Editors block saving and sending until the marked uploads are attached.' : 'Uploads can be attached, but none block saving or sending.'}
            info="Covers the ICT specification, supporting document and Bill of Quantities; Teacher Development supporting documents; and Infrastructure BOQs, geophysical survey reports, photographic evidence and updated Whole School BOQs.">
            <Switch id="component-documents-required" checked={s.draft} disabled={s.saving} onCheckedChange={s.setDraft} />
          </SettingRow>
          <Separator />
          <SettingRow label="Always required" description="Not affected by this setting.">
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <Badge variant="secondary">Rapid Assessment Tool (RAT)</Badge>
              <Badge variant="secondary">Land declaration &amp; agreement</Badge>
            </div>
          </SettingRow>
        </SettingsCard>
        <SaveBar dirty={s.dirty} saving={s.saving} onDiscard={s.discard} onSave={() => void s.save()} />
      </>}
  </SettingsPanel>;
}

const budgetOptions: Choice<InfrastructureTlmMode>[] = [
  { value: 'split', title: 'Set a split', description: 'Each plan sets TLM’s share; Infrastructure gets the rest.' },
  { value: 'shared_pool', title: 'One shared pool', description: 'Both draw from the whole budget, first come, first served.' },
];
const readMode = (body: unknown) => (body as { mode: InfrastructureTlmMode }).mode;

export function BudgetPanel({ onDirty }: PanelProps) {
  const s = useSetting<InfrastructureTlmMode>({ url: '/api/admin/infrastructure-tlm-mode', read: readMode, write: mode => ({ mode }), noun: 'Infrastructure and TLM budget setting', saved: mode => mode === 'split' ? 'Infrastructure and TLM now set a split' : 'Infrastructure and TLM now share one pool', onDirty });
  return <SettingsPanel title="Infrastructure & TLM budget" description="Infrastructure and TLM share the infrastructure funding share. Applies to every state.">
    {s.error ? <PanelError title="Infrastructure and TLM budget setting unavailable" message={s.error} onRetry={() => void s.load()} />
      : !s.draft ? <PanelSkeleton rows={1} /> : <>
        <SettingsCard>
          <SettingRow label="Budget sharing" description="How the two components divide their shared budget."
            info="With a split, each side stays within its own part, like Teacher Development and ICT. With one pool, together they may not exceed the budget; any split already set is kept but ignored.">
            <ChoiceCards name="Infrastructure and TLM budget" value={s.draft} options={budgetOptions} disabled={s.saving} onChange={s.setDraft} />
          </SettingRow>
        </SettingsCard>
        <SaveBar dirty={s.dirty} saving={s.saving} onDiscard={s.discard} onSave={() => void s.save()} />
      </>}
  </SettingsPanel>;
}

const sourceOptions: Choice<SchoolRegisterSource>[] = [
  { value: 'dnemis_only', title: 'DNEMIS only', description: 'Read-only register, filled by the DNEMIS sync.' },
  { value: 'dnemis_and_manual', title: 'DNEMIS and manual changes', description: 'Authorised staff may also add, edit and import.' },
];
const readSource = (body: unknown) => (body as { source: SchoolRegisterSource }).source;

export function SchoolSourcePanel({ onDirty }: PanelProps) {
  const s = useSetting<SchoolRegisterSource>({ url: '/api/admin/school-register-source', read: readSource, write: source => ({ source }), noun: 'school register setting', saved: source => source === 'dnemis_only' ? 'Schools now come from DNEMIS only' : 'Manual school changes allowed', onDirty });
  return <SettingsPanel title="School register source" description="Where every state's School register comes from.">
    {s.error ? <PanelError title="School register setting unavailable" message={s.error} onRetry={() => void s.load()} />
      : !s.draft ? <PanelSkeleton rows={1} /> : <>
        <SettingsCard>
          <SettingRow label="Source of schools" description="Who may change the register besides the sync."
            info="Manual changes are open to the Executive Chairman, the BEAP Chair and staff they authorise. The next DNEMIS sync still replaces DNEMIS fields.">
            <ChoiceCards name="School register source" value={s.draft} options={sourceOptions} disabled={s.saving} onChange={s.setDraft} />
          </SettingRow>
        </SettingsCard>
        <SaveBar dirty={s.dirty} saving={s.saving} onDiscard={s.discard} onSave={() => void s.save()} />
      </>}
  </SettingsPanel>;
}
