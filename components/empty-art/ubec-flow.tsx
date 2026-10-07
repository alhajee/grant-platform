import { useId, type ReactNode } from 'react';
import './ubec.css';

// Illustrated empty states for the UBEC review flow (docs/ubec-flow.md). Decorative (aria-hidden): the caption
// below each picture carries the meaning. Colours follow the theme through CSS variables (ubec.css).
const ink = 'var(--ubec-art-ink)', paper = 'var(--ubec-art-paper)', accent = 'var(--ubec-art-accent)';

/** Picture plus its caption: a short title and an optional line of help. */
export function UbecEmpty({ art, title, children, compact = false }: { art: ReactNode; title: string; children?: ReactNode; compact?: boolean }) {
  return <figure className="ubec-empty ubec-flow-empty" data-compact={compact || undefined}>
    {art}
    <figcaption><strong>{title}</strong>{children && <span>{children}</span>}</figcaption>
  </figure>;
}

function Stripes({ id }: { id: string }) {
  return <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="9" height="9" fill={ink} fillOpacity=".04" /><rect width="4.5" height="9" fill={ink} fillOpacity=".1" />
  </pattern>;
}

/** Nothing waiting: an empty in-tray with a check badge. */
export function QueueClearArt() {
  const stripes = useId();
  return <svg className="ubec-empty-art" viewBox="0 0 200 104" aria-hidden="true" focusable="false">
    <defs><Stripes id={stripes} /></defs>
    <path d="M28 50h40l8 13h48l8-13h40v34a9 9 0 0 1-9 9H37a9 9 0 0 1-9-9Z" fill={paper} stroke={ink} strokeOpacity=".5" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M28 50 46 20h108l18 30" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" />
    <circle cx="150" cy="24" r="15" fill={accent} stroke={ink} strokeOpacity=".5" strokeWidth="1.5" />
    <path d="m143 24 5 5 9-10" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/** No components assigned: a clipboard with empty slots. */
export function NoAssignmentsArt() {
  return <svg className="ubec-empty-art" viewBox="0 0 200 110" aria-hidden="true" focusable="false">
    <rect x="58" y="12" width="84" height="92" rx="10" fill={paper} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" />
    <rect x="80" y="6" width="40" height="14" rx="5" fill={accent} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" />
    {[0, 1, 2].map(row => <g key={row}>
      <rect x="70" y={34 + row * 22} width="12" height="12" rx="3.5" fill="none" stroke={ink} strokeOpacity=".4" strokeWidth="1.3" strokeDasharray="3 3" />
      <rect x="90" y={37 + row * 22} width={row === 1 ? 30 : 40} height="6" rx="3" fill={ink} fillOpacity={row ? .1 : .18} />
    </g>)}
  </svg>;
}

/** Awaiting observations: a magnifier over a stamped page. */
export function ObservationsArt() {
  const stripes = useId();
  return <svg className="ubec-empty-art" viewBox="0 0 200 108" aria-hidden="true" focusable="false">
    <defs><Stripes id={stripes} /></defs>
    <rect x="40" y="10" width="86" height="90" rx="9" fill={paper} stroke={ink} strokeOpacity=".4" strokeWidth="1.5" />
    <rect x="41" y="11" width="84" height="18" rx="8" fill={`url(#${stripes})`} />
    {[0, 1, 2, 3].map(row => <rect key={row} x="52" y={40 + row * 13} width={row % 2 ? 46 : 60} height="5" rx="2.5" fill={ink} fillOpacity=".14" />)}
    <circle cx="136" cy="58" r="24" fill={paper} fillOpacity=".75" stroke={ink} strokeOpacity=".6" strokeWidth="2.2" />
    <circle cx="136" cy="58" r="10" fill={accent} fillOpacity=".8" />
    <path d="m153 75 17 17" stroke={ink} strokeOpacity=".6" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}

/** No Assessment Officers yet: dashed people silhouettes with a plus. */
export function NoOfficersArt() {
  return <svg className="ubec-empty-art ubec-empty-art-small" viewBox="0 0 160 90" aria-hidden="true" focusable="false">
    {[34, 80].map((x, index) => <g key={x} opacity={index ? .6 : 1}>
      <circle cx={x} cy="30" r="14" fill={paper} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={`M${x - 24} 78a24 22 0 0 1 48 0Z`} fill={paper} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="4 3" />
    </g>)}
    <circle cx="128" cy="52" r="15" fill={accent} stroke={ink} strokeOpacity=".5" strokeWidth="1.5" />
    <path d="M128 45v14M121 52h14" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
  </svg>;
}

/** No items: assessment rows with empty accept/reject pills. */
export function NoItemsArt() {
  return <svg className="ubec-empty-art" viewBox="0 0 200 92" aria-hidden="true" focusable="false">
    {[0, 1, 2].map(row => { const y = 8 + row * 28; return <g key={row}>
      <rect x="18" y={y} width="164" height="22" rx="11" fill={paper} stroke={ink} strokeOpacity=".28" strokeWidth="1.2" strokeDasharray={row ? '4 4' : undefined} />
      <rect x="30" y={y + 8} width={row ? 50 : 66} height="6" rx="3" fill={ink} fillOpacity=".14" />
      <rect x="126" y={y + 5} width="22" height="12" rx="6" fill={row ? 'none' : accent} stroke={ink} strokeOpacity=".35" strokeWidth="1.1" />
      <rect x="152" y={y + 5} width="22" height="12" rx="6" fill="none" stroke={ink} strokeOpacity=".35" strokeWidth="1.1" />
    </g>; })}
  </svg>;
}

/** Not released yet: a folder held with a padlock. */
export function NotReleasedArt() {
  const stripes = useId();
  return <svg className="ubec-empty-art" viewBox="0 0 200 104" aria-hidden="true" focusable="false">
    <defs><Stripes id={stripes} /></defs>
    <path d="M40 24a7 7 0 0 1 7-7h28l9 9h69a7 7 0 0 1 7 7v54a7 7 0 0 1-7 7H47a7 7 0 0 1-7-7Z" fill={paper} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M41 36h118" stroke={ink} strokeOpacity=".2" strokeWidth="1.2" />
    <rect x="41" y="37" width="118" height="12" fill={`url(#${stripes})`} />
    <rect x="86" y="56" width="28" height="24" rx="5" fill={accent} stroke={ink} strokeOpacity=".55" strokeWidth="1.5" />
    <path d="M92 56v-6a8 8 0 0 1 16 0v6" fill="none" stroke={ink} strokeOpacity=".55" strokeWidth="1.8" />
    <circle cx="100" cy="68" r="3" fill={ink} fillOpacity=".55" />
  </svg>;
}

/** No results to show: a pipeline of four steps, none reached. */
export function PipelineIdleArt() {
  const steps = 4, gap = 52, start = 22, y = 24;
  return <svg className="ubec-empty-art ubec-empty-art-wide" viewBox="0 0 200 48" aria-hidden="true" focusable="false">
    <line x1={start} y1={y} x2={start + gap * (steps - 1)} y2={y} stroke={ink} strokeOpacity=".3" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />
    {Array.from({ length: steps }, (_, index) => <g key={index}>
      <circle cx={start + gap * index} cy={y} r="11" fill={index === 0 ? accent : paper} stroke={ink} strokeOpacity={index === 0 ? .55 : .3} strokeWidth="1.5" strokeDasharray={index === 0 ? undefined : '3 3'} />
      <circle cx={start + gap * index} cy={y} r="3.5" fill={ink} fillOpacity={index === 0 ? .5 : .14} />
    </g>)}
  </svg>;
}
