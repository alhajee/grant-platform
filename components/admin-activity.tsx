'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createColumnHelper, type PaginationState, type SortingState } from '@tanstack/react-table';
import { CopyIcon, HistoryIcon, MoreHorizontalIcon } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import type { DataTableFeatures } from '@/components/data-table-features';
import { WriteAttemptsSheet } from '@/components/admin-activity-requests';
import { endReasonLabel, formatDate, formatDuration, formatTime, sessionEnd, statusLabel } from '@/components/admin-activity-format';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FilterDialog } from '@/components/filter-dialog';
import { useSessionState } from '@/components/use-session-state';
import { activityPageSizes, defaultActivityPageSize, type ActivityFacets, type ActivitySession, type ActivitySort, type ActivityStatus, type Paged, type SessionStatus } from '@/lib/admin-activity';
import { stateDisplayName } from '@/lib/state-names';
import './admin-activity.css';

const helper = createColumnHelper<DataTableFeatures, ActivitySession>();
const defaultSorting: SortingState = [{ id: 'started', desc: true }];
const searchDelay = 300;
const statusOptions: Record<ActivityStatus, string> = { all: 'All', active: 'Active', ended: 'Ended', expired: 'Expired' };
type Loaded = { key: string; data: Paged<ActivitySession> & { facets?: ActivityFacets } } | { key: string; error: string };

function StatusBadge({ status }: { status: ActivitySession['status'] }) {
  return <Badge variant={status === 'active' ? 'default' : status === 'ended' ? 'secondary' : 'outline'} className={status === 'expired' ? 'text-muted-foreground' : undefined}>{statusLabel(status)}</Badge>;
}

