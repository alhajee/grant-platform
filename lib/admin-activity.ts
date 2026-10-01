import { z } from 'zod';

// Shared by the admin activity API routes and the Activity tab.
export const activityPageSizes = [10, 25, 50, 100] as const;
export const activityStatuses = ['all', 'active', 'ended', 'expired'] as const;
export const activitySorts = ['started', 'admin', 'target', 'writes'] as const;
export const defaultActivityPageSize = 25;
const maxPage = 1_000_000;
const maxSearchLength = 100;

export type ActivityStatus = typeof activityStatuses[number];
export type ActivitySort = typeof activitySorts[number];
export type SessionStatus = Exclude<ActivityStatus, 'all'>;
export type ActivitySession = {
  id: string; adminName: string; adminEmail: string | null; targetName: string; targetEmail: string | null;
  role: string; stateCode: string; startedAt: string; endedAt: string | null; expiresAt: string;
  endReason: string | null; status: SessionStatus; requestCount: number;
};
export type ActivityRequest = { id: string; method: string; path: string; requestedAt: string };
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
/** Filter options for the Activity tab, counted over all sessions. */
export type ActivityFacets = { admins: { id: number; name: string; count: number }[]; statuses: Record<SessionStatus, number> };
export type ActivityRequestsPage = Paged<ActivityRequest> & { session: Omit<ActivitySession, 'requestCount'> };

const nearestPageSize = (value: number) => activityPageSizes.reduce((best, size) => Math.abs(size - value) < Math.abs(best - value) ? size : best, activityPageSizes[0]);
const present = (value: unknown) => value !== undefined && value !== null && value !== '';
// Out-of-range numbers are clamped instead of rejected so a stale bookmark still loads.
const pageParam = z.preprocess(value => {
  const number = Math.trunc(Number(value));
  return present(value) && Number.isFinite(number) ? Math.min(Math.max(number, 1), maxPage) : 1;
}, z.number().int());
const pageSizeParam = (fallback: number) => z.preprocess(value => {
  const number = Number(value);
  return present(value) && Number.isFinite(number) ? nearestPageSize(number) : fallback;
}, z.number().int());

const sessionStatuses = ['active', 'ended', 'expired'] as const;
const maxAdminFilters = 50;
/** Comma-separated list of the given values; empty or "all" means no filter. */
const listParam = <T extends z.ZodTypeAny>(item: T, max: number) => z.preprocess(value => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text !== 'all' ? [...new Set(text.split(',').map(part => part.trim()).filter(Boolean))] : [];
}, z.array(item).max(max));

export const activityQuerySchema = z.object({
  page: pageParam,
  pageSize: pageSizeParam(defaultActivityPageSize),
  q: z.string().optional().transform(value => (value ?? '').trim().slice(0, maxSearchLength)),
  status: listParam(z.enum(sessionStatuses), sessionStatuses.length),
  admin: listParam(z.coerce.number().int().positive(), maxAdminFilters),
  sort: z.enum(activitySorts).default('started'),
  dir: z.enum(['asc', 'desc']).optional(),
}).transform(query => ({ ...query, dir: query.dir ?? (query.sort === 'started' || query.sort === 'writes' ? 'desc' : 'asc') as 'asc' | 'desc' }));

export const activityRequestsQuerySchema = z.object({
  session: z.string().uuid(),
  page: pageParam,
  pageSize: pageSizeParam(defaultActivityPageSize),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/** Returns the page actually served once the total is known (never past the last page). */
export function clampPage(page: number, pageSize: number, total: number) {
  return Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
}

export const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);
