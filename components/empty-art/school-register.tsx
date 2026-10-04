import { useId } from 'react';
import './school-register.css';

const ink = '#2c7a5e';

/** Empty register: a school waiting to be listed, beside register rows still to fill. */
export function EmptyRegisterArt() {
  const stripes = useId();
  return <svg className="register-empty-art" viewBox="0 0 220 112" role="img" aria-label="No schools in the register yet">
    <defs>
      <pattern id={stripes} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill={ink} fillOpacity=".04" />
        <rect width="4.5" height="9" fill={ink} fillOpacity=".1" />
      </pattern>
    </defs>
    {/* School building: striped roof, dashed walls, door and two windows. */}
    <path d="M14 46 54 18l40 28Z" fill={`url(#${stripes})`} stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeLinejoin="round" />
    <rect x="22" y="46" width="64" height="52" rx="3" fill="#fff" stroke={ink} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 4" />
    <rect x="45" y="70" width="18" height="28" rx="2" fill={ink} fillOpacity=".16" />
    <rect x="30" y="56" width="11" height="10" rx="2" fill={ink} fillOpacity=".12" />
    <rect x="67" y="56" width="11" height="10" rx="2" fill={ink} fillOpacity=".12" />
    <path d="M54 18V6" stroke={ink} strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M54 6h12l-3 4 3 4H54" fill="#4bbf96" fillOpacity=".5" />
    {/* Register rows: the first started, the rest waiting. */}
    {[0, 1, 2, 3].map(row => <g key={row}>
      <rect x="110" y={30 + row * 18} width="98" height="12" rx="6" fill={row ? '#fff' : ink} fillOpacity={row ? 1 : .08}
        stroke={ink} strokeOpacity={row ? .28 : .4} strokeWidth="1.2" strokeDasharray={row ? '4 4' : undefined} />
      {!row && <rect x="117" y="34.5" width="42" height="3.5" rx="1.75" fill={ink} fillOpacity=".35" />}
    </g>)}
    <rect x="110" y="12" width="46" height="7" rx="3.5" fill={ink} fillOpacity=".3" />
  </svg>;
}

/** No search or filter results: register rows with a lens over an empty one. */
export function NoMatchingSchoolsArt() {
  return <svg className="register-empty-art register-empty-art-small" viewBox="0 0 160 84" role="img" aria-label="No matching schools">
    {[0, 1, 2].map(row => <rect key={row} x="10" y={12 + row * 22} width="116" height="14" rx="7" fill="#fff"
      stroke={ink} strokeOpacity=".28" strokeWidth="1.2" strokeDasharray="4 4" />)}
    <circle cx="118" cy="44" r="20" fill="#fff" stroke={ink} strokeOpacity=".55" strokeWidth="2" />
    <rect x="104" y="37" width="28" height="14" rx="7" fill="none" stroke={ink} strokeOpacity=".3" strokeWidth="1.2" strokeDasharray="3 3" />
    <path d="m133 59 14 14" stroke={ink} strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}
