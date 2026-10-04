import { useSvgId } from './svg-id';
import './editor-empty.css';

const ink = '#2c7a5e';

function AddBadge({ x, y }: { x: number; y: number }) {
  return <g>
    <circle cx={x} cy={y} r="12" fill={ink} />
    <path d={`M${x} ${y - 5}v10M${x - 5} ${y}h10`} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </g>;
}

/** A school building outline: a package not yet planned for it. */
export function EmptySchoolPackageArt({ label = 'No school packages yet', badge = true }: { label?: string; badge?: boolean }) {
  const stripes = useSvgId('school-package');
  return <svg className="editor-empty-art" viewBox="0 0 240 120" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill={ink} fillOpacity=".04" />
        <rect width="4.5" height="9" fill={ink} fillOpacity=".1" />
      </pattern>
    </defs>
    <path d="M36 106h168" stroke={ink} strokeOpacity=".22" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M62 52 120 20l58 32Z" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="72" y="52" width="96" height="54" rx="3" fill="#fff" stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 4" />
    <rect x="110" y="78" width="20" height="28" rx="2" fill={ink} fillOpacity=".16" />
    <rect x="84" y="62" width="16" height="13" rx="2" fill={ink} fillOpacity=".12" />
    <rect x="140" y="62" width="16" height="13" rx="2" fill={ink} fillOpacity=".12" />
    {badge && <AddBadge x={170} y={52} />}
  </svg>;
}

/** A classroom desk and bench in outline: furniture still to be listed. */
export function EmptyFurnitureArt({ label = 'No furniture items yet' }: { label?: string }) {
  const stripes = useSvgId('furniture');
  const leg = { stroke: ink, strokeOpacity: .42, strokeWidth: 3, strokeLinecap: 'round' as const };
  return <svg className="editor-empty-art editor-empty-art-small" viewBox="0 0 200 110" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill={ink} fillOpacity=".05" />
        <rect width="4" height="8" fill={ink} fillOpacity=".12" />
      </pattern>
    </defs>
    <path d="M28 96h144" stroke={ink} strokeOpacity=".22" strokeWidth="1.5" strokeLinecap="round" />
    {/* Desk. */}
    <path d="M52 46v48M148 46v48" {...leg} />
    <rect x="40" y="34" width="120" height="12" rx="4" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 4" />
    {/* Bench in front. */}
    <path d="M70 74v20M130 74v20" {...leg} />
    <rect x="60" y="66" width="80" height="8" rx="3" fill="#fff" stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="4 4" />
    <AddBadge x={160} y={34} />
  </svg>;
}
