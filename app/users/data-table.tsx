'use client';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table';
import { userColumns, type User } from './columns';
export function UsersDataTable({ users, actorId, actorRole, actorDepartments, onEdit, onReset }: {
  users: User[]; actorId: number; actorRole: string; actorDepartments: string[];
  onEdit: (user: User) => void; onReset: (user: User) => void;
}) {
  const columns = useMemo(() => userColumns(actorId, actorRole, actorDepartments, onEdit, onReset), [actorId, actorRole, actorDepartments, onEdit, onReset]);
  return <DataTable data={users} columns={columns} searchPlaceholder="Search users…" itemLabel="users" columnLabels={{role:'Role',department:'Department',status:'Status',planCreation:'Create plans'}} />;
}
