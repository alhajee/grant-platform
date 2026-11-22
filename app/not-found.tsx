import { HomeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotFoundArt } from '@/components/status-page/status-art';
import { StatusPage } from '@/components/status-page/status-page';
import { BackButton } from '@/components/status-page/back-button';

// Bug sheet 24 (client, 21 November 2026): "help build a better error 404 page".
export default function NotFound() {
  return <StatusPage art={<NotFoundArt />} eyebrow="Error 404" title="We couldn’t find that page"
    actions={<><Button asChild className="rounded-full">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- next/link breaks in the Vinext production build */}
      <a href="/"><HomeIcon data-icon="inline-start" />Go to your dashboard</a></Button><BackButton /></>}>
    <p>The link may be old, mistyped, or the plan or page may have been removed.</p>
    <p>Check the address, or start again from your dashboard</p>
  </StatusPage>;
}
