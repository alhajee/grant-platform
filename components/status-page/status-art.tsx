import { useSvgId } from '@/components/empty-art/svg-id';

// Illustrations for the 404 and error pages (bug sheet 24), drawn in the empty-state style (components/empty-art):
// brand ink lines, white paper, one lime accent, a stripe texture and dashed lines for what is missing. Decorative.
const ink = 'var(--status-art-ink)', paper = 'var(--status-art-paper)', accent = 'var(--status-art-accent)';

function Stripes({ id }: { id: string }) {
  return <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="9" height="9" fill={ink} fillOpacity=".04" /><rect width="4.5" height="9" fill={ink} fillOpacity=".1" />
  </pattern>;
}

/** Not found: a school at the end of the road, a signpost reading 404 and a dashed path that leads nowhere. */
export function NotFoundArt() {
  const stripes = useSvgId('not-found');
  return <svg className="status-art" viewBox="0 0 320 200" aria-hidden="true" focusable="false">
    <defs><Stripes id={stripes} /></defs>
    <path d="M24 176h272" stroke={ink} strokeOpacity=".22" strokeWidth="1.5" strokeLinecap="round" />
    {/* the school */}
    <path d="M150 78 206 48l56 30Z" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="160" y="78" width="92" height="98" rx="3" fill={paper} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" />
    <circle cx="206" cy="66" r="5" fill={accent} stroke={ink} strokeOpacity=".45" strokeWidth="1.3" />
    {[0, 1].map(row => [0, 1, 2].map(col => <rect key={`${row}${col}`} x={170 + col * 26} y={90 + row * 26} width="18" height="14" rx="2.5" fill={ink} fillOpacity=".1" />))}
    <rect x="196" y="144" width="20" height="32" rx="3" fill={ink} fillOpacity=".16" />
    <path d="M206 26v-14M206 12h14l-3 4 3 4h-14" fill={accent} stroke={ink} strokeOpacity=".5" strokeWidth="1.3" strokeLinejoin="round" />
    {/* the path that stops short */}
    <path d="M30 176c22-4 40-12 56-24s30-14 44-6" fill="none" stroke={ink} strokeOpacity=".4" strokeWidth="1.6" strokeDasharray="5 5" strokeLinecap="round" />
    {/* the signpost */}
    <rect x="96" y="86" width="5" height="90" rx="2" fill={paper} stroke={ink} strokeOpacity=".5" strokeWidth="1.4" />
    <path d="M62 86h66l10 11-10 11H62Z" fill={accent} stroke={ink} strokeOpacity=".55" strokeWidth="1.5" strokeLinejoin="round" />
    <text x="95" y="102" textAnchor="middle" fontSize="15" fontWeight="700" fill={ink} fontFamily="system-ui, sans-serif">404</text>
    <path d="M136 116H76l-10 9 10 9h60Z" fill={paper} stroke={ink} strokeOpacity=".4" strokeWidth="1.4" strokeDasharray="4 3" strokeLinejoin="round" />
    <rect x="84" y="122" width="40" height="5" rx="2.5" fill={ink} fillOpacity=".14" />
    {/* a little question mark cloud */}
    <circle cx="44" cy="58" r="17" fill={paper} stroke={ink} strokeOpacity=".4" strokeWidth="1.4" strokeDasharray="4 3" />
    <path d="M39 53a5 5 0 1 1 7 5c-1.4.8-2 1.7-2 3.2M44 66v.4" fill="none" stroke={ink} strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/** Something went wrong: a page with a torn corner and a spanner, and a small spark. */
export function ErrorArt() {
  const stripes = useSvgId('error-page');
  return <svg className="status-art" viewBox="0 0 320 200" aria-hidden="true" focusable="false">
    <defs><Stripes id={stripes} /></defs>
    <path d="M40 176h240" stroke={ink} strokeOpacity=".22" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M110 24h80l24 24v120a8 8 0 0 1-8 8H110a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z" fill={paper} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M190 24v24h24" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="104" y="25" width="85" height="20" rx="7" fill={`url(#${stripes})`} />
    {[0, 1, 2, 3].map(row => <rect key={row} x="120" y={66 + row * 15} width={row % 2 ? 50 : 72} height="6" rx="3" fill={ink} fillOpacity={row === 2 ? .06 : .14} />)}
    <path d="M118 136h76" stroke={ink} strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="5 4" strokeLinecap="round" />
    <circle cx="214" cy="132" r="22" fill={accent} stroke={ink} strokeOpacity=".5" strokeWidth="1.5" />
    <path d="M206 140l12-12m-2-6a6 6 0 1 0 8 8l-3-1-2-2-1-3Z" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M66 70l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill={accent} stroke={ink} strokeOpacity=".5" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="250" cy="70" r="4" fill={paper} stroke={ink} strokeOpacity=".4" strokeWidth="1.3" />
  </svg>;
}
