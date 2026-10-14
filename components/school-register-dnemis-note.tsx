'use client';
import { DatabaseIcon } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';

/** Banner above the School list while schools come from DNEMIS only (Admin > Settings > School list source); dismissible per browser. */
export function DnemisOnlyNote({ admin = false }: { admin?: boolean }) {
  return <Banner tone="info" icon={<DatabaseIcon />} title="Schools come from DNEMIS" dismissible dismissKey={`beapms:dnemis-note-dismissed:${admin ? 'admin' : 'state'}`}
    action={admin && <Button asChild variant="outline" size="sm" className="h-7 rounded-full"><a href="/admin?section=schools">Change in Settings</a></Button>}>
    {admin
      ? 'Adding, editing, deleting and bulk-importing schools by hand is turned off. The list is kept up to date by the DNEMIS sync. You can still export schools.'
      : 'Adding or changing schools by hand is turned off by the administrator. The list is kept up to date from DNEMIS. You can still search and export schools.'}
  </Banner>;
}
