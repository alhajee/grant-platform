'use client';
import { useEffect } from 'react';

/** The first message for each field, by the field's name (the first part of the issue path). */
export type FieldIssues = Record<string, string>;
export function issuesByField(issues: readonly { path: readonly (string | number)[]; message: string }[]): FieldIssues {
  const out: FieldIssues = {};
  for (const issue of issues) { const key = String(issue.path[0] ?? ''); if (key && !out[key]) out[key] = issue.message; }
  return out;
}

/**
 * UBEC221: shows each validation message under its own field, inside a form whose inputs have ids matching the field
 * names (the activity editor). Each message is placed in the field's container (`[data-slot="field"]`), styled like
 * shadcn's FieldError, and the input is marked aria-invalid. Nothing is rendered for fields that are not on screen.
 */
export function InlineFieldIssues({ issues, scope }: { issues: FieldIssues; /** The id of the form to look in. */ scope: string }) {
  const signature = JSON.stringify(issues);
  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    const added: HTMLElement[] = [], marked: HTMLElement[] = [], flagged: HTMLElement[] = [];
    for (const [name, message] of Object.entries(JSON.parse(signature) as FieldIssues)) {
      const input = root.querySelector<HTMLElement>(`#${CSS.escape(name)}`);
      const field = input?.closest<HTMLElement>('[data-slot="field"]');
      if (!input || !field) continue;
      if (!input.hasAttribute('aria-invalid')) { input.setAttribute('aria-invalid', 'true'); marked.push(input); }
      const note = document.createElement('div');
      note.setAttribute('role', 'alert');
      note.dataset.slot = 'field-error';
      note.dataset.inlineIssue = name;
      note.className = 'text-sm font-normal text-destructive';
      note.textContent = message;
      if (!field.hasAttribute('data-invalid')) { field.setAttribute('data-invalid', 'true'); flagged.push(field); }
      field.appendChild(note);
      added.push(note);
    }
    return () => {
      for (const note of added) note.remove();
      for (const field of flagged) field.removeAttribute('data-invalid');
      for (const input of marked) input.removeAttribute('aria-invalid');
    };
  }, [signature, scope]);
  return null;
}
