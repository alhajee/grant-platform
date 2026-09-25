export function DashboardArtwork() {
  return <svg className="dashboard-artwork" viewBox="0 0 580 330" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="campus-ground" x1="230" y1="110" x2="460" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#4a9588"/><stop offset="1" stopColor="#155b53"/></linearGradient>
      <linearGradient id="campus-roof" x1="130" y1="100" x2="340" y2="200" gradientUnits="userSpaceOnUse"><stop stopColor="#d9eab5"/><stop offset="1" stopColor="#91b687"/></linearGradient>
    </defs>
    <circle cx="410" cy="120" r="106" fill="#fff" opacity=".035"/><circle cx="410" cy="120" r="78" stroke="#b5ddc3" strokeOpacity=".14"/>
    <path d="M39 251 276 123 552 247 321 365Z" fill="url(#campus-ground)"/>
    <path d="m158 268 177-94 129 57-178 98Z" fill="#78a68b" opacity=".4"/>
    <path d="m327 309 91-50 36 16-89 51" stroke="#bad1aa" strokeWidth="12" opacity=".5"/>
    <path d="M155 145v87l135 61v-88Z" fill="#eff0d8"/><path d="m290 205 137-73v90l-137 71Z" fill="#b4cbb0"/>
    <path d="m137 146 140-78 164 61-151 80Z" fill="url(#campus-roof)"/><path d="m137 146 153 63v8l-153-63ZM290 209l151-80v8l-151 80Z" fill="#6d9277"/>
    <path d="m157 136 122-66 128 49" stroke="#e9f0cf" strokeWidth="2" opacity=".6"/>
    {[0,1,2,3].map((i) => <path key={i} d={`m${175+i*27} ${173+i*12} 15 7v24l-15-7Z`} fill="#3c796d"/>)}
    {[0,1,2,3].map((i) => <path key={i} d={`m${315+i*27} ${203-i*14} 16-8v24l-16 8Z`} fill="#30665b"/>)}
    <path d="m345 236 25-13v29l-25 13Z" fill="#18534c"/>
    <path d="M278 68V26" stroke="#cfdfba" strokeWidth="3"/><path d="m280 27 36 9-12 11-24-6Z" fill="#e5cd89"/>
    <path d="m80 240 27-14 24 11-27 15Z" fill="#124f46" opacity=".4"/><path d="M106 232v-56" stroke="#b8c5a0" strokeWidth="5"/><ellipse cx="106" cy="178" rx="24" ry="35" fill="#8caf85"/><path d="M106 209v-36" stroke="#507b62" strokeWidth="2"/>
    <path d="m459 211 25-14 28 12-28 16Z" fill="#124f46" opacity=".4"/><path d="M484 208v-48" stroke="#b8c5a0" strokeWidth="5"/><ellipse cx="484" cy="154" rx="23" ry="34" fill="#a6bf86"/><path d="M484 187v-37" stroke="#688962" strokeWidth="2"/>
    <g transform="translate(390 282)"><ellipse rx="14" ry="6" fill="#144e47" opacity=".45"/><path d="m-4-3 1-19M4-3 0-19" stroke="#d6e4ce" strokeWidth="4" strokeLinecap="round"/><path d="M-4-20v-15h9v15" fill="#e3be76"/><circle cy="-41" r="5" fill="#ac7955"/></g>
    <g transform="translate(300 326)"><ellipse rx="12" ry="5" fill="#144e47" opacity=".45"/><path d="m-4-3 1-16M4-3 0-16" stroke="#d6e4ce" strokeWidth="4" strokeLinecap="round"/><path d="M-4-17v-14h9v14" fill="#9abfce"/><circle cy="-37" r="5" fill="#ac7955"/></g>
    <path d="m68 98 7-7 7 7m365-30 6-6 6 6" stroke="#b8d4b8" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
    <circle cx="362" cy="47" r="3" fill="#e5cd89"/><circle cx="121" cy="89" r="2" fill="#e5cd89"/>
  </svg>;
}
