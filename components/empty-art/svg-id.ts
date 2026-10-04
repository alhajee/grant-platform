import { useId } from 'react';

/** A unique, url()-safe id for an SVG pattern, so several illustrations can share a page. */
export function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
