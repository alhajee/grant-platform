'use client';

import type { CSSProperties } from 'react';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { confirmMoney } from '@/components/confirm-step';
import { componentDepartments } from '@/lib/ubec';
import { componentName, type PipelineComponent } from '@/lib/ubec-flow';
import { DepartmentArt } from './department-art';

const compact = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 });

/**
 * The release as a task list: each UBEC department is an assignee (its Director) with the components it
 * receives as tasks, in the department order of the UBEC structure.
 */
export function ReleaseAssignments({ components }: { components: readonly PipelineComponent[] }) {
  const groups = componentDepartments.map(d => ({ ...d, items: components.filter(c => c.department === d.id) })).filter(g => g.items.length);
  return <div className="release-assignments">
    {groups.map(group => {
      const total = group.items.reduce((sum, c) => sum + c.amount, 0);
      return <section key={group.id} className="release-group" aria-label={`${group.name} Director`}>
        <header>
          <DepartmentArt department={group.id} className="release-avatar" />
          <span className="release-assignee"><strong>{group.name}</strong><small>Director · {group.short}</small></span>
          <span className="release-count">{group.items.length} {group.items.length === 1 ? 'component' : 'components'} · {compact.format(total)}</span>
        </header>
        <ul>{group.items.map(c => <li key={c.pillar} style={{ '--task-fill': componentPalette[c.pillar].fill } as CSSProperties}>
          <span className="release-task-dot" aria-hidden="true" />
          <span className="release-task-name">{componentName(c.pillar)}</span>
          <span className="release-task-amount" title={confirmMoney.format(c.amount)}>{compact.format(c.amount)}</span>
        </li>)}</ul>
      </section>;
    })}
  </div>;
}
