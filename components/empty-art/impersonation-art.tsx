import './empty-art.css';
const ink = '#2c7a5e';

function Person({ x, active }: { x: number; active: boolean }) {
  const strength = active ? .45 : .16;
  return <g>
    <circle cx={x} cy="30" r="20" fill="#fff" stroke={ink} strokeOpacity={active ? .55 : .3} strokeWidth="1.5" strokeDasharray={active ? undefined : '4 4'} />
    <circle cx={x} cy="25" r="6" fill={ink} fillOpacity={strength} />
    <path d={`M${x - 11} 42a11 9 0 0 1 22 0z`} fill={ink} fillOpacity={strength} />
  </g>;
}

/** Empty impersonation log: an administrator, a dashed arrow, and the user they would act as. */
export function ImpersonationArt({ label }: { label: string }) {
  return <svg className="empty-art empty-art-impersonation" viewBox="0 0 200 60" role="img" aria-label={label}>
    <Person x={50} active />
    <path d="M80 30h38" stroke={ink} strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />
    <path d="M116 25l6 5-6 5" fill="none" stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <Person x={150} active={false} />
  </svg>;
}
