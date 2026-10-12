import { useId } from 'react';

// Decorative pictures for the figure tiles of the UBEC workflow dialogs (aria-hidden; the tile label carries the
// meaning). Soft 3D look: glossy gradient shapes with a highlight and a coloured contact shadow.

function Shadow({ id, cx, width, from, to }: { id: string; cx: number; width: number; from: string; to: string }) {
  return <>
    <defs><linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor={from} stopOpacity="0" /><stop offset=".5" stopColor={to} stopOpacity=".55" /><stop offset="1" stopColor={from} stopOpacity="0" /></linearGradient></defs>
    <ellipse cx={cx} cy="58" rx={width} ry="2.6" fill={`url(#${id})`} />
  </>;
}

/** Components: a stack of glossy cards, orange to pink. */
export function ComponentsArt() {
  const id = useId().replace(/:/g, '');
  return <svg className="stat-art" viewBox="0 0 72 62" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb4d0" /><stop offset="1" stopColor="#ff3d7f" /></linearGradient>
      <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffc178" /><stop offset="1" stopColor="#ff6a1a" /></linearGradient>
      <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
    </defs>
    <Shadow id={`${id}s`} cx={36} width={26} from="#ff8a3d" to="#c2410c" />
    <rect x="22" y="6" width="38" height="28" rx="7" fill={`url(#${id}a)`} transform="rotate(10 41 20)" />
    <rect x="10" y="20" width="40" height="30" rx="7" fill={`url(#${id}b)`} />
    <rect x="13" y="22" width="34" height="11" rx="5" fill={`url(#${id}c)`} />
    <path d="M17 40h20M17 45h12" stroke="#fff" strokeOpacity=".85" strokeWidth="2.2" strokeLinecap="round" />
  </svg>;
}

/** Directors: two figures, a sphere head on a cone body, violet and blue. */
export function DirectorsArt() {
  const id = useId().replace(/:/g, '');
  return <svg className="stat-art" viewBox="0 0 72 62" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}h`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#c9c2ff" /><stop offset="1" stopColor="#4f46e5" /></radialGradient>
      <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b7bff" /><stop offset="1" stopColor="#3b2fd6" /></linearGradient>
      <radialGradient id={`${id}h2`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#9fd0ff" /><stop offset="1" stopColor="#1d64e0" /></radialGradient>
      <linearGradient id={`${id}b2`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7ab8ff" /><stop offset="1" stopColor="#1e4fd1" /></linearGradient>
      <radialGradient id={`${id}g`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#b8f08a" /><stop offset="1" stopColor="#16a34a" /></radialGradient>
    </defs>
    <Shadow id={`${id}s`} cx={36} width={28} from="#6366f1" to="#3730a3" />
    <circle cx="47" cy="15" r="8" fill={`url(#${id}h2)`} />
    <path d="M34 56c0-14 5-24 13-24s13 10 13 24Z" fill={`url(#${id}b2)`} />
    <circle cx="27" cy="20" r="9.5" fill={`url(#${id}h)`} />
    <path d="M11 57c0-16 6-27 16-27s16 11 16 27Z" fill={`url(#${id}b)`} />
    <path d="M17 44c2-6 5-9 9-10" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="40" cy="38" r="6.5" fill={`url(#${id}g)`} />
    <path d="m37.2 38 2 2 3.6-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/** Total proposed: glossy gold coins beside a green sphere. */
export function FundsArt() {
  const id = useId().replace(/:/g, '');
  const coin = (y: number, i: number) => <g key={y}>
    <path d={`M30 ${y}v5a14 5 0 0 0 28 0v-5`} fill={`url(#${id}e)`} />
    <ellipse cx="44" cy={y} rx="14" ry="5" fill={`url(#${id}t)`} />
    {i === 2 && <path d={`M37 ${y - 1}q7 -3 14 0`} stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" fill="none" />}
  </g>;
  return <svg className="stat-art" viewBox="0 0 72 62" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe48a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
      <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#c2410c" /></linearGradient>
      <radialGradient id={`${id}g`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#bef264" /><stop offset=".6" stopColor="#22c55e" /><stop offset="1" stopColor="#14532d" /></radialGradient>
    </defs>
    <Shadow id={`${id}s`} cx={38} width={28} from="#f59e0b" to="#b45309" />
    <circle cx="19" cy="45" r="11" fill={`url(#${id}g)`} />
    {[46, 38, 30].map(coin)}
  </svg>;
}
