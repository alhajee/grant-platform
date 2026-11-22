'use client';
import { useEffect } from 'react';
import { HomeIcon, RotateCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorArt } from '@/components/status-page/status-art';
import { StatusPage } from '@/components/status-page/status-page';
import { BackButton } from '@/components/status-page/back-button';

// Bug sheet 24: a page that fails shows this instead of the framework's plain "This page couldn’t load".
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Page failed', error); }, [error]);
  return <StatusPage art={<ErrorArt />} eyebrow="Something went wrong" title="This page couldn’t load"
    actions={<><Button type="button" className="rounded-full" onClick={() => { reset(); window.location.reload(); }}><RotateCwIcon data-icon="inline-start" />Reload the page</Button><BackButton /><Button asChild variant="ghost" className="rounded-full">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- next/link breaks in the Vinext production build */}
      <a href="/"><HomeIcon data-icon="inline-start" />Dashboard</a></Button></>}>
    <p>Your saved work is safe. Reload to try again; if it keeps happening, check your connection or try again in a few minutes.</p>
    {error.digest && <p>If you report it, quote <code>{error.digest}</code></p>}
  </StatusPage>;
}
