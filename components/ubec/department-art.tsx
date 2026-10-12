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
  // Planning, Research & Statistics: rising bars
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
