'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createColumnHelper, type PaginationState, type SortingState } from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import type { DataTableFeatures } from '@/components/data-table-features';
import { DataTableFacetedFilter } from '@/components/data-table-faceted-filter';
import { DataTableFilterGroup } from '@/components/data-table-filter-group';
import { useSessionState } from '@/components/use-session-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { defaultRegisterPageSize, registerPageSizes, type RegisterFacet, type RegisterPage, type RegisterSchool } from '@/lib/school-register';

export type SchoolRegisterTableProps = { refreshKey: number; onEdit: (school: RegisterSchool) => void };
type Loaded = { key: string; data: RegisterPage } | { key: string; error: string };
const helper = createColumnHelper<DataTableFeatures, RegisterSchool>();
const defaultSorting: SortingState = [{ id: 'name', desc: false }];
const searchDelay = 300, persist = 'school-register';
const options = (facets: RegisterFacet[] = []) => facets.map(item => ({ value: item.value, label: item.value, count: item.count }));
const updated = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

/** The state's schools, paged, searched, sorted and filtered on the server. */
export function SchoolRegisterTable({ refreshKey, onEdit }: SchoolRegisterTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: defaultRegisterPageSize });
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [search, setSearch] = useSessionState(`${persist}:search`, ''), [q, setQ] = useState(() => search.trim());
  const [lgas, setLgas] = useSessionState<string[]>(`${persist}:lga`, []), [levels, setLevels] = useSessionState<string[]>(`${persist}:level`, []);
  const [types, setTypes] = useSessionState<string[]>(`${persist}:type`, []), [locations, setLocations] = useSessionState<string[]>(`${persist}:location`, []);
  const [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState<Loaded | null>(null);
  const sort = sorting[0]?.id ?? 'name', dir = sorting[0]?.desc ? 'desc' : 'asc';
  const query = useMemo(() => new URLSearchParams({ page: String(pagination.pageIndex + 1), pageSize: String(pagination.pageSize), q, lga: lgas.join(','), level: levels.join(','), type: types.join(','), location: locations.join(','), sort, dir }).toString(), [pagination, q, lgas, levels, types, locations, sort, dir]);
  const key = `${query}#${attempt}#${refreshKey}`;

  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const timer = setTimeout(() => { setQ(next); setPagination(current => ({ ...current, pageIndex: 0 })); }, searchDelay);
    return () => clearTimeout(timer);
  }, [search, q]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/schools?${query}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as RegisterPage & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the school register.');
      if (body.page !== pagination.pageIndex + 1) setPagination(current => ({ ...current, pageIndex: body.page - 1 }));
      else setLoaded({ key, data: body });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : 'Unable to load the school register.' }); });
    return () => controller.abort();
  }, [key, query, pagination.pageIndex]);

  const current = loaded?.key === key ? loaded : null;
  const lastData = loaded && 'data' in loaded ? loaded.data : null;
  const error = current && 'error' in current ? current.error : '';
  const facets = lastData?.facets;
  const filtered = Boolean(q || lgas.length || levels.length || types.length || locations.length);
  const setFilter = (set: (values: string[]) => void) => (values: string[]) => { set(values); setPagination(state => ({ ...state, pageIndex: 0 })); };
  const clearFilters = useCallback(() => { setSearch(''); setQ(''); setLgas([]); setLevels([]); setTypes([]); setLocations([]); setPagination(value => ({ ...value, pageIndex: 0 })); }, [setSearch, setLgas, setLevels, setTypes, setLocations]);
  const filters = [
    { title: 'LGA', options: options(facets?.lgas), selected: lgas, set: setLgas },
    { title: 'Level', options: options(facets?.levels), selected: levels, set: setLevels },
    { title: 'Type', options: options(facets?.types), selected: types, set: setTypes },
    { title: 'Location', options: options(facets?.locations), selected: locations, set: setLocations },
  ];

  const columns = useMemo(() => helper.columns([
    helper.accessor('name', { id: 'name', enableHiding: false, header: ({ column }) => <DataTableColumnHeader column={column} title="School" />, cell: ({ row }) => <div className="min-w-56 whitespace-normal"><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.schoolCode ? `Code ${row.original.schoolCode}` : 'No school code'}{row.original.town ? ` · ${row.original.town}` : ''}</p></div> }),
    helper.accessor('lga', { id: 'lga', header: ({ column }) => <DataTableColumnHeader column={column} title="LGA" />, cell: info => <span className="whitespace-nowrap">{info.getValue()}</span> }),
    helper.accessor('level', { id: 'level', header: ({ column }) => <DataTableColumnHeader column={column} title="Level" /> }),
    helper.accessor('category', { id: 'type', enableSorting: false, header: 'Type', cell: info => <Badge variant={info.getValue() === 'Private' ? 'outline' : 'secondary'}>{info.getValue() || '—'}</Badge> }),
    helper.accessor('location', { id: 'location', enableSorting: false, header: 'Location' }),
    helper.accessor(school => school.male + school.female, { id: 'learners', header: ({ column }) => <DataTableColumnHeader column={column} title="Learners" align="end" />, cell: ({ row }) => <div className="text-right tabular-nums"><p>{(row.original.male + row.original.female).toLocaleString()}</p><p className="text-xs text-muted-foreground">{row.original.male.toLocaleString()} M · {row.original.female.toLocaleString()} F</p></div> }),
    helper.display({ id: 'coordinates', enableSorting: false, header: 'Coordinates', cell: ({ row }) => row.original.latitude && row.original.longitude ? <span className="whitespace-nowrap tabular-nums text-xs">{row.original.latitude}, {row.original.longitude}</span> : <span className="text-muted-foreground">—</span> }),
    helper.accessor('updatedAt', { id: 'updated', header: ({ column }) => <DataTableColumnHeader column={column} title="Last updated" />, cell: ({ row }) => row.original.updatedAt ? <div className="whitespace-nowrap"><p>{updated.format(new Date(row.original.updatedAt))}</p>{row.original.updatedBy && <p className="text-xs text-muted-foreground">{row.original.updatedBy}</p>}</div> : <span className="text-muted-foreground">Original list</span> }),
    helper.display({ id: 'actions', enableHiding: false, header: '', cell: ({ row }) => <div className="flex justify-end"><Button variant="ghost" size="sm" aria-label={`Edit ${row.original.name}`} onClick={() => onEdit(row.original)}><PencilIcon data-icon="inline-start" />Edit</Button></div> }),
  ]), [onEdit]);

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
      filters={<DataTableFilterGroup activeCount={filters.filter(item => item.selected.length).length} filterCount={filters.length} onReset={() => { filters.forEach(item => item.set([])); setPagination(state => ({ ...state, pageIndex: 0 })); }}>
        {filters.map(item => <DataTableFacetedFilter key={item.title} title={item.title} options={item.options} selected={item.selected} onChange={setFilter(item.set)} />)}
      </DataTableFilterGroup>}
      server={{
        rowCount: error ? 0 : lastData?.total ?? 0,
        pagination, onPaginationChange: setPagination,
        sorting, onSortingChange: value => { setSorting(value.length ? value : defaultSorting); setPagination(state => ({ ...state, pageIndex: 0 })); },
        search, onSearchChange: setSearch,
        loading: !current,
        pageSizes: registerPageSizes,
      }}
    />
  </div>;
}
