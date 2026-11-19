'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLinkIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileUpload } from '@/components/document-files';
import type { LetterAssetInfo, LetterAssetKind } from '@/lib/letter-assets-db';
import { PanelError, PanelSkeleton, SettingRow, SettingsCard, SettingsPanel } from './settings-primitives';
import { errorOf } from './use-setting';

// Admin > Settings > Approval letter (migration 105): the letterhead and signature on UBEC's approval letter (UBEC268).
// Uploads take effect for letters approved from then on; letters already issued keep theirs.
const url = '/api/admin/letter-assets';
const kinds: { kind: LetterAssetKind; label: string; accept: string; description: string; info: string }[] = [
  { kind: 'letterhead', label: 'Letterhead', accept: '.png,.jpg,.jpeg', description: 'The whole A4 page behind the letter: header, footer and the signatory’s printed name', info: 'A4 portrait, PNG or JPEG, up to 3 MB. Leave the middle of the page empty: the letter’s text is printed there. The signature goes just above the name printed at the bottom left' },
  { kind: 'signature', label: 'Signature', accept: '.png', description: 'The Executive Secretary’s signature, placed above the name on the letterhead', info: 'PNG with a transparent background, up to 3 MB, cropped close to the signature' },
];

export function ApprovalLetterPanel() {
  const [assets, setAssets] = useState<LetterAssetInfo[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState<LetterAssetKind | number | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to load the approval letter images.'));
      setAssets((await response.json() as { assets: LetterAssetInfo[] }).assets);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the approval letter images.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function upload(kind: LetterAssetKind, files: File[]) {
    const file = files[0]; if (!file || busy) return;
    setBusy(kind);
    try {
      const form = new FormData(); form.set('kind', kind); form.set('file', file);
      const response = await fetch(url, { method: 'POST', body: form });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to upload the image.'));
      setAssets((await response.json() as { assets: LetterAssetInfo[] }).assets);
      toast.success(`New ${kind} saved. Letters approved from now on use it`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to upload the image.'); }
    finally { setBusy(null); }
  }
  async function remove(asset: LetterAssetInfo) {
    if (busy) return;
    setBusy(asset.id);
    try {
      const response = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: asset.id }) });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to remove the image.'));
      setAssets((await response.json() as { assets: LetterAssetInfo[] }).assets);
      toast.success('Image removed. Letters already issued keep it');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to remove the image.'); }
    finally { setBusy(null); }
  }

  return <SettingsPanel title="Approval letter" description="The letterhead and signature on UBEC’s approval letter. A new upload is used for letters approved from then on; letters already issued keep theirs"
    action={<Button asChild variant="outline" size="sm"><a href={`${url}?preview=1`} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />Sample letter</a></Button>}>
    {error ? <PanelError title="Approval letter images unavailable" message={error} onRetry={() => void load()} />
      : assets === null ? <PanelSkeleton rows={2} /> : <SettingsCard>
        {kinds.map((item, index) => {
          const uploads = assets.filter(a => a.kind === item.kind), current = uploads.find(a => a.current);
          return <div key={item.kind}>
            {index > 0 && <Separator />}
            <SettingRow label={item.label} description={item.description} info={item.info} wide>
              <div className="flex w-full flex-col gap-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private, same-origin image */}
                  {current ? <img src={`${url}?id=${current.id}`} alt={`${item.label} in use`} className="h-20 max-w-40 rounded border bg-white object-contain p-1" />
                    : <span className="text-sm text-muted-foreground">Built-in {item.kind} (from the client’s samples)</span>}
                  {current && <Badge variant="secondary">In use</Badge>}
                </div>
                <FileUpload id={`letter-${item.kind}`} label={`Upload a new ${item.kind}`} accept={item.accept} compact busy={busy === item.kind} disabled={busy !== null} onFiles={files => upload(item.kind, files)} />
                {uploads.length > 0 && <ul className="flex flex-col gap-1 text-sm">
                  {uploads.map(asset => <li key={asset.id} className="flex items-center gap-2">
                    <a href={`${url}?id=${asset.id}`} target="_blank" rel="noreferrer" className="truncate underline-offset-4 hover:underline">{asset.name}</a>
                    <span className="shrink-0 text-muted-foreground">{new Date(asset.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{asset.createdBy ? ` · ${asset.createdBy}` : ''}</span>
                    {asset.current && <Badge variant="outline">In use</Badge>}
                    <Button type="button" variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Remove ${asset.name}`} disabled={busy !== null} onClick={() => void remove(asset)}><Trash2Icon /></Button>
                  </li>)}
                </ul>}
                {current && <p className="text-xs text-muted-foreground">Removing the one in use brings back the previous upload, or the built-in one</p>}
              </div>
            </SettingRow>
          </div>;
        })}
      </SettingsCard>}
  </SettingsPanel>;
}
