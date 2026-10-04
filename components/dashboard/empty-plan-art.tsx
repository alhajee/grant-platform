/** Empty state for the plan list: a plan card waiting to be created, in the BEAPMS greens. */
export function EmptyPlanArt() {
  const ink = '#2c7a5e';
  return <svg className="empty-plan-art" viewBox="0 0 240 132" role="img" aria-label="No action plans yet">
    <defs>
      <pattern id="empty-plan-stripes" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill={ink} fillOpacity=".04" />
        <rect width="5" height="10" fill={ink} fillOpacity=".08" />
      </pattern>
    </defs>
    {/* A card behind, slightly turned, so it reads as a stack of plans to come. */}
    <rect x="44" y="14" width="160" height="104" rx="14" fill={ink} fillOpacity=".06" transform="rotate(-5 124 66)" />
    <rect x="36" y="18" width="168" height="104" rx="14" fill="#fff" stroke={ink} strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="5 5" />
    <rect x="37" y="19" width="166" height="40" rx="13" fill="url(#empty-plan-stripes)" />
    <rect x="52" y="32" width="58" height="8" rx="4" fill={ink} fillOpacity=".3" />
    <rect x="52" y="44" width="36" height="6" rx="3" fill={ink} fillOpacity=".16" />
    {/* Gauge, like the plan card's funding gauge, still empty. */}
    <path d="M150 98a22 22 0 0 1 44 0" fill="none" stroke={ink} strokeOpacity=".18" strokeWidth="7" strokeLinecap="round" />
    <path d="M150 98a22 22 0 0 1 8-17" fill="none" stroke={ink} strokeOpacity=".5" strokeWidth="7" strokeLinecap="round" />
    <rect x="52" y="74" width="74" height="7" rx="3.5" fill={ink} fillOpacity=".2" />
    <rect x="52" y="88" width="50" height="7" rx="3.5" fill={ink} fillOpacity=".12" />
    <rect x="52" y="102" width="62" height="7" rx="3.5" fill={ink} fillOpacity=".12" />
    {/* "New" badge. */}
    <circle cx="204" cy="20" r="14" fill={ink} />
    <path d="M204 14v12M198 20h12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
