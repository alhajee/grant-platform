'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckIcon, EraserIcon, PenLineIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import { submissionLetterAccept, submissionLetterHref, submissionLetterLabels, type SubmissionLetter, type SubmissionLetterKind } from '@/lib/submission-letter';

type Letters = { letters: SubmissionLetter[]; missing: string[]; canEdit: boolean };
const errorOf = async (response: Response, fallback: string) => ((await response.json().catch(() => ({}))) as { error?: string }).error || fallback;

/**
 * UBEC132: the Executive Chairman's signature (drawn on screen or uploaded as an image) and cover letter (on the SUBEB's
 * letterhead, uploaded) for the Send to UBEC dialog. Each is saved as soon as it is added, so it survives closing the
 * dialog; `onChange` reports the saved letters (both are needed to send).
 */
export function SubmissionLetterFields({ planId, disabled, onChange }: { planId: number; disabled: boolean; onChange: (letters: SubmissionLetter[]) => void }) {
  const [data, setData] = useState<Letters | null>(null), [busy, setBusy] = useState<SubmissionLetterKind | null>(null), [loadError, setLoadError] = useState('');
  const url = `/api/plans/submission-letter?plan=${planId}`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'The signature and cover letter could not be loaded'));
      const result = await response.json() as Letters;
      setData(result); setLoadError(''); onChange(result.letters);
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'The signature and cover letter could not be loaded'); }
  }, [url, onChange]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save(kind: SubmissionLetterKind, file: Blob, name: string, drawn = false) {
    if (busy) return;
    setBusy(kind);
    try {
      const form = new FormData(); form.set('kind', kind); form.set('file', file, name); if (drawn) form.set('drawn', 'true');
      const response = await fetch(url, { method: 'POST', body: form });
      if (!response.ok) toast.error(await errorOf(response, `The ${submissionLetterLabels[kind].toLowerCase()} could not be saved`));
    } catch { toast.error('You appear to be offline. Nothing was saved.'); }
    finally { setBusy(null); await load(); }
  }
  async function remove(id: string) {
    try {
      const response = await fetch(`${url}&id=${id}`, { method: 'DELETE' });
      if (!response.ok) toast.error(await errorOf(response, 'The file could not be removed'));
    } catch { toast.error('You appear to be offline. The file was not removed.'); }
    finally { await load(); }
  }

  if (loadError) return <p className="text-sm text-destructive" role="alert">{loadError}</p>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Loading the signature and cover letter…</p>;
  const signature = data.letters.find(l => l.kind === 'signature'), letter = data.letters.find(l => l.kind === 'cover_letter');
  const locked = disabled || !data.canEdit;
  return <div className="submission-letter">
    <Field>
      <FieldLabel>Your signature <span className="required-mark" aria-hidden="true">*</span></FieldLabel>
      {signature ? <div className="submission-signature-saved">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, same-origin download */}
        <img src={submissionLetterHref(planId, signature.id)} alt="Your saved signature" />
        <span><CheckIcon aria-hidden="true" />{signature.drawn ? 'Signed on screen' : 'Signature uploaded'}</span>
        <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => void remove(signature.id)}>Sign again</Button>
      </div> : <Tabs defaultValue="draw" className="submission-signature-tabs">
        <TabsList><TabsTrigger value="draw" disabled={locked}><PenLineIcon />Draw</TabsTrigger><TabsTrigger value="upload" disabled={locked}><UploadIcon />Upload image</TabsTrigger></TabsList>
        <TabsContent value="draw"><SignaturePad disabled={locked || !!busy} saving={busy === 'signature'} onSave={blob => void save('signature', blob, 'signature.png', true)} /></TabsContent>
        <TabsContent value="upload"><FileUpload label="Upload your signature (PNG or JPG)" accept={submissionLetterAccept.signature} compact busy={busy === 'signature'} disabled={locked || (!!busy && busy !== 'signature')} onFiles={files => files[0] && void save('signature', files[0], files[0].name)} /></TabsContent>
      </Tabs>}
    </Field>
    <Field>
      <FieldLabel>Cover letter <span className="required-mark" aria-hidden="true">*</span></FieldLabel>
      <FieldDescription>On your SUBEB letterhead, as a PDF, Word document or image</FieldDescription>
      {letter && <DocumentFiles compact documents={[{ id: letter.id, name: letter.name, size: letter.size, url: submissionLetterHref(planId, letter.id) }]} onRemove={locked ? undefined : id => void remove(id)} />}
      {!locked && <FileUpload label={letter ? 'Replace the cover letter' : 'Upload the cover letter'} accept={submissionLetterAccept.cover_letter} compact busy={busy === 'cover_letter'} disabled={!!busy && busy !== 'cover_letter'} onFiles={files => files[0] && void save('cover_letter', files[0], files[0].name)} />}
    </Field>
  </div>;
}

/** A signature drawn with the mouse, a finger or a pen, saved as a PNG on a transparent background. */
function SignaturePad({ disabled, saving, onSave }: { disabled: boolean; saving: boolean; onSave: (png: Blob) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), drawing = useRef(false), [empty, setEmpty] = useState(true);
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    // Sharp lines on high-density screens: the bitmap follows the displayed size × the pixel ratio.
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(el.offsetWidth * ratio); el.height = Math.round(el.offsetHeight * ratio);
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2a44';
  }, []);
  // Pointer position in the canvas's own (unscaled) units, even while the dialog is still animating in.
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const el = event.currentTarget, box = el.getBoundingClientRect(); return { x: (event.clientX - box.left) * el.offsetWidth / box.width, y: (event.clientY - box.top) * el.offsetHeight / box.height }; };
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = event.currentTarget.getContext('2d'); if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true;
    const { x, y } = point(event); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke(); setEmpty(false);
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext('2d'); if (!ctx) return;
    const { x, y } = point(event); ctx.lineTo(x, y); ctx.stroke();
  }
  function clear() { const el = canvas.current; el?.getContext('2d')?.clearRect(0, 0, el.width, el.height); setEmpty(true); }
  return <div className="signature-pad">
    <canvas ref={canvas} aria-label="Draw your signature here" role="img" data-disabled={disabled || undefined} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
    {empty && <span className="signature-pad-hint" aria-hidden="true">Sign here</span>}
    <div className="signature-pad-actions">
      <Button type="button" variant="ghost" size="sm" disabled={disabled || empty} onClick={clear}><EraserIcon data-icon="inline-start" />Clear</Button>
      <Button type="button" size="sm" className="rounded-full" disabled={disabled || empty} onClick={() => canvas.current?.toBlob(blob => blob && onSave(blob), 'image/png')}>{saving ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}Use this signature</Button>
    </div>
  </div>;
}
