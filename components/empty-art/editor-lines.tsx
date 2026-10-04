import { useSvgId } from './svg-id';
import './editor-empty.css';

const ink = '#2c7a5e';

/** A budget sheet waiting for its lines: column headings, empty rows and an empty total. */
export function EmptyLinesArt({ label = 'No saved items yet' }: { label?: string }) {
  const stripes = useSvgId('editor-lines');
  const rows = [44, 60, 76];
  return <svg className="editor-empty-art" viewBox="0 0 240 124" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill={ink} fillOpacity=".04" />
        <rect width="5" height="10" fill={ink} fillOpacity=".09" />
      </pattern>
    </defs>
    <rect x="30" y="12" width="180" height="104" rx="12" fill="#fff" stroke={ink} strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="5 5" />
    <rect x="31" y="13" width="178" height="22" rx="11" fill={`url(#${stripes})`} />
    {/* Headings: description, quantity, amount. */}
    <rect x="44" y="21" width="46" height="6" rx="3" fill={ink} fillOpacity=".3" />
    <rect x="130" y="21" width="14" height="6" rx="3" fill={ink} fillOpacity=".3" />
    <rect x="168" y="21" width="28" height="6" rx="3" fill={ink} fillOpacity=".3" />
    {/* One row started, the rest waiting to be filled. */}
    <rect x="44" y="44" width="68" height="8" rx="4" fill={ink} fillOpacity=".16" />
    <rect x="130" y="44" width="14" height="8" rx="4" fill={ink} fillOpacity=".16" />
    <rect x="164" y="44" width="32" height="8" rx="4" fill={ink} fillOpacity=".16" />
    {rows.slice(1).map(y => <rect key={y} x="40" y={y - 3} width="160" height="13" rx="6.5" fill="none" stroke={ink} strokeOpacity=".28" strokeWidth="1.2" strokeDasharray="4 4" />)}
    {/* Total row, still empty. */}
    <path d="M44 93h152" stroke={ink} strokeOpacity=".2" strokeWidth="1.2" />
    <rect x="44" y="101" width="26" height="6" rx="3" fill={ink} fillOpacity=".28" />
    <text x="160" y="107" textAnchor="end" fontSize="10" fontWeight="600" fill={ink} fillOpacity=".55">₦</text>
    <rect x="164" y="100" width="32" height="8" rx="4" fill={ink} fillOpacity=".12" />
    <circle cx="210" cy="14" r="13" fill={ink} />
    <path d="M210 8.5v11M204.5 14h11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
