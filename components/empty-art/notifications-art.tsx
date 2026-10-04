import './empty-art.css';
import { useSvgId } from './svg-id';

const ink = '#2c7a5e';

/** Empty notification list: a list of updates with nothing in it, and a check badge for "caught up". */
export function NotificationsEmptyArt({ label }: { label: string }) {
  const stripes = useSvgId('empty-notifications');
  return <svg className="empty-art empty-art-notifications" viewBox="0 0 160 104" role="img" aria-label={label}>
    <defs>
      <pattern id={stripes} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill={ink} fillOpacity=".04" />
        <rect width="5" height="10" fill={ink} fillOpacity=".08" />
      </pattern>
    </defs>
    <rect x="30" y="12" width="108" height="78" rx="12" fill={ink} fillOpacity=".06" transform="rotate(-5 84 51)" />
    <rect x="24" y="16" width="112" height="80" rx="12" fill="#fff" stroke={ink} strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="5 5" />
    <rect x="25" y="17" width="110" height="20" rx="11" fill={`url(#${stripes})`} />
    <circle cx="42" cy="52" r="7" fill={ink} fillOpacity=".2" />
    <rect x="56" y="46" width="56" height="6" rx="3" fill={ink} fillOpacity=".26" />
    <rect x="56" y="56" width="36" height="5" rx="2.5" fill={ink} fillOpacity=".14" />
    <circle cx="42" cy="77" r="7" fill={ink} fillOpacity=".12" />
    <rect x="56" y="71" width="46" height="6" rx="3" fill={ink} fillOpacity=".16" />
    <rect x="56" y="81" width="30" height="5" rx="2.5" fill={ink} fillOpacity=".1" />
    <circle cx="136" cy="18" r="12" fill={ink} />
    <path d="M130.5 18.5l3.8 3.8 7.2-7.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
