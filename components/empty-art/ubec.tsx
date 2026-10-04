import { useId } from 'react';
import './ubec.css';

const ink = '#2c7a5e';

/** No submissions yet: an open tray with a state plan card on its way in. */
export function EmptySubmissionsArt({ label }: { label: string }) {
  const stripes = useId();
  return <svg className="ubec-empty-art" viewBox="0 0 200 104" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill={ink} fillOpacity=".04" />
        <rect width="4.5" height="9" fill={ink} fillOpacity=".1" />
      </pattern>
    </defs>
    {/* Plan card, dashed: not sent yet. */}
    <rect x="62" y="6" width="76" height="62" rx="9" fill="#fff" stroke={ink} strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="5 4" />
    <rect x="63" y="7" width="74" height="20" rx="8" fill={`url(#${stripes})`} />
    <rect x="72" y="36" width="40" height="6" rx="3" fill={ink} fillOpacity=".26" />
    <rect x="72" y="48" width="28" height="5" rx="2.5" fill={ink} fillOpacity=".14" />
    {/* Tray. */}
    <path d="M30 62h36l8 12h52l8-12h36v30a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8Z" fill="#fff" />
    <path d="M30 62h36l8 12h52l8-12h36v30a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8Z" fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".5" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>;
}

const ubecSteps = ['Received', 'Assigned', 'Reviewed', 'Decided'];

/** No review activity: the UBEC review steps with none taken yet. */
export function EmptyReviewTrailArt() {
  const gap = 76, start = 26, y = 26;
  return <svg className="ubec-empty-art ubec-empty-art-wide" viewBox="0 0 280 66" role="img" aria-label="No review activity yet">
    <line x1={start} y1={y} x2={start + gap * 3} y2={y} stroke={ink} strokeOpacity=".3" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />
    {ubecSteps.map((step, index) => {
      const x = start + gap * index;
      return <g key={step}>
        <circle cx={x} cy={y} r="13" fill="#fff" stroke={ink} strokeOpacity={index === 0 ? .55 : .28} strokeWidth="1.5" strokeDasharray={index === 0 ? undefined : '3 3'} />
        <circle cx={x} cy={y} r="4.5" fill={ink} fillOpacity={index === 0 ? .45 : .14} />
        <text x={x} y="60" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity=".7">{step}</text>
      </g>;
    })}
  </svg>;
}

/** No departmental assignments: department rows with empty review pills. */
export function EmptyWorkloadArt() {
  return <svg className="ubec-empty-art" viewBox="0 0 200 84" role="img" aria-label="No departmental assignments yet">
    {[0, 1, 2].map(row => {
      const y = 6 + row * 28;
      return <g key={row}>
        <rect x="10" y={y + 4.5} width={[78, 58, 68][row]} height="7" rx="3.5" fill={ink} fillOpacity={row ? .14 : .26} />
        <rect x="124" y={y} width="66" height="16" rx="8" fill="#fff" stroke={ink} strokeOpacity={row ? .28 : .45} strokeWidth="1.2" strokeDasharray="4 4" />
      </g>;
    })}
  </svg>;
}

/** Nothing waiting: a clear tray with a tick. */
export function NothingWaitingArt({ label }: { label: string }) {
  return <svg className="ubec-empty-art ubec-empty-art-small" viewBox="0 0 120 84" role="img" aria-label={label}>
    <rect x="14" y="14" width="80" height="58" rx="10" fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="5 4" />
    <rect x="26" y="30" width="40" height="6" rx="3" fill={ink} fillOpacity=".18" />
    <rect x="26" y="44" width="28" height="6" rx="3" fill={ink} fillOpacity=".12" />
    <circle cx="94" cy="20" r="14" fill={ink} />
    <path d="m87.5 20.5 4.5 4.5 8-9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
