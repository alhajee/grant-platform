'use client';
import { useEffect } from 'react';
import { ErrorArt } from '@/components/status-page/status-art';
import { StatusPage } from '@/components/status-page/status-page';
import './globals.css';

// Bug sheet 24: when the whole layout fails, the same page as app/error.tsx with its own <html> and <body>.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Portal failed', error); }, [error]);
  return <html lang="en"><body className="antialiased">
    <StatusPage art={<ErrorArt />} eyebrow="Something went wrong" title="This page couldn’t load"
      actions={<><button type="button" className="status-page-button" onClick={() => window.location.reload()}>Reload the page</button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- next/link breaks in the Vinext production build */}
      <a className="status-page-button status-page-button-outline" href="/">Go to your dashboard</a></>}>
      <p>Your saved work is safe. Reload to try again; if it keeps happening, check your connection or try again in a few minutes.</p>
      {error.digest && <p>If you report it, quote <code>{error.digest}</code></p>}
    </StatusPage>
  </body></html>;
}
