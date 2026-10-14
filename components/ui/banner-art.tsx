// Illustrations for page banners (components/ui/banner.tsx): flat shapes with a dark outline, drawn to sit at the right
// edge of a banner and bleed off its bottom. Decorative only (aria-hidden); 160 × 96 viewBox.
import type { ReactElement, ReactNode } from 'react';

const ink = '#1d1d1f';
type Art = () => ReactElement;
const frame = (children: ReactNode) => <svg viewBox="0 0 160 96" fill="none" aria-hidden="true" className="h-full w-full" preserveAspectRatio="xMidYMax meet">{children}</svg>;

/** Info: a clipboard with lines and an "i" badge. */
export const InfoArt: Art = () => frame(<>
  <g transform="rotate(-8 80 60)">
    <rect x="52" y="22" width="62" height="80" rx="8" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <rect x="70" y="16" width="26" height="12" rx="4" fill="#c9b8ff" stroke={ink} strokeWidth="2.2" />
    <path d="M63 46h38M63 57h30M63 68h36M63 79h22" stroke={ink} strokeWidth="2.2" strokeLinecap="round" opacity=".75" />
  </g>
  <circle cx="118" cy="40" r="15" fill="#6d4aff" stroke={ink} strokeWidth="2.2" />
  <path d="M118 35.5v.5M118 40v8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  <path d="M38 30l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#ffd54a" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
</>);

/** Success: a rosette badge with a tick and confetti. */
export const SuccessArt: Art = () => frame(<>
  <path d="M74 70l-8 30 14-7 10 11 4-31z" fill="#ffd54a" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
  <path d="M98 70l8 30-14-7-10 11-4-31z" fill="#ff8fa3" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
  <circle cx="86" cy="50" r="27" fill="#fff" stroke={ink} strokeWidth="2.2" />
  <circle cx="86" cy="50" r="19" fill="#1f8f47" stroke={ink} strokeWidth="2.2" />
  <path d="M77 50.5l6.5 6.5L96 44" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  <rect x="34" y="22" width="9" height="5" rx="1.5" fill="#6d4aff" transform="rotate(-25 38 24)" />
  <rect x="128" y="18" width="9" height="5" rx="1.5" fill="#ffd54a" stroke={ink} strokeWidth="1.2" transform="rotate(30 132 20)" />
  <circle cx="134" cy="48" r="3.5" fill="#ff8fa3" stroke={ink} strokeWidth="1.2" />
  <circle cx="44" cy="54" r="3" fill="#fff" stroke={ink} strokeWidth="1.2" />
  <path d="M120 72l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z" fill="#fff" stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
</>);

/** Warning: a road sign with an exclamation mark. */
export const WarningArt: Art = () => frame(<>
  <rect x="83" y="62" width="6" height="40" fill="#9a9a9a" stroke={ink} strokeWidth="2.2" />
  <path d="M86 12l36 56H50z" fill="#ff9f1c" stroke={ink} strokeWidth="2.4" strokeLinejoin="round" />
  <path d="M86 24l24 37H62z" fill="#fff3c4" />
  <path d="M86 34v16" stroke={ink} strokeWidth="5" strokeLinecap="round" />
  <circle cx="86" cy="57" r="3" fill={ink} />
  <path d="M130 30l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#fff" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
  <path d="M36 44h10M41 39v10" stroke={ink} strokeWidth="2" strokeLinecap="round" />
</>);

/** Danger: a plug pulled out of its socket, with sparks. */
export const DangerArt: Art = () => frame(<>
  <path d="M0 78c18 0 26-12 44-12" stroke={ink} strokeWidth="5" strokeLinecap="round" />
  <rect x="42" y="56" width="26" height="22" rx="6" fill="#fff" stroke={ink} strokeWidth="2.2" />
  <path d="M68 62h10M68 72h10" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
  <rect x="100" y="48" width="34" height="40" rx="9" fill="#ff5c7a" stroke={ink} strokeWidth="2.2" />
  <rect x="108" y="58" width="18" height="20" rx="5" fill="#fff" stroke={ink} strokeWidth="2" />
  <path d="M113 64v8M121 64v8" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
  <path d="M86 46l-3 8h6l-3 8M80 36l2 6M94 38l-3 5" stroke={ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  <path d="M146 26l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z" fill="#ffd54a" stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
</>);

/** Brand: a megaphone with a burst and stars. */
export const BrandArt: Art = () => frame(<>
  <path d="M58 52l44-24v56L58 66z" fill="#fff" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
  <rect x="44" y="50" width="16" height="18" rx="4" fill="#1f4d43" stroke={ink} strokeWidth="2.2" />
  <path d="M52 68l4 18h10l-4-18" fill="#ffd54a" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
  <ellipse cx="102" cy="56" rx="7" ry="28" fill="#c7e8d5" stroke={ink} strokeWidth="2.2" />
  <path d="M118 40l12-8M120 56h14M118 72l12 8" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
  <path d="M138 16l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#ffd54a" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
  <circle cx="30" cy="34" r="3.5" fill="#ff8fa3" stroke={ink} strokeWidth="1.2" />
</>);

/** DNEMIS: a database syncing to a school. */
export const DnemisArt: Art = () => frame(<>
  <path d="M60 40c14-16 34-16 46-4" stroke={ink} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
  <path d="M101 30l6 6-8 2" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  <g>
    <path d="M22 50v40c0 6 13 10 28 10s28-4 28-10V50" fill="#fff" stroke={ink} strokeWidth="2.2" />
    <path d="M22 64c0 6 13 10 28 10s28-4 28-10M22 78c0 6 13 10 28 10s28-4 28-10" stroke={ink} strokeWidth="2.2" />
    <ellipse cx="50" cy="50" rx="28" ry="10" fill="#c9b8ff" stroke={ink} strokeWidth="2.2" />
    <circle cx="66" cy="69" r="2.2" fill="#1f8f47" /><circle cx="66" cy="83" r="2.2" fill="#1f8f47" />
  </g>
  <g>
    <path d="M100 66l24-18 24 18v38h-48z" fill="#ffd54a" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M94 68l30-23 30 23" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <rect x="116" y="76" width="16" height="22" rx="2" fill="#fff" stroke={ink} strokeWidth="2" />
    <path d="M124 48V30" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <path d="M124 30h14l-4 5 4 5h-14z" fill="#1f8f47" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
  </g>
</>);
