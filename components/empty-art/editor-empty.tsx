import type { ReactNode } from 'react';
import './editor-empty.css';

/** A picture with a short caption, for an editor list that has nothing saved yet. */
export function EditorEmpty({ art, caption }: { art: ReactNode; caption: string }) {
  return <figure className="editor-empty">
    {art}
    <figcaption>{caption}</figcaption>
  </figure>;
}
