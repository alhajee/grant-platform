'use client';

import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { formatDateTime, statusLabel } from '@/components/admin-activity-format';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ActivityRequestsPage, ActivitySession } from '@/lib/admin-activity';
import { stateDisplayName } from '@/lib/state-names';

const pageSize = 25;
type Loaded = { key: string; data: ActivityRequestsPage } | { key: string; error: string };

/** Lists one session's logged write attempts, fetched a page at a time when the sheet opens. */
export function WriteAttemptsSheet({ session, open, onOpenChange }: { session: ActivitySession | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState<Loaded | null>(null);
  const id = session?.id;
  const key = `${id}:${page}:${attempt}`;
  useEffect(() => {
    if (!open || !id) return;
    const controller = new AbortController();
    fetch(`/api/admin/activity/requests?${new URLSearchParams({ session: id, page: String(page), pageSize: String(pageSize) })}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json().catch(() => ({})) as ActivityRequestsPage & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load write attempts.');
      setLoaded({ key, data: body });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : 'Unable to load write attempts.' });
    });
    return () => controller.abort();
  }, [open, id, page, key]);

  const current = loaded?.key === key ? loaded : null;
  const data = current && 'data' in current ? current.data : null;
  const error = current && 'error' in current ? current.error : '';
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const first = data?.total ? (data.page - 1) * data.pageSize + 1 : 0, last = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="admin-activity-sheet w-full sm:max-w-xl">
      <SheetHeader className="border-b">
        <SheetTitle>Write attempts</SheetTitle>
        <SheetDescription>{session ? <>{session.adminName} acting as <span className="font-medium text-foreground">{session.targetName}</span> · {session.role} · {stateDisplayName(session.stateCode)}</> : null}</SheetDescription>
        {session && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge variant={session.status === 'active' ? 'default' : session.status === 'ended' ? 'secondary' : 'outline'}>{statusLabel(session.status)}</Badge><span>Started {formatDateTime(session.startedAt)}</span></div>}
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <p className="mb-3 text-sm text-muted-foreground">Every change request made while acting as this user is logged here, whether or not the portal accepted it.</p>
        {error ? <Alert variant="destructive"><AlertTitle>Unable to load write attempts</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Try again</Button></AlertDescription></Alert>
          : <div className="overflow-hidden rounded-md border bg-card"><Table aria-busy={!current || undefined}>
            <TableHeader><TableRow><TableHead className="px-4">Method</TableHead><TableHead className="px-4">Path</TableHead><TableHead className="px-4 text-right">Time</TableHead></TableRow></TableHeader>
            <TableBody>{!data ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell className="px-4 py-3"><Skeleton className="h-5 w-14" /></TableCell><TableCell className="px-4 py-3"><Skeleton className="h-4 w-44" /></TableCell><TableCell className="px-4 py-3"><Skeleton className="ml-auto h-4 w-28" /></TableCell></TableRow>)
              : data.items.length ? data.items.map(item => <TableRow key={item.id}><TableCell className="px-4 py-3"><Badge variant="outline" className="font-mono">{item.method}</Badge></TableCell><TableCell className="admin-activity-path px-4 py-3 font-mono text-xs">{item.path}</TableCell><TableCell className="px-4 py-3 text-right whitespace-nowrap"><time dateTime={item.requestedAt}>{formatDateTime(item.requestedAt)}</time></TableCell></TableRow>)
              : <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No write attempts were logged in this session.</TableCell></TableRow>}</TableBody>
          </Table></div>}
      </div>
      <SheetFooter className="flex-row items-center justify-between border-t">
        <p className="text-sm text-muted-foreground" role="status">{data ? data.total ? `Showing ${first}–${last} of ${data.total}` : '0 write attempts' : 'Loading…'}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm">Page {data?.page ?? page} of {pages}</span>
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!data || data.page <= 1} onClick={() => setPage(data ? data.page - 1 : 1)}><ChevronLeftIcon /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!data || data.page >= pages} onClick={() => setPage(data ? data.page + 1 : 1)}><ChevronRightIcon /></Button>
        </div>
      </SheetFooter>
    </SheetContent>
  </Sheet>;
}
