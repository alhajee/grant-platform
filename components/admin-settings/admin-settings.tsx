'use client';

import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DnemisPanel } from './dnemis-panel';
import { OfficersPanel } from './officers-panel';
import { sectionGroups, type SettingsSection } from './sections';
import { BudgetPanel, DocumentsPanel, SchoolSourcePanel, WorkflowPanel } from './simple-panels';
import './admin-settings.css';

const panels: Record<SettingsSection, ComponentType<{ onDirty?: (dirty: boolean) => void }>> = {
  workflow: WorkflowPanel, documents: DocumentsPanel, budget: BudgetPanel, officers: OfficersPanel, schools: SchoolSourcePanel, dnemis: DnemisPanel,
};
const allItems = sectionGroups.flatMap(group => group.items);

/** Platform settings: a section list (sticky on desktop, a Select on phones) and one focused panel. Every panel stays
 * mounted once the page loads, so unsaved edits survive switching sections; the list marks sections with changes. */
export function AdminSettings({ section, onSection }: { section: SettingsSection; onSection: (section: SettingsSection) => void }) {
  const [dirty, setDirty] = useState<Partial<Record<SettingsSection, boolean>>>({});
  const reporters = useMemo(() => Object.fromEntries(allItems.map(item => [item.id,
    (value: boolean) => setDirty(current => current[item.id] === value ? current : { ...current, [item.id]: value })])) as Record<SettingsSection, (value: boolean) => void>, []);
  const choose = useCallback((value: string) => onSection(value as SettingsSection), [onSection]);

  return <div className="admin-settings">
    <nav className="admin-settings-nav" aria-label="Settings sections">
      <div className="admin-settings-nav-select">
        <Select value={section} onValueChange={choose}>
          <SelectTrigger className="w-full" aria-label="Settings section"><SelectValue /></SelectTrigger>
          <SelectContent>{sectionGroups.map(group => <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.items.map(item => <SelectItem key={item.id} value={item.id}><item.icon />{item.label}{dirty[item.id] && ' · unsaved'}</SelectItem>)}
          </SelectGroup>)}</SelectContent>
        </Select>
      </div>
      <div className="admin-settings-nav-list">
        {sectionGroups.map(group => <div key={group.label} className="admin-settings-nav-group">
          <p>{group.label}</p>
          <ul>{group.items.map(item => <li key={item.id}>
            <a href={`/admin?section=${item.id}`} aria-current={section === item.id ? 'page' : undefined}
              onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); onSection(item.id); }}>
              <item.icon aria-hidden="true" /><span>{item.label}</span>
              {dirty[item.id] && <span className="admin-settings-nav-dot" title="Unsaved changes"><span className="sr-only">Unsaved changes</span></span>}
            </a>
          </li>)}</ul>
        </div>)}
      </div>
    </nav>
    <div className="admin-settings-body">
      {allItems.map(item => {
        const Panel = panels[item.id];
        return <div key={item.id} hidden={section !== item.id} className={cn(section === item.id && 'admin-settings-active')}><Panel onDirty={reporters[item.id]} /></div>;
      })}
    </div>
  </div>;
}
