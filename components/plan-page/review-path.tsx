// The state review chain as a small diagram, for plans that have no review steps yet.
const STEPS = [
  { label: ['Data', 'Entry'] },
  { label: ['Director'] },
  { label: ['BEAP', 'Chair'] },
  { label: ['Executive', 'Chairman'] },
  { label: ['UBEC'] },
] as const;
const WIDTH = 300, HEIGHT = 92, NODE_Y = 26, RADIUS = 13, MARGIN = 26;
const GAP = (WIDTH - MARGIN * 2) / (STEPS.length - 1);

/** Five steps on one track; the first is where every component starts. Purely illustrative, so it has a text alternative. */
export function ReviewPath() {
  const x = (index: number) => MARGIN + index * GAP;
  return <svg className="review-path" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Review path: Data Entry, then Director, BEAP Chair, Executive Chairman and UBEC">
    <defs>
      <marker id="review-path-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1 7 4 1 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></marker>
    </defs>
    {STEPS.slice(1).map((_, index) => <line key={index} className="review-path-link" x1={x(index) + RADIUS + 4} y1={NODE_Y} x2={x(index + 1) - RADIUS - 4} y2={NODE_Y} markerEnd="url(#review-path-arrow)" />)}
    {STEPS.map((step, index) => <g key={index} className="review-path-step" data-first={index === 0 || undefined}>
      <circle cx={x(index)} cy={NODE_Y} r={RADIUS} />
      <text className="review-path-number" x={x(index)} y={NODE_Y + 4} textAnchor="middle">{index + 1}</text>
      <text className="review-path-label" x={x(index)} y={NODE_Y + RADIUS + 16} textAnchor="middle">
        {step.label.map((line, row) => <tspan key={line} x={x(index)} dy={row ? 12 : 0}>{line}</tspan>)}
      </text>
    </g>)}
  </svg>;
}
