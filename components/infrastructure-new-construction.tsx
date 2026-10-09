'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FieldHelp } from '@/components/field-help';
import { GroupedRows } from '@/components/infrastructure-package-details';
import { deliverableDescription, modelFor, modelNames, modelSummary, newConstructionRows, packageModel, quantityLabel, schoolStream, type InfrastructureInput } from '@/lib/infrastructure-model';

interface NewConstructionModelProps {
  input: InfrastructureInput;
  enrolment: number;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}

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
    <p className="text-sm text-muted-foreground">{stream === 'jss' ? 'This school teaches JSS only (DNEMIS), so the ECCDE block, ECCDE furniture, play equipment and kindergarten bed are left out.' : 'Primary/ECCDE schools include the ECCDE block and its furniture, play equipment and kindergarten bed.'} Enter the length of perimeter fence the site needs.</p>
    <div className="infra-audit-card">
      <Table className="infra-new-table">
        <TableHeader><TableRow>
          <TableHead>Requirement</TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Quantity<FieldHelp>Quantities come from the chosen model. Enter the perimeter fence length in metres.</FieldHelp></span></TableHead>
          <TableHead>Description</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          <GroupedRows rows={rows} colSpan={3} render={row => <TableRow key={row.key} data-key={row.key} data-status={row.key === 'fence' && fenceMissing && fenceTouched ? 'invalid' : undefined}>
            <TableCell className="whitespace-normal font-medium">{row.label}</TableCell>
            <TableCell className="tabular-nums">{row.key === 'fence'
              ? <div className="flex items-center gap-2"><Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" aria-label="Fence length (metres)" aria-required required placeholder="Metres"
                aria-invalid={fenceMissing && fenceTouched ? true : undefined} disabled={disabled} value={input.fenceLength ? String(input.fenceLength) : ''}
                onBlur={() => setFenceTouched(true)} onChange={e => { setFenceTouched(true); onChange({ fenceLength: parseMetres(e.target.value) }); }} /><span className="text-xs text-muted-foreground">metres</span></div>
              : quantityLabel(row.quantity, row.unit)}</TableCell>
            <TableCell className="whitespace-normal text-muted-foreground">{deliverableDescription(row.key, model)}</TableCell>
          </TableRow>} />
        </TableBody>
      </Table>
    </div>
  </section>;
}
