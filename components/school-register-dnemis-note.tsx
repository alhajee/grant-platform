'use client';
import { Banner } from '@/components/ui/banner';
import { DnemisArt } from '@/components/ui/banner-art';
import { Button } from '@/components/ui/button';

/** Banner above the School list while schools come from DNEMIS only (Admin > Settings > School list source); dismissible per browser. */
export function DnemisOnlyNote({ admin = false }: { admin?: boolean }) {
  return <Banner tone="info" art={<DnemisArt />} title="Schools come from DNEMIS" dismissible dismissKey={`beapms:dnemis-note-dismissed:${admin ? 'admin' : 'state'}`}
    action={admin && <Button asChild size="sm" className="rounded-full bg-[#1d1d1f] text-white hover:bg-[#1d1d1f]/85"><a href="/admin?section=schools">Change in Settings</a></Button>}>
    {admin
      ? 'Adding, editing, deleting and bulk-importing schools by hand is turned off. The list is kept up to date by the DNEMIS sync. You can still export schools.'
      : 'Adding or changing schools by hand is turned off by the administrator. The list is kept up to date from DNEMIS. You can still search and export schools.'}
  </Banner>;
}
