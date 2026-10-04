'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createColumnHelper, type PaginationState, type SortingState } from '@tanstack/react-table';
import { DownloadIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { SchoolMapDialog } from '@/components/school-map-dialog';
import { SchoolBulkBar, useSchoolActions } from '@/components/school-register-bulk-bar';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import type { DataTableFeatures } from '@/components/data-table-features';
import { FilterDialog } from '@/components/filter-dialog';
import { toast } from 'sonner';
import { useSessionState } from '@/components/use-session-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { defaultRegisterPageSize, registerPageSizes, schoolApiPath, schoolGapLabels, type RegisterFacet, type RegisterPage, type RegisterSchool, type SchoolGap } from '@/lib/school-register';

/** `stateCode`: the state a Super Admin is viewing; state users omit it and get their own state. */
export type SchoolRegisterTableProps = { refreshKey: number; onEdit: (school: RegisterSchool) => void; stateCode?: string };
type Loaded = { key: string; data: RegisterPage } | { key: string; error: string };
const helper = createColumnHelper<DataTableFeatures, RegisterSchool>();
const defaultSorting: SortingState = [{ id: 'name', desc: false }];
const searchDelay = 300;
const options = (facets: RegisterFacet[] = []) => facets.map(item => ({ value: item.value, label: item.value, count: item.count }));
const gapOptions = (facets: RegisterFacet[] = []) => facets.map(item => ({ value: item.value, label: schoolGapLabels[item.value as SchoolGap] ?? item.value, count: item.count }));
// No learners and no class figures means enrolment was never entered, which is not the same as zero learners.
const enrolmentRecorded = (school: RegisterSchool) => school.male + school.female > 0 || Object.keys(school.enrolment ?? {}).length > 0;
const updated = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

/** The state's schools, paged, searched, sorted and filtered on the server. */
export function SchoolRegisterTable({ refreshKey, onEdit, stateCode }: SchoolRegisterTableProps) {
  // Filters are remembered per register, so one state's LGAs never filter another's.
  const persist = stateCode ? `school-register:${stateCode}` : 'school-register';
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: defaultRegisterPageSize });
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [search, setSearch] = useSessionState(`${persist}:search`, ''), [q, setQ] = useState(() => search.trim());
  const [lgas, setLgas] = useSessionState<string[]>(`${persist}:lga`, []), [levels, setLevels] = useSessionState<string[]>(`${persist}:level`, []);
  const [types, setTypes] = useSessionState<string[]>(`${persist}:type`, []), [locations, setLocations] = useSessionState<string[]>(`${persist}:location`, []);
  const [gaps, setGaps] = useSessionState<string[]>(`${persist}:gap`, []), [selectingAll, setSelectingAll] = useState(false);
  const [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState<Loaded | null>(null);
  // Ticked schools stay ticked across pages and filters until cleared or acted on.
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const sort = sorting[0]?.id ?? 'name', dir = sorting[0]?.desc ? 'desc' : 'asc';
  const query = useMemo(() => new URLSearchParams({ page: String(pagination.pageIndex + 1), pageSize: String(pagination.pageSize), q, lga: lgas.join(','), level: levels.join(','), type: types.join(','), location: locations.join(','), gap: gaps.join(','), sort, dir }).toString(), [pagination, q, lgas, levels, types, locations, gaps, sort, dir]);
  const key = `${query}#${attempt}#${refreshKey}`;

  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const timer = setTimeout(() => { setQ(next); setPagination(current => ({ ...current, pageIndex: 0 })); }, searchDelay);
    return () => clearTimeout(timer);
  }, [search, q]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(schoolApiPath(`/api/schools?${query}`, stateCode), { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as RegisterPage & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the school register.');
      if (body.page !== pagination.pageIndex + 1) setPagination(current => ({ ...current, pageIndex: body.page - 1 }));
      else setLoaded({ key, data: body });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : 'Unable to load the school register.' }); });
    return () => controller.abort();
  }, [key, query, pagination.pageIndex, stateCode]);

  const current = loaded?.key === key ? loaded : null;
  const lastData = loaded && 'data' in loaded ? loaded.data : null;
  const error = current && 'error' in current ? current.error : '';
  const facets = lastData?.facets;
  const filtered = Boolean(q || lgas.length || levels.length || types.length || locations.length || gaps.length);
  const setFilter = (set: (values: string[]) => void) => (values: string[]) => { set(values); setPagination(state => ({ ...state, pageIndex: 0 })); };
  const clearFilters = useCallback(() => { setSearch(''); setQ(''); setLgas([]); setLevels([]); setTypes([]); setLocations([]); setGaps([]); setPagination(value => ({ ...value, pageIndex: 0 })); }, [setSearch, setLgas, setLevels, setTypes, setLocations, setGaps]);
  const filters = [
    { title: 'LGA', options: options(facets?.lgas), selected: lgas, set: setLgas },
    { title: 'Level', options: options(facets?.levels), selected: levels, set: setLevels },
    { title: 'Type', options: options(facets?.types), selected: types, set: setTypes },
    { title: 'Location', options: options(facets?.locations), selected: locations, set: setLocations },
    { title: 'Data gaps', options: gapOptions(facets?.gaps), selected: gaps, set: setGaps },
  ];

  const actions = useSchoolActions({ stateCode, onDeleted: result => {
    const kept = new Set(result.kept.map(item => item.id));
    setSelected(current => new Set([...current].filter(id => kept.has(id))));
    setAttempt(value => value + 1);
  } });
  const { exportSchools, confirmDelete, busy } = actions;
  const pageIds = useMemo(() => (lastData?.items ?? []).map(school => school.id), [lastData]);
  const pageTicked = pageIds.filter(id => selected.has(id)).length;
  const toggle = useCallback((ids: number[], on: boolean) => setSelected(current => {
    const next = new Set(current);
    ids.forEach(id => { if (on) next.add(id); else next.delete(id); });
    return next;
  }), []);
  const total = error ? 0 : lastData?.total ?? 0;
  const selectAll = async () => {
    setSelectingAll(true);
    try {
      const params = new URLSearchParams(query); params.set('ids', '1');
      const response = await fetch(schoolApiPath(`/api/schools?${params}`, stateCode), { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as { ids?: number[]; error?: string };
      if (!response.ok || !body.ids) throw Error(body.error || 'The matching schools could not be selected.');
      toggle(body.ids, true);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The matching schools could not be selected.'); }
    finally { setSelectingAll(false); }
  };
  // Offer every matching school once the whole page is ticked and more match than are shown.
  const canSelectAll = pageIds.length > 0 && pageTicked === pageIds.length && total > pageIds.length && selected.size < total;
  const columns = useMemo(() => helper.columns([
    helper.display({ id: 'select', enableHiding: false, enableSorting: false,
      header: () => <Checkbox aria-label="Select all schools on this page" disabled={!pageIds.length} checked={pageIds.length > 0 && pageTicked === pageIds.length ? true : pageTicked ? 'indeterminate' : false} onCheckedChange={value => toggle(pageIds, value === true)} />,
      cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.name}`} checked={selected.has(row.original.id)} onCheckedChange={value => toggle([row.original.id], value === true)} /> }),
    helper.accessor('name', { id: 'name', enableHiding: false, header: ({ column }) => <DataTableColumnHeader column={column} title="School" />, cell: ({ row }) => <div className="min-w-56 whitespace-normal"><p className="font-medium">{row.original.name}</p>{(row.original.town || row.original.schoolCode || row.original.dnemis) && <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{row.original.town && <span>{row.original.town}</span>}{row.original.schoolCode && <Badge variant="outline" className="h-4 px-1.5 font-mono text-[0.65rem] font-normal" title="School code (EMIS/DNEMIS)">{row.original.schoolCode}</Badge>}{row.original.dnemis && <Badge variant="secondary" className="h-4 px-1.5 text-[0.65rem] font-normal" title="Synced from DNEMIS">DNEMIS</Badge>}</p>}</div> }),
    helper.accessor('lga', { id: 'lga', header: ({ column }) => <DataTableColumnHeader column={column} title="LGA" />, cell: ({ row }) => <div className="whitespace-nowrap"><p>{row.original.lga}</p>{row.original.ward && <p className="text-xs text-muted-foreground">{row.original.ward} ward</p>}</div> }),
    helper.accessor('level', { id: 'level', header: ({ column }) => <DataTableColumnHeader column={column} title="Level" /> }),
    helper.accessor('category', { id: 'type', enableSorting: false, header: 'Type', cell: info => info.getValue() ? <Badge variant="outline" className="font-normal">{info.getValue()}</Badge> : <span className="text-muted-foreground">—</span> }),
    helper.accessor('location', { id: 'location', enableSorting: false, header: 'Location' }),
    helper.accessor(school => school.male + school.female, { id: 'learners', header: ({ column }) => <DataTableColumnHeader column={column} title="Learners" align="end" />, cell: ({ row }) => !enrolmentRecorded(row.original) ? <p className="text-right text-xs whitespace-nowrap text-muted-foreground">Not recorded</p> : <div className="text-right tabular-nums"><p>{(row.original.male + row.original.female).toLocaleString()}</p><p className="text-xs text-muted-foreground">{row.original.male.toLocaleString()} M · {row.original.female.toLocaleString()} F</p></div> }),
    helper.display({ id: 'coordinates', enableSorting: false, header: 'Coordinates', cell: ({ row }) => row.original.latitude && row.original.longitude ? <SchoolMapDialog name={row.original.name} lga={row.original.lga} latitude={row.original.latitude} longitude={row.original.longitude} /> : <span className="text-muted-foreground">—</span> }),
    helper.accessor('updatedAt', { id: 'updated', header: ({ column }) => <DataTableColumnHeader column={column} title="Last updated" />, cell: ({ row }) => row.original.updatedAt ? <div className="whitespace-nowrap"><p>{updated.format(new Date(row.original.updatedAt))}</p>{row.original.updatedBy && <p className="text-xs text-muted-foreground">{row.original.updatedBy}</p>}</div> : <span className="text-muted-foreground" title="Not changed since the original school list">—</span> }),
    helper.display({ id: 'actions', enableHiding: false, header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <div className="flex justify-end"><DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground data-[state=open]:bg-muted" aria-label={`Actions for ${row.original.name}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onEdit(row.original)}><PencilIcon />Edit school</DropdownMenuItem>
        <DropdownMenuItem disabled={!!busy} onSelect={() => void exportSchools([row.original.id])}><DownloadIcon />Export</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={!!busy} onSelect={() => confirmDelete([row.original.id], row.original.name)}><Trash2Icon />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu></div> }),
  ]), [onEdit, pageIds, pageTicked, selected, toggle, busy, exportSchools, confirmDelete]);

  const empty = error ? 'The school register could not be loaded.' : filtered
    ? <div className="flex flex-col items-center gap-2"><p className="font-medium">No schools match your filters</p><p className="text-muted-foreground">Try another name, town, LGA or school code.</p><Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button></div>
    : <div className="flex flex-col items-center gap-1"><p className="font-medium">No schools in the register yet</p><p className="text-muted-foreground">Add a school or upload the filled template.</p></div>;

  return <div className="flex flex-col gap-4">
    {error && <Alert variant="destructive"><AlertTitle>Unable to load schools</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Try again</Button></AlertDescription></Alert>}
    <DataTable
      data={error ? [] : lastData?.items ?? []}
      columns={columns}
      searchPlaceholder="Search schools…"
      itemLabel="schools"
      persistKey={persist}
      columnLabels={{ lga: 'LGA', level: 'Level', type: 'Type', location: 'Location', learners: 'Learners', coordinates: 'Coordinates', updated: 'Last updated' }}
      empty={empty}
      onRowClick={onEdit}
      rowSelected={school => selected.has(school.id)}
      stickyHeader
      rowLabel={school => `Edit ${school.name}`}
      filters={<FilterDialog inlineChips
        sections={filters.map(item => ({ id: item.title.toLowerCase().replace(/\s+/g, '-'), title: item.title, options: item.options, selected: item.selected, onChange: setFilter(item.set) }))}
        onClearAll={() => { filters.forEach(item => item.set([])); setPagination(state => ({ ...state, pageIndex: 0 })); }}
        showLabel={`Show ${total.toLocaleString()} ${total === 1 ? 'school' : 'schools'}`} />}
      server={{
        rowCount: error ? 0 : lastData?.total ?? 0,
        pagination, onPaginationChange: setPagination,
        sorting, onSortingChange: value => { setSorting(value.length ? value : defaultSorting); setPagination(state => ({ ...state, pageIndex: 0 })); },
        search, onSearchChange: setSearch,
        loading: !current,
        pageSizes: registerPageSizes,
      }}
    />
    <SchoolBulkBar ids={[...selected]} actions={actions} onClear={() => setSelected(new Set())} selectAll={canSelectAll ? { total, busy: selectingAll, onSelect: () => void selectAll() } : undefined} />
    {actions.dialog}
  </div>;
}
