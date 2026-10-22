'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FieldHelp } from '@/components/field-help';
import { GroupedRows } from '@/components/infrastructure-package-details';
import { deliverableDescription, maxDescriptionLength, requirements, modelFor, modelNames, modelSummary, newConstructionRows, packageModel, quantityLabel, schoolStream, type InfrastructureInput } from '@/lib/infrastructure-model';

interface NewConstructionModelProps {
  input: InfrastructureInput;
  enrolment: number;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}

/** "Block of 6 classrooms …" → "6". */
const classroomCount = (label: string) => label.match(/(\d+) classrooms/)?.[1] ?? 'block of';

const parseMetres = (value: string) => {
  const n = Math.trunc(Number(value));
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.min(n, 1000000) : 0;
};

/**
 * New Construction step 2: the school model (Deliverables workbook) and the requirements it sets, without costs
 * (client feedback, October 2026). The fence length is the only figure entered here.
 */
export function NewConstructionModel({ input, enrolment, disabled, onChange }: NewConstructionModelProps) {
  const [fenceTouched, setFenceTouched] = useState(false);
  const suggested = modelFor(enrolment), model = packageModel(input, enrolment), stream = schoolStream(input.components);
  const rows = [...newConstructionRows(model, stream, input.fenceLength), { key: 'package', label: 'Complete construction package', quantity: 1, unit: 'lot', lump: true }];
  const fenceMissing = input.fenceLength <= 0;
  const others = requirements.filter(r => r.category === 'other');
  const added = others.filter(r => (input.otherFacilities?.[r.key] ?? 0) > 0).length;
  const setOther = (key: string, value: string) => {
    const rest = Object.fromEntries(Object.entries(input.otherFacilities ?? {}).filter(([k]) => k !== key));
    const n = parseMetres(value);
    onChange({ otherFacilities: n > 0 ? { ...rest, [key]: n } : rest });
  };
  // Descriptions start as the workbook text; only an edit is stored (17 October 2026).
  const describe = (key: string, value: string) => {
    const rest = Object.fromEntries(Object.entries(input.descriptions ?? {}).filter(([k]) => k !== key));
    onChange({ descriptions: value === deliverableDescription(key, model) ? rest : { ...rest, [key]: value } });
  };
  return <section className="infra-audit flex flex-col gap-4" aria-labelledby="infra-model-heading">
    <div className="flex flex-col gap-1">
      <h2 id="infra-model-heading" className="text-lg font-semibold">Model and requirements</h2>
      <p className="text-sm text-muted-foreground">The model sets what this new school is built with. Enrolment suggests one; choose another if it fits the school better.</p>
    </div>
    <fieldset className="infra-model-step flex flex-col gap-2">
      <legend className="text-sm font-semibold"><span className="infra-model-step-number" aria-hidden="true">1</span>Choose the school model</legend>
      <ToggleGroup type="single" variant="outline" spacing={2} className="infra-model-choice" aria-label="School model" value={input.model === undefined ? '' : String(model)} onValueChange={value => { if (value) onChange({ model: Number(value) }); }} disabled={disabled}>
        {modelNames.map((name, m) => <ToggleGroupItem key={name} value={String(m)} className="infra-model-option" aria-label={name}>
          <span className="font-semibold">{name}</span><span className="text-xs text-muted-foreground">{modelSummary(m, stream)}</span>
          {m === suggested && <Badge variant="secondary" className="infra-model-suggested">Suggested for {enrolment.toLocaleString()} learners</Badge>}
        </ToggleGroupItem>)}
      </ToggleGroup>
    </fieldset>
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-semibold"><span className="infra-model-step-number" aria-hidden="true">2</span>{modelNames[model]} requirements</h3>
      <Badge variant="outline">{stream === 'jss' ? 'JSS list' : 'Primary/ECCDE list'}</Badge>
    </div>
    <p className="text-sm text-muted-foreground">{stream === 'jss' ? 'This school teaches JSS only (DNEMIS), so the ECCDE block, ECCDE furniture, play equipment and kindergarten bed are left out' : 'Primary/ECCDE schools include the ECCDE block and its furniture, play equipment and kindergarten bed'} Enter the length of perimeter fence the site needs.</p>
    <div className="infra-audit-card">
      <Table className="infra-new-table">
        <TableHeader><TableRow>
          <TableHead>Requirement</TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Quantity<FieldHelp>Quantities come from the chosen model. Enter the perimeter fence length in metres.</FieldHelp></span></TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Description<FieldHelp>Starts with the standard description. Edit it to describe the works at this school.</FieldHelp></span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          <GroupedRows rows={rows} colSpan={3} render={row => <TableRow key={row.key} data-key={row.key} data-status={row.key === 'fence' && fenceMissing ? (fenceTouched ? 'invalid' : 'incomplete') : undefined}>
            <TableCell className="whitespace-normal font-medium">{row.label}</TableCell>
            <TableCell className="tabular-nums">{row.key === 'fence'
              ? <><div className="flex items-center gap-2"><Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" aria-label="Fence length (metres)" aria-required required placeholder="Metres"
                aria-invalid={fenceMissing && fenceTouched ? true : undefined} disabled={disabled} value={input.fenceLength ? String(input.fenceLength) : ''}
                onBlur={() => setFenceTouched(true)} onChange={e => { setFenceTouched(true); onChange({ fenceLength: parseMetres(e.target.value) }); }} /><span className="text-xs text-muted-foreground">metres</span></div>
                {fenceMissing && <p className={`mt-1 text-xs ${fenceTouched ? 'text-destructive' : 'text-warning-foreground'}`} role={fenceTouched ? 'alert' : undefined}>Enter the fence length the site needs, in metres</p>}</>
              : quantityLabel(row.quantity, row.unit)}</TableCell>
            <TableCell className="whitespace-normal"><div className="flex items-start gap-1.5">
              <Textarea rows={1} className="infra-description-input" aria-label={`Description: ${row.label}`} maxLength={maxDescriptionLength} disabled={disabled}
                value={input.descriptions?.[row.key] ?? deliverableDescription(row.key, model)} onChange={e => describe(row.key, e.target.value)} />
              {row.key.startsWith('classBlock') && <span className="mt-2.5"><FieldHelp>{`Tell us how you intend to build the ${classroomCount(row.label)} classrooms and the other items in this block`}</FieldHelp></span>}
            </div></TableCell>
          </TableRow>} />
        </TableBody>
      </Table>
    </div>
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <h3 className="text-sm font-semibold"><span className="infra-model-step-number" aria-hidden="true">3</span>Other facilities</h3>
      <Badge variant="secondary">{added ? `${added} added` : 'Optional'}</Badge>
    </div>
    <p className="text-sm text-muted-foreground">Add any other facilities this school needs beyond the model. Enter how many; leave the rest blank</p>
    <div className="infra-audit-card">
      <Table className="infra-new-table">
        <TableHeader><TableRow>
          <TableHead>Deliverable</TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Additional<FieldHelp>How many of this facility the package adds. Leave it blank if it is not needed.</FieldHelp></span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          <GroupedRows rows={others} colSpan={2} render={row => <TableRow key={row.key} data-key={row.key} data-status={(input.otherFacilities?.[row.key] ?? 0) > 0 ? 'added' : undefined}>
            <TableCell className="whitespace-normal font-medium">{row.label}</TableCell>
            <TableCell><div className="flex items-center gap-2"><Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" aria-label={`Additional: ${row.label}`} placeholder="0" disabled={disabled}
              value={input.otherFacilities?.[row.key] ? String(input.otherFacilities[row.key]) : ''} onChange={e => setOther(row.key, e.target.value)} /><span className="text-xs text-muted-foreground">{row.unit}</span></div></TableCell>
          </TableRow>} />
        </TableBody>
      </Table>
    </div>
  </section>;
}
