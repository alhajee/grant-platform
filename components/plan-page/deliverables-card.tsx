'use client';

import type { LucideIcon } from 'lucide-react';
import { ArmchairIcon, BabyIcon, Building2Icon, DropletsIcon, FenceIcon, MonitorSmartphoneIcon, SchoolIcon, ToiletIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { countDeliverables, deliverableHeadingLabels, deliverableHeadings, type DeliverableHeading, type DeliverablePackage } from '@/lib/plan-deliverables';

const icons: Record<DeliverableHeading, LucideIcon> = { classrooms: SchoolIcon, toilets: ToiletIcon, furniture: ArmchairIcon, equipment: MonitorSmartphoneIcon, water: DropletsIcon, fencing: FenceIcon, eccde: BabyIcon, admin: Building2Icon };
const count = new Intl.NumberFormat('en-NG');

/** UBEC114: what the plan's Infrastructure packages deliver, in UBEC's eight headings (lib/plan-deliverables.ts). */
export function DeliverablesCard({ packages }: { packages: readonly (DeliverablePackage | null | undefined)[] }) {
  const counts = countDeliverables(packages);
  return <Card className="plan-status-panel plan-deliverables">
    <CardHeader><CardTitle><h2>Deliverables</h2></CardTitle><CardDescription>From {packages.length} infrastructure {packages.length === 1 ? 'package' : 'packages'}</CardDescription></CardHeader>
    <CardContent>
      <ul className="plan-deliverables-grid">{deliverableHeadings.map(heading => {
        const Icon = icons[heading];
        return <li key={heading} data-empty={!counts[heading] || undefined}>
          <Icon aria-hidden="true" />
          <strong>{count.format(counts[heading])}</strong>
          <span>{deliverableHeadingLabels[heading]}{heading === 'fencing' && counts.fenceMetres > 0 ? ` · ${count.format(counts.fenceMetres)} m` : ''}</span>
        </li>;
      })}</ul>
    </CardContent>
  </Card>;
}
