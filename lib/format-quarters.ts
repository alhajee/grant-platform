/** Collapse consecutive quarters without implying coverage of gaps. */
export function formatQuarters(quarters: number[]): string {
  const sorted = [...new Set(quarters)].filter(q => Number.isInteger(q) && q >= 1 && q <= 4).sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i];
    ranges.push(start === end ? `Q${start}` : `Q${start}–Q${end}`);
  }
  return ranges.join(', ');
}
