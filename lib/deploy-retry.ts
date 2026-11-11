// Saves during a deploy (bug report 11 November 2026: "Unexpected non-whitespace character after JSON at position 4").
// While Dokploy swaps the app container (migrations, then the new app starts: about 25 s) the proxy has no app to send a
// request to. Since then a small "updating" service answers in its place (deploy/updating, docker-compose.prod.yml): API
// calls get 503 JSON with `X-Beapms-Updating: 1`. Such a request never reached the app, so it is safe to send again; the
// session guard's fetch wrapper waits and retries it until the new app answers. A bare proxy page ("404 page not found",
// "502 Bad Gateway") is never handed to a page as-is: it becomes a JSON error with a plain message.
// Dependency-free so scripts/test-deploy-retry.mjs can import it.

export const updatingHeader = 'x-beapms-updating';
/** How long a request waits for a deploy to finish before giving up. */
export const deployWaitMs = 120_000;
export const updatingMessage = 'The portal is being updated. Please try again in a minute';
export const unreachableMessage = 'The portal could not be reached. Check your connection and try again';

type Reply = { status: number; headers: { get(name: string): string | null } };
const isJson = (reply: Reply) => (reply.headers.get('content-type') ?? '').includes('json');

/**
 * Whether the reply came from the proxy because no app was there to take the request, so the request never reached
 * the app and can be sent again: the updating service's 503, or the proxy's own "404 page not found" (no route yet).
 */
export function notDelivered(reply: Reply): boolean {
  if (reply.headers.get(updatingHeader)) return true;
  return reply.status === 404 && !isJson(reply);
}
/** A proxy or server error page in place of the app's JSON (it may have reached the app, so it is not sent again). */
export const errorPage = (reply: Reply) => reply.status >= 500 && !isJson(reply);
/** Seconds to wait before trying again: the reply's Retry-After (1-10 s), else 3 s. */
export function retryDelayMs(reply: Reply): number {
  const seconds = Number(reply.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds >= 1 ? Math.min(seconds, 10) * 1000 : 3000;
}
