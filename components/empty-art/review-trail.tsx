import './empty-art.css';
const ink = '#2c7a5e';
const steps = ['Data Entry', 'Director', 'BEAP Chair', 'Chairman'];

/** Empty state: the review chain a plan moves along (Data Entry → Director → BEAP Chair → Chairman), no steps taken yet. */
export function ReviewTrailArt({ caption, className }: { caption: string; className?: string }) {
  const gap = 76, start = 26, y = 26;
  return <figure className={className}>
    <svg viewBox="0 0 280 66" role="img" aria-label={caption}>
      <line x1={start} y1={y} x2={start + gap * 3} y2={y} stroke={ink} strokeOpacity=".3" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />
      {steps.map((step, index) => {
        const x = start + gap * index;
        return <g key={step}>
          <circle cx={x} cy={y} r="13" fill="#fff" stroke={ink} strokeOpacity={index === 0 ? .55 : .28} strokeWidth="1.5" strokeDasharray={index === 0 ? undefined : '3 3'} />
          <circle cx={x} cy={y} r="4.5" fill={ink} fillOpacity={index === 0 ? .45 : .14} />
          <text x={x} y="60" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity=".7">{step}</text>
        </g>;
      })}
    </svg>
    <figcaption>{caption}</figcaption>
  </figure>;
}
