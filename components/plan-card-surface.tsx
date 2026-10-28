'use client';

import type { PointerEvent } from 'react';
import states from '@/lib/nigeria-map.json';

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

// The plan's state drawn as nested outlines in the same corner, like the guilloché (client, 28 October 2026). The map's
// paths use one projection, so each state is framed by its own bounding box and kept to its true shape.
const outlines = new Map<string, { d: string; box: string; cx: number; cy: number } | null>();
function stateOutline(code: string) {
  const key = code.trim().toUpperCase().replace(/^NG-/, '').replace(/^FCT$/, 'FC');
  if (!outlines.has(key)) {
    const state = (states as { code: string; d: string }[]).find(s => s.code === key);
    const pairs = [...(state?.d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g) ?? [])];
    if (!state || pairs.length < 3) outlines.set(key, null);
    else {
      const xs = pairs.map(m => Number(m[1])), ys = pairs.map(m => Number(m[2]));
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const side = Math.max(x1 - x0, y1 - y0) * 1.08, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      outlines.set(key, { d: state.d, box: `${(cx - side / 2).toFixed(1)} ${(cy - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`, cx, cy });
    }
  }
  return outlines.get(key)!;
}

/** The state's outline as the card's corner pattern; falls back to the guilloché when the state is unknown. */
export function PlanCardStateShape({ stateCode, seed }: { stateCode?: string | null; seed: number }) {
  const outline = stateCode ? stateOutline(stateCode) : null;
  if (!outline) return <PlanCardGuilloche seed={seed} />;
  return <svg className="plan-guilloche plan-state-shape" viewBox={outline.box} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
    {[1, 0.86, 0.72, 0.58, 0.44].map(scale => <path key={scale} d={outline.d} vectorEffect="non-scaling-stroke" transform={`translate(${outline.cx} ${outline.cy}) scale(${scale}) translate(${-outline.cx} ${-outline.cy})`} />)}
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
