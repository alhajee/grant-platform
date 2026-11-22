import type { ReactNode } from 'react';
import './status-page.css';

interface StatusPageProps { art: ReactNode; eyebrow: string; title: string; children: ReactNode; actions: ReactNode }

/** The 404 and error pages (bug sheet 24): UBEC logo, an illustration, a plain message and the ways out. */
export function StatusPage({ art, eyebrow, title, children, actions }: StatusPageProps) {
  return <main className="status-page">
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- next/link breaks in the Vinext production build */}
    <a className="status-page-brand" href="/">
      {/* eslint-disable-next-line @next/next/no-img-element -- the app's own logo */}
      <img src="/ubec-logo.png" alt="" width={36} height={36} /><span>BEAPMS Portal</span>
    </a>
    <section className="status-page-card" aria-labelledby="status-page-title">
      {art}
      <p className="status-page-eyebrow">{eyebrow}</p>
      <h1 id="status-page-title">{title}</h1>
      <div className="status-page-text">{children}</div>
      <div className="status-page-actions">{actions}</div>
    </section>
    <p className="status-page-foot">Universal Basic Education Commission · Basic Education Action Plan Management System</p>
  </main>;
}
