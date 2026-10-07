import { DatabaseIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Shown above the School register while schools come from DNEMIS only (Admin > Integrations > School register source). */
export function DnemisOnlyNote({ admin = false }: { admin?: boolean }) {
  return <Alert>
    <DatabaseIcon />
    <AlertTitle>Schools come from DNEMIS</AlertTitle>
    <AlertDescription>
      {admin
        ? 'Adding, editing, deleting and bulk-importing schools by hand is turned off. The register is kept up to date by the DNEMIS sync. You can still export schools.'
        : 'Adding or changing schools by hand is turned off by the administrator. The register is kept up to date from DNEMIS. You can still search and export schools.'}
      {admin && <Button asChild variant="outline" size="sm"><a href="/admin?tab=integrations">Change in Integrations</a></Button>}
    </AlertDescription>
  </Alert>;
}
