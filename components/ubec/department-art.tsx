import { useId, type ReactNode } from 'react';

// A badge for each UBEC component department (decorative, aria-hidden; the department name sits beside it).
// Game-badge style: a shield or hexagon with a thick darker edge underneath, an inset face, a diagonal glass sheen
// and a one-tone glyph that stands for the department. Used wherever a department is named.

type Shape = 'shield' | 'hexagon';
type Tones = { base: string; edge: string; face: string; glyph: string; light: string };
type Badge = { shape: Shape; tones: Tones; glyph: (c: string) => ReactNode };

const outline: Record<Shape, string> = {
  shield: 'M9 4.5h22a4.5 4.5 0 0 1 4.5 4.5v11.5C35.5 29 28.5 34 20 34S4.5 29 4.5 20.5V9A4.5 4.5 0 0 1 9 4.5Z',
  hexagon: 'M17.6 3.6a5 5 0 0 1 4.8 0l10.6 5.6a4.6 4.6 0 0 1 2.5 4.1v11.9a4.6 4.6 0 0 1-2.5 4.1L22.4 34.9a5 5 0 0 1-4.8 0L7 29.3a4.6 4.6 0 0 1-2.5-4.1V13.3A4.6 4.6 0 0 1 7 9.2Z',
};
const face: Record<Shape, string> = {
  shield: 'M10.5 8h19a2.5 2.5 0 0 1 2.5 2.5v9.8C32 26.8 26.8 30.5 20 30.5S8 26.8 8 20.3v-9.8A2.5 2.5 0 0 1 10.5 8Z',
  hexagon: 'M18.3 7.6a3.6 3.6 0 0 1 3.4 0l8.1 4.3a3 3 0 0 1 1.7 2.7v9.8a3 3 0 0 1-1.7 2.7l-8.1 4.3a3.6 3.6 0 0 1-3.4 0l-8.1-4.3a3 3 0 0 1-1.7-2.7v-9.8a3 3 0 0 1 1.7-2.7Z',
};

