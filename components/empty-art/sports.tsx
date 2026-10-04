import { useSvgId } from './svg-id';
import './editor-empty.css';

const ink = '#2c7a5e';

/** A sports field in outline, mown stripes and an empty centre: a sports plan not yet started. */
export function EmptySportsFieldArt({ label = 'No sports items yet', badge = true }: { label?: string; badge?: boolean }) {
  const stripes = useSvgId('sports-field');
  const line = { fill: 'none', stroke: ink, strokeOpacity: .4, strokeWidth: 1.5 };
  return <svg className="editor-empty-art" viewBox="0 0 240 120" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="24" height="10" patternUnits="userSpaceOnUse">
        <rect width="24" height="10" fill="#4bbf96" fillOpacity=".06" />
        <rect width="12" height="10" fill="#4bbf96" fillOpacity=".13" />
      </pattern>
    </defs>
    <rect x="30" y="16" width="180" height="92" rx="10" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 5" />
    <path d="M120 17v90" {...line} strokeDasharray="4 4" />
    <circle cx="120" cy="62" r="16" {...line} />
    <path d="M31 42h20v40H31M209 42h-20v40h20" {...line} />
    <circle cx="120" cy="62" r="3.5" fill={ink} fillOpacity=".45" />
    {badge && <g>
      <circle cx="210" cy="16" r="13" fill={ink} />
      <path d="M210 10.5v11M204.5 16h11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </g>}
  </svg>;
}
