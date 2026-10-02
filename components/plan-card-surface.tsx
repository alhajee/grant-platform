'use client';

import type { PointerEvent } from 'react';

// Banknote-style guilloché: a hypotrochoid rosette drawn as five nested bands, sitting off the card's
// top-right corner. The seed (the plan year) picks the curve, so neighbouring cards differ slightly.
const OUTER = 7, POINTS = 1400, SIZE = 280, MAX_TILT_DEG = 3.5;
const shapes = [{ r: 2, d: 1.6 }, { r: 3, d: 2.2 }, { r: 4, d: 2.9 }, { r: 5, d: 3.4 }, { r: 6, d: 4.1 }] as const;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function rosette(r: number, d: number, scale: number) {
  const k = OUTER - r, turns = r / gcd(OUTER, r), span = 2 * Math.PI * turns;
  const extent = k + d, unit = (SIZE / 2) * scale / extent;
  let path = '';
  for (let i = 0; i <= POINTS; i++) {
    const t = (i / POINTS) * span;
    const x = SIZE / 2 + unit * (k * Math.cos(t) + d * Math.cos((k / r) * t));
    const y = SIZE / 2 + unit * (k * Math.sin(t) - d * Math.sin((k / r) * t));
    path += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return path;
}

const cache = new Map<number, string[]>();
function rosettePaths(seed: number) {
  const key = ((seed % shapes.length) + shapes.length) % shapes.length;
  if (!cache.has(key)) { const { r, d } = shapes[key]; cache.set(key, [1, 0.9, 0.8, 0.7, 0.6].map((scale, band) => rosette(r, d * (1 - band * 0.05), scale))); }
  return cache.get(key)!;
}

/** The decorative corner pattern; purely visual, so it is hidden from assistive technology. */
export function PlanCardGuilloche({ seed }: { seed: number }) {
  return <svg className="plan-guilloche" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
    {rosettePaths(seed).map((d, index) => <path key={index} d={d} />)}
  </svg>;
}

/** Leans the card a few degrees toward a mouse pointer; CSS applies it only when motion is welcome. */
export const planCardTilt = {
  onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return;
    const card = event.currentTarget, box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5;
    card.style.setProperty('--tilt-x', `${(-y * MAX_TILT_DEG * 2).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(x * MAX_TILT_DEG * 2).toFixed(2)}deg`);
    card.style.setProperty('--shift-x', `${(x * 8).toFixed(1)}px`);
    card.style.setProperty('--shift-y', `${(y * 8).toFixed(1)}px`);
  },
  onPointerLeave(event: PointerEvent<HTMLElement>) {
    for (const name of ['--tilt-x', '--tilt-y', '--shift-x', '--shift-y']) event.currentTarget.style.removeProperty(name);
  },
};