export function AdminActivity() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: defaultActivityPageSize });
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [statuses, setStatuses] = useSessionState<string[]>('admin-activity:status', []), [admins, setAdmins] = useSessionState<string[]>('admin-activity:admin', []);
  const [search, setSearch] = useSessionState('admin-activity:search', ''), [q, setQ] = useState(() => search.trim());
  const [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState<Loaded | null>(null);
  const [now, setNow] = useState(Date.now);
  const [viewing, setViewing] = useState<ActivitySession | null>(null), [sheetOpen, setSheetOpen] = useState(false);
  const sort = (sorting[0]?.id ?? 'started') as ActivitySort, dir = sorting[0]?.desc === false ? 'asc' : 'desc';
  const query = useMemo(() => new URLSearchParams({ page: String(pagination.pageIndex + 1), pageSize: String(pagination.pageSize), q, status: statuses.join(','), admin: admins.join(','), sort, dir }).toString(), [pagination, q, statuses, admins, sort, dir]);
  const key = `${query}#${attempt}`;

  // Debounce typing, then restart from the first page.
  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const timer = setTimeout(() => { setQ(next); setPagination(current => ({ ...current, pageIndex: 0 })); }, searchDelay);
    return () => clearTimeout(timer);
  }, [search, q]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/activity?${query}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as Paged<ActivitySession> & { facets?: ActivityFacets; error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load impersonation activity.');
      setNow(Date.now());
      // The server clamps a page past the end; follow it so the footer stays truthful.
      if (body.page !== pagination.pageIndex + 1) setPagination(current => ({ ...current, pageIndex: body.page - 1 }));
      else setLoaded({ key, data: body });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : 'Unable to load impersonation activity.' });
    });
    return () => controller.abort();
  }, [key, query, pagination.pageIndex]);

  const current = loaded?.key === key ? loaded : null;
  const lastData = loaded && 'data' in loaded ? loaded.data : null;
  const error = current && 'error' in current ? current.error : '';
  const filtered = Boolean(q || statuses.length || admins.length);
  const facets = lastData?.facets;
  const statusFacet = (Object.keys(statusOptions) as ActivityStatus[]).filter((value): value is SessionStatus => value !== 'all').map(value => ({ value, label: statusOptions[value], count: facets?.statuses[value] }));
  const adminFacet = (facets?.admins ?? []).map(item => ({ value: String(item.id), label: item.name, count: item.count }));
  const setFilter = (set: (values: string[]) => void) => (values: string[]) => { set(values); setPagination(state => ({ ...state, pageIndex: 0 })); };
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const clearFilters = useCallback(() => { setSearch(''); setQ(''); setStatuses([]); setAdmins([]); setPagination(value => ({ ...value, pageIndex: 0 })); }, [setSearch, setStatuses, setAdmins]);
  const view = useCallback((session: ActivitySession) => { setViewing(session); setSheetOpen(true); }, []);
  const copyId = useCallback((id: string) => { void navigator.clipboard.writeText(id).then(() => toast.success('Session ID copied'), () => toast.error('Unable to copy the session ID.')); }, []);

  const columns = useMemo(() => helper.columns([
    helper.accessor('adminName', { id: 'admin', header: ({ column }) => <DataTableColumnHeader column={column} title="Administrator" />, cell: ({ row }) => <div className="min-w-36 whitespace-normal"><p className="font-medium">{row.original.adminName}</p>{row.original.adminEmail && <p className="text-xs text-muted-foreground">{row.original.adminEmail}</p>}</div> }),
    helper.accessor('targetName', { id: 'target', enableHiding: false, header: ({ column }) => <DataTableColumnHeader column={column} title="Acting as" />, cell: ({ row }) => <div className="min-w-44 whitespace-normal"><p className="font-medium">{row.original.targetName}</p><p className="text-xs text-muted-foreground">{row.original.role} · {stateDisplayName(row.original.stateCode)}</p></div> }),
    helper.accessor('startedAt', { id: 'started', header: ({ column }) => <DataTableColumnHeader column={column} title="Started" />, cell: info => <time className="block" dateTime={info.getValue()}>{formatDate(info.getValue())}<span className="block text-xs text-muted-foreground">{formatTime(info.getValue())}</span></time> }),
    helper.display({ id: 'ends', enableSorting: false, header: 'Ended / Expires', cell: ({ row }) => { const item = row.original, value = item.endedAt ?? item.expiresAt; return <time className="block min-w-32 whitespace-normal" dateTime={value}>{formatDate(value)}<span className="block text-xs text-muted-foreground">{formatTime(value)} · {item.status === 'ended' ? endReasonLabel(item.endReason) : item.status === 'active' ? 'Expires' : 'Expired, not ended'}</span></time>; } }),
    helper.display({ id: 'duration', enableSorting: false, header: 'Duration', cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDuration(sessionEnd(row.original, now) - new Date(row.original.startedAt).getTime())}{row.original.status === 'active' && <span className="text-muted-foreground"> so far</span>}</span> }),
    helper.accessor('status', { enableSorting: false, header: 'Status', cell: info => <StatusBadge status={info.getValue()} /> }),
    helper.accessor('requestCount', { id: 'writes', header: ({ column }) => <DataTableColumnHeader column={column} title="Write attempts" align="end" />, cell: info => <p className="text-right tabular-nums">{info.getValue()}</p> }),
    helper.display({ id: 'actions', enableHiding: false, header: '', cell: ({ row }) => <div className="flex justify-end"><DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Manage session acting as ${row.original.targetName}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => view(row.original)}><HistoryIcon />View write attempts</DropdownMenuItem><DropdownMenuItem onSelect={() => copyId(row.original.id)}><CopyIcon />Copy session ID</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div> }),
  ]), [now, view, copyId]);

  const empty = error ? 'Impersonation sessions could not be loaded.' : filtered
    ? <div className="flex flex-col items-center gap-2"><p className="font-medium">No sessions match your filters</p><p className="text-muted-foreground">Try another name, email, role or state.</p><Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button></div>
    : <div className="flex flex-col items-center gap-1"><p className="font-medium">No impersonation sessions yet</p><p className="text-muted-foreground">Sessions appear here when an administrator acts as a user.</p></div>;

  return <div className="admin-activity flex flex-col gap-4">
    <div><h2 className="text-lg font-semibold">Recent impersonation sessions</h2></div>
    {error && <Alert variant="destructive"><AlertTitle>Unable to load activity</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={retry}>Try again</Button></AlertDescription></Alert>}
    <DataTable
      data={error ? [] : lastData?.items ?? []}
      columns={columns}
      searchPlaceholder="Search sessions…"
      itemLabel="sessions"
      columnLabels={{ admin: 'Administrator', started: 'Started', ends: 'Ended / Expires', duration: 'Duration', status: 'Status', writes: 'Write attempts' }}
      empty={empty}
      filters={<FilterDialog inlineChips
        sections={[
          { id: 'status', title: 'Status', options: statusFacet, selected: statuses, onChange: setFilter(setStatuses) },
          ...(adminFacet.length > 0 ? [{ id: 'admin', title: 'Administrator', options: adminFacet, selected: admins, onChange: setFilter(setAdmins) }] : []),
        ]}
        onClearAll={() => { setStatuses([]); setAdmins([]); setPagination(state => ({ ...state, pageIndex: 0 })); }}
        showLabel={`Show ${(lastData?.total ?? 0).toLocaleString()} sessions`} />}
      server={{
        rowCount: error ? 0 : lastData?.total ?? 0,
        pagination, onPaginationChange: setPagination,
        sorting, onSortingChange: value => { setSorting(value.length ? value : defaultSorting); setPagination(state => ({ ...state, pageIndex: 0 })); },
        search, onSearchChange: setSearch,
        loading: !current,
        pageSizes: activityPageSizes,
      }}
    />
    <WriteAttemptsSheet key={viewing?.id ?? 'none'} session={viewing} open={sheetOpen} onOpenChange={setSheetOpen} />
  </div>;
}
