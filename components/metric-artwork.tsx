import type { ReactNode } from 'react';

function Artwork({ children }: { children: ReactNode }) {
  return <svg className="metric-artwork" viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="40" cy="68" rx="29" ry="6" fill="currentColor" opacity=".09" />
    {children}
  </svg>;
}

export function ReviewArtwork() {
  return <Artwork>
    <path d="m17 22 33-7 10 43-33 7Z" fill="#9caf8d" />
    <rect x="23" y="14" width="34" height="47" rx="5" fill="#fffbed" stroke="#bccbb0" />
    <rect x="32" y="11" width="16" height="8" rx="3" fill="#719580" />
    <path d="M31 29h18M31 37h14M31 45h10" stroke="#a5b794" strokeWidth="3" strokeLinecap="round" />
    <circle cx="56" cy="52" r="13" fill="#315e55" />
    <circle cx="56" cy="52" r="9" stroke="#a8c5ae" strokeWidth="1.5" />
    <path d="M56 46v6l4 3" stroke="#fffbed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Artwork>;
}

export function BudgetArtwork() {
  return <Artwork>
    <path d="m13 29 39-12 16 9-39 13Z" fill="#a8c5ae" />
    <path d="M13 29v26l16 10V39Z" fill="#70a18c" />
    <path d="m29 39 39-13v27L29 65Z" fill="#dce9b9" />
    <path d="m19 26 34-11 8 5-34 11Z" fill="#f4f2d6" />
    <path d="m36 33 10-3v28l-10 3Z" fill="#a8c5ae" />
    <ellipse cx="60" cy="51" rx="12" ry="13" fill="#b88c46" />
    <ellipse cx="57" cy="50" rx="12" ry="13" fill="#efd28c" />
    <ellipse cx="57" cy="50" rx="8" ry="9" stroke="#bb9553" />
    <path d="M54 55V45l6 10V45m-8 4h10m-10 3h10" stroke="#876533" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </Artwork>;
}

export function PlansArtwork() {
  return <Artwork>
    <rect x="15" y="20" width="39" height="46" rx="5" transform="rotate(-12 15 20)" fill="#c2b29a" />
    <rect x="24" y="13" width="39" height="49" rx="5" transform="rotate(6 24 13)" fill="#fffcf3" stroke="#d8c9af" />
    <path d="m32 26 19 2m-20 6 22 2m-23 6 15 2" stroke="#b8a689" strokeWidth="3" strokeLinecap="round" />
    <circle cx="56" cy="55" r="13" fill="#497b70" />
    <path d="m50 55 4 4 8-9" stroke="#f4f3d7" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </Artwork>;
}

export function SchoolsArtwork() {
  return <Artwork>
    <path d="m10 56 33-18 29 15-32 18Z" fill="#9caf8d" />
    <path d="M18 35v21l22 11V43Z" fill="#fffae8" />
    <path d="m40 43 23-12v24L40 67Z" fill="#c7d6b7" />
    <path d="m13 35 22-20 33 15-28 16Z" fill="#547e68" />
    <path d="m35 15 5 31 28-16Z" fill="#719580" />
    <path d="M24 43v8m8-4v8m15-8v8m9-13v8" stroke="#4f7261" strokeWidth="4" />
    <path d="M35 16V7m1 1 13 3-5 5-8-2" stroke="#b99047" strokeWidth="2" strokeLinejoin="round" />
    <path d="M12 58V45" stroke="#7c8d67" strokeWidth="2" /><ellipse cx="12" cy="42" rx="6" ry="9" fill="#9aaf79" />
  </Artwork>;
}

export function StatesArtwork() {
  return <Artwork>
    <path d="m11 35 19-7 20 7 19-7v30l-19 7-20-7-19 7Z" fill="#eaf3f7" stroke="#a5bdca" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m30 28 20 7v30l-20-7Z" fill="#bfd5df" />
    <path d="m16 49 14-5 20 7 14-5" stroke="#86a99e" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 5" />
    <path d="M55 24c0 10-13 21-13 21S29 34 29 24a13 13 0 0 1 26 0Z" fill="#467c95" />
    <circle cx="42" cy="24" r="5" fill="#eef7f6" />
    <path d="M32 23a10 10 0 0 1 10-9" stroke="#8bb4c4" strokeWidth="2" strokeLinecap="round" />
  </Artwork>;
}
