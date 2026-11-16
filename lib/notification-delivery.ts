import type { QueryResult, QueryResultRow } from 'pg';
import { describeNotification, notificationText, type NotificationItem } from './notifications';
import { brandedEmailHtml, brandedEmailText, type BrandedEmail } from './email-layout';
import { sendMail } from './mailer';
import { readPushKeys } from './push-keys';

/**
 * UBEC260: every new bell notification also goes out as a web push to the devices where the person turned alerts on,
 * and the SUBEB's "changes requested" (UBEC rejections included) and approvals also go out as email. The worker
 * (worker/dnemis-worker.ts) calls `deliverNotifications` on every pass; each notification is claimed once
 * (`delivered_at`, migration 102), so alerts are never sent twice. Ones older than a day are skipped (worker was down).
 */
type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
type Pending = NotificationItem & { userId: number; email: string; fullName: string; fresh: boolean };
export type DeliveryResult = { claimed: number; pushed: number; emailed: number; skipped: number };

const batchSize = 100;
/** Kinds worth an email: the SUBEB must act (changes requested) or hears the outcome (approved). */
const emailKinds = new Set(['changes', 'approved']);

export function appUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.APP_URL?.trim().replace(/\/+$/, '');
  return configured || (env.NODE_ENV === 'production' ? null : 'http://localhost:5173');
}

/** What a push shows: the plan as title, "who did what" as body, and where a click leads. */
export function pushPayload(item: NotificationItem) {
  const message = describeNotification(item);
  return { title: message.context, body: notificationText(item), url: message.href, tag: `beapms-${item.id}` };
}

/** The email for a state notification that asks for action or reports an approval. */
export function notificationEmail(item: NotificationItem, name: string, baseUrl: string): { subject: string; html: string; text: string } {
  const message = describeNotification(item), approved = message.kind === 'approved';
  const what = [message.verb, message.target, message.suffix].filter(Boolean).join(' ');
  const email: BrandedEmail = {
    baseUrl,
    preheader: `${message.actor}: ${what}`,
    heading: approved ? 'Plan approved' : 'Changes requested',
    greeting: `Hello ${name},`,
    paragraphs: [
      `${message.actor} ${what.charAt(0).toLowerCase()}${what.slice(1)} on ${message.context}.`,
      ...(item.comment ? [`Their note: “${item.comment.slice(0, 1500)}”`] : []),
      approved ? 'No action is needed from you.' : 'Open the plan to see what needs correcting, then send it on again.',
    ],
    button: { label: 'Open the plan', href: `${baseUrl}${message.href}` },
    notes: ['You get this email because you hold this plan’s work in BEAPMS. You also see it under the bell in the portal.'],
  };
  return { subject: `${approved ? 'Approved' : 'Changes requested'}: ${message.context}`, html: brandedEmailHtml(email), text: brandedEmailText(email) };
}

async function claim(db: Db): Promise<Pending[]> {
  return (await db.query<Pending>(`WITH claimed AS (
      UPDATE plan_notifications SET delivered_at = NOW() WHERE id IN (
        SELECT id FROM plan_notifications WHERE delivered_at IS NULL ORDER BY id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      RETURNING *)
    SELECT n.id, n.plan_id AS "planId", n.event_id AS "eventId", CASE WHEN n.ubec_event_id IS NULL THEN 'state' ELSE 'ubec' END AS source,
      COALESCE(e.action, u.action) AS action, COALESCE(e.scope, u.pillar) AS scope, COALESCE(e.actor_name, u.actor) AS "actorName", COALESCE(e.actor_role, actor.role, '') AS "actorRole",
      COALESCE(e.comment, u.comment, '') AS comment, p.state_code AS "stateCode", p.start_year AS "startYear", p.end_year AS "endYear",
      p.funding_quarters AS "fundingQuarters", n.created_at AS "createdAt", n.read_at AS "readAt",
      n.user_id AS "userId", r.email, r.full_name AS "fullName", (r.active AND r.deleted_at IS NULL AND n.created_at > NOW() - interval '1 day') AS fresh
    FROM claimed n JOIN action_plans p ON p.id = n.plan_id JOIN users r ON r.id = n.user_id
    LEFT JOIN plan_review_events e ON e.id = n.event_id
    LEFT JOIN ubec_events u ON u.id = n.ubec_event_id LEFT JOIN users actor ON actor.id = u.actor_id
    ORDER BY n.id`)).rows;
}

async function push(db: Db, items: readonly Pending[]): Promise<number> {
  const subscriptions = (await db.query<{ id: number; user_id: number; endpoint: string; p256dh: string; auth: string }>('SELECT id,user_id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id = ANY($1::int[])', [[...new Set(items.map(i => i.userId))]])).rows;
  if (!subscriptions.length) return 0;
  const [{ default: webpush }, keys] = await Promise.all([import('web-push'), readPushKeys(db)]);
  const subject = appUrl()?.startsWith('https://') ? appUrl()! : 'mailto:no-reply@ubec.gov.ng';
  let sent = 0;
  for (const item of items) {
    for (const s of subscriptions.filter(x => x.user_id === item.userId)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(pushPayload(item)), { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600, timeout: 10_000 });
        sent += 1;
        await db.query('UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1', [s.id]);
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        // The browser dropped the subscription (alerts turned off, app removed): forget it.
        if (status === 404 || status === 410) await db.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
        else console.warn(`Push not delivered (notification ${item.id}, status ${status ?? 'network'})`);
      }
    }
  }
  return sent;
}

async function email(items: readonly Pending[]): Promise<number> {
  const baseUrl = appUrl();
  if (!baseUrl) return 0;
  let sent = 0;
  for (const item of items) {
    if (item.source !== 'state' || !emailKinds.has(describeNotification(item).kind) || !item.email || item.email.startsWith('deleted+')) continue;
    const message = notificationEmail(item, item.fullName, baseUrl);
    if ((await sendMail({ to: item.email, ...message })).sent) sent += 1;
  }
  return sent;
}

/** One delivery pass: claim up to a batch of new notifications and send their pushes and emails. */
export async function deliverNotifications(db: Db): Promise<DeliveryResult> {
  const claimed = await claim(db);
  const fresh = claimed.filter(item => item.fresh);
  if (!fresh.length) return { claimed: claimed.length, pushed: 0, emailed: 0, skipped: claimed.length };
  const [pushed, emailed] = await Promise.all([push(db, fresh), email(fresh)]);
  return { claimed: claimed.length, pushed, emailed, skipped: claimed.length - fresh.length };
}
