'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontalIcon, PencilIcon, KeyRoundIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { departments as ubecDepartments } from '@/lib/ubec';
import { subebDepartments } from '@/lib/subeb-departments';
const departments = [...subebDepartments,...ubecDepartments];
import { canManageRole } from '@/lib/subeb-access';
import { DataTableColumnHeader as SortHeader } from '@/components/data-table-column-header';
import type { DataTableFeatures } from '@/components/data-table-features';
import { departmentsContain } from '@/lib/user-departments';

export type User = { id: number; name: string; email: string; role: string; department: string | null; departments: string[]; active: boolean; canCreatePlan: boolean; isBeapChair: boolean };
const helper = createColumnHelper<DataTableFeatures, User>();
export const departmentLabel = (user: User) => {
  if (user.role === 'Executive Chairman') return 'Whole state';
  const assigned = user.departments ?? (user.department ? [user.department] : []);
  return assigned.length === subebDepartments.length ? 'All departments' : assigned.map(value => departments.find(d => d.id === value)?.name ?? value).join(', ');
};

export function userColumns(actorId: number, actorRole: string, actorDepartments: string[], onEdit: (user: User) => void, onReset: (user: User) => void) {
  return helper.columns([
    helper.accessor('name', {
      header: ({ column }) => <SortHeader column={column} title="User" />,
      sortFn: 'text',
      enableHiding: false,
      filterFn: (row, _id, value: string) => [row.original.name, row.original.email, row.original.role, departmentLabel(row.original)].join(' ').toLowerCase().includes(value.trim().toLowerCase()),
      cell: ({ row }) => {
        const user = row.original;
        const parts = user.name.trim().split(/\s+/);
        const initials = [parts[0]?.[0], parts.length > 1 ? parts.at(-1)?.[0] : ''].join('').toUpperCase();
        return <div className="flex items-center gap-3 py-1">
          <Avatar aria-hidden="true"><AvatarFallback>{initials}</AvatarFallback></Avatar>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2"><span className="font-medium">{user.name}</span>{user.id === actorId && <Badge variant="secondary">You</Badge>}</div>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>;
      },
    }),
    helper.accessor('role', {
      header: ({ column }) => <SortHeader column={column} title="Role" />,
      sortFn: 'text',
      cell: ({ row }) => <div className="flex flex-wrap items-center gap-2">{row.original.role}{row.original.isBeapChair && <Badge variant="secondary">BEAP Chair</Badge>}</div>,
    }),
    helper.accessor(departmentLabel, {
      id: 'department',
      header: ({ column }) => <SortHeader column={column} title="Department" />,
      sortFn: 'text',
      cell: ({ getValue }) => getValue() || <span aria-label="Not assigned" className="text-muted-foreground">—</span>,
    }),
    helper.accessor(user => user.role === 'Executive Chairman' || (user.role === 'Director' && user.isBeapChair) || user.canCreatePlan ? 'Allowed' : '—', {
      id: 'planCreation',
      header: ({ column }) => <SortHeader column={column} title="Create plans" />,
      sortFn: 'text',
    }),
    helper.accessor(user => user.active ? 'Active' : 'Inactive', {
      id: 'status',
      header: ({ column }) => <SortHeader column={column} title="Status" />,
      sortFn: 'text',
      cell: ({ getValue }) => <Badge variant={getValue() === 'Active' ? 'secondary' : 'outline'}>{getValue()}</Badge>,
    }),
    helper.display({
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const user = row.original;
        return <div className="flex justify-end">
          {user.id !== actorId && canManageRole(actorRole, user.role) && (actorRole !== 'Director' || departmentsContain(actorDepartments, user.departments)) ?
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onEdit(user)}><PencilIcon />Edit user</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onReset(user)}><KeyRoundIcon />Reset password</DropdownMenuItem>
              </DropdownMenuGroup></DropdownMenuContent>
            </DropdownMenu> :
            <span className="flex size-8 items-center justify-center text-muted-foreground" aria-label="No available actions">—</span>}
        </div>;
      },
    }),
  ]);
}
