import type { ReactNode } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { LoginContours } from '@/components/login-artwork';
import { LoginPhotos } from '@/components/login-photos';
import { UbecLogo } from '@/components/ubec-logo';

/** The sign-in page. Plain links on purpose: next/link navigation fails in the production build. */
export const signInHref = '/';

/** The sign-in screen's layout: the UBEC photo panel on the left and a card panel on the right (login, forgot and reset password). */
export function LoginShell({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <main className="login-page">
      <section className="login-hero" aria-labelledby="beapms-title">
        <LoginPhotos />
        <div className="login-hero-sheen" aria-hidden="true" />
        <div className="login-hero-inner">
          <a className="login-agency" href="https://ubec.gov.ng" target="_blank" rel="noopener noreferrer" aria-label="Visit the UBEC website (opens in a new tab)">
            <UbecLogo size={58} />
            <span><strong>Universal Basic Education Commission</strong><small>Federal Republic of Nigeria</small></span>
            <ExternalLinkIcon className="login-agency-link-icon" aria-hidden="true" />
          </a>
          <div className="login-hero-copy">
            <h1 id="beapms-title">Basic Education Action Plan <span>Management System</span> <small>(BEAPMS)</small></h1>
            <p>Supporting UBEC and SUBEBs to strengthen financial allocation and management in the basic education sector</p>
          </div>
          <div className="login-hero-footer" aria-hidden="true" />
        </div>
      </section>

      <section className="signin-panel" id="top" aria-labelledby={labelledBy}>
        <LoginContours />
        <div className="login-ambient login-ambient-one" aria-hidden="true" />
        <div className="login-ambient login-ambient-two" aria-hidden="true" />
        {children}
        <p className="login-copyright">© 2026 Universal Basic Education Commission</p>
      </section>
    </main>
  );
}

/** The small UBEC brand line shown above the card title on phones. */
export function LoginMobileBrand() {
  return <div className="login-mobile-brand"><UbecLogo size={46}/><span><strong>BEAPMS Portal</strong><small>Universal Basic Education Commission</small></span></div>;
}
