import './empty-art.css';
import { useSvgId } from './svg-id';

const ink = '#2c7a5e';
const columns = [14, 58, 102], rows = [52, 74];

/** Empty comments panel: a sheet cell with a speech bubble on it, waiting to be written; ticked for resolved. */
export function CommentCellArt({ label, resolved = false }: { label: string; resolved?: boolean }) {
  const stripes = useSvgId('empty-comment-cell');
  return <svg className="empty-art empty-art-comment" viewBox="0 0 180 100" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill={ink} fillOpacity=".05" />
        <rect width="4" height="8" fill={ink} fillOpacity=".12" />
      </pattern>
    </defs>
    {rows.flatMap(y => columns.map(x => <rect key={`${x}-${y}`} x={x} y={y} width="44" height="22" fill="#fff" stroke={ink} strokeOpacity=".18" />))}
    {/* The commented cell, with the corner marker the workbook draws. */}
    <rect x="58" y="52" width="44" height="22" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".55" strokeWidth="1.5" />
    <path d="M94 52h8v8z" fill={ink} fillOpacity=".7" />
    <path d="M102 6h58a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10h-46l-9 9v-9h-3a10 10 0 0 1-10-10v-14a10 10 0 0 1 10-10z"
      fill="#fff" stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" />
    <rect x="102" y="15" width="48" height="6" rx="3" fill={ink} fillOpacity=".28" />
    <rect x="102" y="26" width="30" height="5" rx="2.5" fill={ink} fillOpacity=".14" />
    {resolved && <>
      <circle cx="168" cy="8" r="8" fill={ink} />
      <path d="M164.2 8.2l2.6 2.6 5-5.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>}
  </svg>;
}