const badges: Record<string, Badge> = {
  // Physical Planning: a school building
  physical: { shape: 'shield', tones: { base: '#ffb547', edge: '#e0861a', face: '#ffa62b', glyph: '#b85f06', light: '#ffd48a' },
    glyph: c => <path fill={c} d="M20 10.5 28.5 17v1.6h-1.8V26h-4.4v-4.6h-4.6V26h-4.4v-7.4h-1.8V17Z" /> },
  // Planning, EMIS & Data Platform: rising bars
  planning: { shape: 'hexagon', tones: { base: '#4fc3ff', edge: '#1b8fd6', face: '#2fb0f5', glyph: '#0b6aa8', light: '#9fdcff' },
    glyph: c => <g fill={c}><rect x="12.5" y="20" width="4" height="7" rx="1.2" /><rect x="18" y="16" width="4" height="11" rx="1.2" /><rect x="23.5" y="12" width="4" height="15" rx="1.2" /></g> },
  // Academic Services: an open book
  academic: { shape: 'shield', tones: { base: '#ff6b6b', edge: '#d63b3b', face: '#ff5252', glyph: '#b02424', light: '#ffa8a8' },
    glyph: c => <path fill={c} d="M19 14.2c-2.7-1.9-5.4-2-8-1.2v12c2.6-.8 5.3-.7 8 1.2Zm2 0c2.7-1.9 5.4-2 8-1.2v12c-2.6-.8-5.3-.7-8 1.2Z" /> },
  // Teacher Professional Development: a graduation cap
  teachers: { shape: 'hexagon', tones: { base: '#b388ff', edge: '#7c4ddb', face: '#a06ff5', glyph: '#5b2fb3', light: '#d6bfff' },
    glyph: c => <g fill={c}><path d="m20 11.5 10 4.5-10 4.5-10-4.5Z" /><path d="M14 19.2v3.6c0 1.6 2.7 3.2 6 3.2s6-1.6 6-3.2v-3.6l-6 2.7Z" /><path d="M28.3 16.8h1.4v6h-1.4Z" /><circle cx="29" cy="23.6" r="1.4" /></g> },
  // Data, Digital Platforms & Analytics: a screen with a trend line
  digital: { shape: 'shield', tones: { base: '#3ddbd9', edge: '#14a8a6', face: '#22cbc9', glyph: '#0a7f7d', light: '#9ff0ef' },
    glyph: c => <g><path fill={c} d="M11.5 11.5h17a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-17a1.5 1.5 0 0 1-1.5-1.5V13a1.5 1.5 0 0 1 1.5-1.5Zm6 13.5h5l.8 2.6h-6.6Z" /><path d="m13.5 20.5 3.5-3.5 3 2.2 5-5" fill="none" stroke="#ffffff" strokeOpacity=".85" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></g> },
  // Monitoring & Evaluation: a magnifying glass with a check
  quality: { shape: 'hexagon', tones: { base: '#8be03b', edge: '#5aaa12', face: '#76d11f', glyph: '#3f8106', light: '#c4f28f' },
    glyph: c => <g><circle cx="18.5" cy="17.5" r="6.5" fill={c} /><path d="m23 22 5 5" stroke={c} strokeWidth="3.2" strokeLinecap="round" /><path d="m15.8 17.6 2 2 3.6-4" fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></g> },
  // Social Mobilisation: a megaphone
  social: { shape: 'shield', tones: { base: '#ff7eb6', edge: '#d9447f', face: '#ff63a5', glyph: '#ad215a', light: '#ffb8d6' },
    glyph: c => <g fill={c}><path d="M11.8 16.3h3.4l9.3-4.8v14l-9.3-4.8h-3.4a1.4 1.4 0 0 1-1.4-1.4v-1.6a1.4 1.4 0 0 1 1.4-1.4Z" /><path d="M14 21.2h2.8l1 4.3h-2.5Z" /><path d="M27 16c1 .8 1 3.7 0 4.6" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" /></g> },
  // UBEC BEAP Chair (not a department; the chair-limit row on Admin > Settings): a crown
  chair: { shape: 'hexagon', tones: { base: '#ffd24a', edge: '#d9a10f', face: '#ffc61f', glyph: '#a86f00', light: '#ffe9a3' },
    glyph: c => <g fill={c}><path d="M11.2 15.2 15.6 19 20 12.6l4.4 6.4 4.4-3.8-1.7 8.6H12.9Z" /><rect x="12.9" y="25.1" width="14.2" height="2.6" rx="1" /><circle cx="11.2" cy="14.6" r="1.6" /><circle cx="20" cy="11.6" r="1.6" /><circle cx="28.8" cy="14.6" r="1.6" /><circle cx="20" cy="20.6" r="1.3" fill="#ffffff" fillOpacity=".75" /></g> },
  // Roles (client, 11 November 2026: a badge for everyone, like the departments). Keys start with "role-"; see components/role-art.tsx.
  // Data Entry: a pencil
  'role-dataEntry': { shape: 'shield', tones: { base: '#ff9a6b', edge: '#e0683a', face: '#ff8552', glyph: '#b44a1e', light: '#ffc6ab' },
    glyph: c => <g><path fill={c} d="m24.6 10.8 4.6 4.6-11.6 11.6-5.6 1 1-5.6Z" /><path d="m22.4 13 4.6 4.6" stroke="#ffffff" strokeOpacity=".8" strokeWidth="1.5" /></g> },
  // Director (SUBEB and UBEC): a briefcase
  'role-director': { shape: 'hexagon', tones: { base: '#8e86ff', edge: '#5f55d6', face: '#7d74fa', glyph: '#3b2fa8', light: '#cbc6ff' },
    glyph: c => <g><path d="M16.6 14.2v-1.7a1.7 1.7 0 0 1 1.7-1.7h3.4a1.7 1.7 0 0 1 1.7 1.7v1.7" fill="none" stroke={c} strokeWidth="2" /><rect x="10.5" y="14.2" width="19" height="12.6" rx="2.2" fill={c} /><path d="M10.5 19.6h19" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1.3" /><rect x="18.6" y="18.4" width="2.8" height="2.6" rx=".7" fill="#ffffff" fillOpacity=".85" /></g> },
  // Executive Chairman: a gavel
  'role-chairman': { shape: 'shield', tones: { base: '#4a74f0', edge: '#2b4fc4', face: '#3d66e8', glyph: '#1b358f', light: '#a9beff' },
    glyph: c => <g fill={c}><g transform="rotate(-40 19 17)"><rect x="13.5" y="11" width="11" height="5.6" rx="1.5" /><rect x="17.7" y="16" width="2.6" height="10.5" rx="1.2" /></g><rect x="20" y="25.4" width="9.5" height="2.6" rx="1.2" /></g> },
  // UBEC Executive Secretary: a seal with ribbons
  'role-secretary': { shape: 'hexagon', tones: { base: '#e0a26b', edge: '#b8743a', face: '#d69457', glyph: '#8a4f1c', light: '#f3cfac' },
    glyph: c => <g><path fill={c} d="m16.8 21 -1.8 7 3.1-1.6 1.9 2.4 1-6.6Zm6.4 0 1.8 7-3.1-1.6-1.9 2.4-1-6.6Z" /><circle cx="20" cy="17.4" r="6.4" fill={c} /><path fill="#ffffff" fillOpacity=".85" d="m20 13.9 1.1 2.2 2.4.3-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.3Z" /></g> },
  // UBEC Oversight Director: an eye
  'role-oversight': { shape: 'shield', tones: { base: '#8fa8c8', edge: '#5f7aa0', face: '#7f9abd', glyph: '#3d5577', light: '#c9d7ea' },
    glyph: c => <g><path fill={c} d="M9.8 19.2c2.6-4.6 6.1-7 10.2-7s7.6 2.4 10.2 7c-2.6 4.6-6.1 7-10.2 7s-7.6-2.4-10.2-7Z" /><circle cx="20" cy="19.2" r="4" fill="#ffffff" fillOpacity=".9" /><circle cx="20" cy="19.2" r="2" fill={c} /></g> },
  // UBEC Assessment Officer: a clipboard with a check
  'role-officer': { shape: 'hexagon', tones: { base: '#4fd6a8', edge: '#21a77a', face: '#38c896', glyph: '#11744f', light: '#a9efd6' },
    glyph: c => <g><rect x="12.5" y="12.2" width="15" height="16" rx="2.2" fill={c} /><rect x="16.4" y="10.2" width="7.2" height="4" rx="1.3" fill={c} stroke="#ffffff" strokeOpacity=".7" strokeWidth="1" /><path d="m16.2 21 2.6 2.6 5-5.4" fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></g> },
  // Super Admin: a key
  'role-admin': { shape: 'shield', tones: { base: '#8a94a6', edge: '#5c6577', face: '#7b8597', glyph: '#363d4a', light: '#c8ced9' },
    glyph: c => <g fill={c}><circle cx="15.2" cy="18.6" r="5.2" /><rect x="19" y="17.2" width="11" height="2.9" rx="1" /><rect x="24.6" y="19.4" width="2.4" height="3.4" rx=".6" /><rect x="27.6" y="19.4" width="2.2" height="2.6" rx=".6" /><circle cx="14.4" cy="18.6" r="1.9" fill="#ffffff" fillOpacity=".85" /></g> },
};

/** The department's badge; nothing for an unknown department. */
export function DepartmentArt({ department, className }: { department: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const badge = badges[department];
  if (!badge) return null;
  const { shape, tones } = badge;
  return <svg className={className ?? 'department-art'} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <defs><clipPath id={`${id}clip`}><path d={outline[shape]} /></clipPath></defs>
    {/* Thick edge underneath, then the badge, its inset face, the glyph and a diagonal glass sheen */}
    <path d={outline[shape]} fill={tones.edge} transform="translate(0 2.6)" />
    <path d={outline[shape]} fill={tones.base} />
    <path d={face[shape]} fill={tones.face} />
    <path d={face[shape]} fill="none" stroke={tones.light} strokeOpacity=".55" strokeWidth=".8" transform="translate(0 .6)" />
    {badge.glyph(tones.glyph)}
    <g clipPath={`url(#${id}clip)`}>
      <path d="M2 30 30 2h7L9 30Z" fill="#ffffff" fillOpacity=".22" />
      <path d="M12 38 40 10v4L16 38Z" fill="#ffffff" fillOpacity=".14" />
    </g>
  </svg>;
}
