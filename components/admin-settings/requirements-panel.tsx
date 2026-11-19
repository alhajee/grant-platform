'use client';

import { Fragment } from 'react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { defaultPlatformRules, type PlatformRules, type PlatformRuleSwitch } from '@/lib/platform-rules';
import { PanelError, PanelSkeleton, SaveBar, SettingRow, SettingsCard, SettingsPanel } from './settings-primitives';
import { useSetting } from './use-setting';

// Admin > Settings > Requirements (migration 105): the rules the client changes often, as switches.
type Rule = { key: PlatformRuleSwitch; label: string; on: string; off: string; info: string };
const groups: { title: string; rules: Rule[] }[] = [
  { title: 'Documents', rules: [
    { key: 'boqRequired', label: 'Infrastructure BOQ', on: 'Each school’s Bill of Quantities is needed to save a package and to send Infrastructure', off: 'The BOQ can be attached but nothing waits for it', info: 'Every Infrastructure package type (New Construction, Whole School, Furniture)' },
    { key: 'drawingsRequired', label: 'New Construction drawings', on: 'Drawings are needed to save a New Construction package and to send Infrastructure', off: 'Drawings can be attached but nothing waits for them', info: 'Whole School and Furniture drawings stay optional either way' },
    { key: 'landDocumentsRequired', label: 'Land documents', on: 'New Construction needs the land availability document and the C of O / R of O / Community Agreement', off: 'Land documents can be attached but nothing waits for them', info: 'The three land declarations stay required either way' },
    { key: 'teacherDocumentsRequired', label: 'Teacher Development documents', on: 'Each training needs its Budget Breakdown and Training List of Participants before it is sent', off: 'They follow the Supporting documents setting', info: 'The two uploads with templates on every Teacher Development item' },
    { key: 'proformaRequired', label: 'Proforma invoices', on: 'Goods bought on the price-list activities need a proforma invoice before the component is sent', off: 'They follow the Supporting documents setting', info: 'Quality Assurance, ICT, Supervision & Monitoring, Planning and SBMC goods; TLM and Curriculum take none' },
  ] },
  { title: 'Before sending to UBEC', rules: [
    { key: 'financeHoldsUbec', label: 'Finance documents', on: 'The Executive Chairman sends to UBEC only once SUBEB Finance has uploaded all three documents', off: 'The plan can go to UBEC with Finance documents missing', info: 'Bank statement, Notification of lodgement and the 50% utilisation report' },
    { key: 'submissionLetterRequired', label: 'Signature and cover letter', on: 'The Executive Chairman signs and attaches a cover letter to every submission', off: 'The signature and cover letter are optional', info: 'Asked in the Send to UBEC dialog' },
  ] },
  { title: 'UBEC review', rules: [
    { key: 'validationReportRequired', label: 'Validation Report', on: 'Infrastructure Assessment Officers upload one before Complete assessment', off: 'Officers can upload one, but Complete assessment never waits for it', info: 'Reports already uploaded stay listed either way' },
    { key: 'ratRejectionHoldsApproval', label: 'Rejected RAT holds approval', on: 'A RAT rejected by UBEC Planning means the plan can only be returned', off: 'The UBEC BEAP Chair can approve whatever UBEC Planning decided on the RAT', info: 'The rejection is still shown to the SUBEB after a return' },
    { key: 'oversightCommentsHoldApproval', label: 'Oversight comments hold approval', on: 'Open comments from Audit, Procurement, Finance and Special Programmes must be resolved before approval', off: 'The plan can be approved with Oversight comments still open', info: 'The count of open comments is still shown to the BEAP Chair' },
  ] },
];

const readRules = (body: unknown) => ({ ...defaultPlatformRules, ...(body as { rules?: Partial<PlatformRules> }).rules });
const sameRules = (a: PlatformRules, b: PlatformRules) => JSON.stringify(a) === JSON.stringify(b);
const eccdeProblem = (value: number) => !Number.isFinite(value) || value < 1 || value > 100 || Math.round(value * 2) !== value * 2 ? 'The ECCDE share is 1–100%, in steps of 0.5' : '';

export function RequirementsPanel({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const s = useSetting<PlatformRules>({ url: '/api/admin/rules', read: readRules, write: rules => rules, same: sameRules, noun: 'requirements', saved: () => 'Requirements saved. They apply from the next save or send', onDirty });
  const draft = s.draft;
  return <SettingsPanel title="Requirements" description="What is required before saving, sending and approving. Change them here when the client changes a rule">
    {s.error ? <PanelError title="Requirements unavailable" message={s.error} onRetry={() => void s.load()} />
      : draft === null ? <PanelSkeleton rows={4} /> : <>
        {groups.map(group => <section key={group.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
          <SettingsCard>
            {group.rules.map((rule, index) => <Fragment key={rule.key}>
              {index > 0 && <Separator />}
              <SettingRow label={rule.label} htmlFor={`rule-${rule.key}`} description={draft[rule.key] ? rule.on : rule.off} info={rule.info}>
                <Switch id={`rule-${rule.key}`} checked={draft[rule.key]} disabled={s.saving} onCheckedChange={checked => s.setDraft(current => ({ ...current, [rule.key]: checked }))} />
              </SettingRow>
            </Fragment>)}
          </SettingsCard>
        </section>)}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">ECCDE</h3>
          <SettingsCard>
            <SettingRow label="ECCDE share of the plan" htmlFor="rule-eccde-percent" description={`ECCDE needs at least ${draft.eccdePercent}% of the plan before the BEAP Chair sends it on, while the ECCDE share setting is on`} info="Switch the rule itself on or off under ECCDE share">
              <div className="flex items-center gap-2">
                <Input id="rule-eccde-percent" type="number" inputMode="decimal" min={1} max={100} step={0.5} className="w-24 text-right" value={Number.isFinite(draft.eccdePercent) ? draft.eccdePercent : ''} disabled={s.saving}
                  aria-invalid={!!eccdeProblem(draft.eccdePercent) || undefined} onChange={event => s.setDraft(current => ({ ...current, eccdePercent: event.target.value === '' ? NaN : Number(event.target.value) }))} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </SettingRow>
          </SettingsCard>
        </section>
        <SaveBar dirty={s.dirty} saving={s.saving} invalid={eccdeProblem(draft.eccdePercent)} onDiscard={s.discard} onSave={() => void s.save()} />
      </>}
  </SettingsPanel>;
}
