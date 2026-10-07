'use client';
import './review-history.css';

import { useEffect, useMemo, useState } from 'react';
import { CornerUpLeftIcon, CrownIcon, EllipsisIcon, FilePenLineIcon, SendHorizontalIcon, ShieldCheckIcon, UserCheckIcon, type LucideIcon } from 'lucide-react';
import { ReviewTrailArt } from '@/components/empty-art/review-trail';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { reviewEventAnchor, timeAgo } from '@/lib/notifications';
import { reviewActionLabels, type ReviewAction, type ReviewEvent } from '@/lib/plan-review';

const stamp = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const full = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
// One glyph per step: sent by Data Entry, endorsed by a Director, forwarded by the BEAP Chair, and so on.
const icons: Record<ReviewAction, LucideIcon> = { submit: SendHorizontalIcon, endorse: UserCheckIcon, forward: CrownIcon, request_changes: CornerUpLeftIcon, approve: ShieldCheckIcon, edit: FilePenLineIcon };
const tone = (action: ReviewAction) => action === 'request_changes' ? 'changes' : action === 'approve' ? 'approved' : action === 'edit' ? 'edited' : action === 'forward' ? 'forwarded' : 'sent';
const label = (event: ReviewEvent) => event.action === 'approve' && event.actorRole.startsWith('UBEC ') ? 'Approved by UBEC' : reviewActionLabels[event.action];
const initials = (name: string) => name.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).slice(0, 2).map(word => word[0]).join('').toUpperCase();

/** Consecutive steps of the same kind by the same person fold into one entry ("Show N similar steps"). */
type Run = { lead: ReviewEvent; rest: ReviewEvent[] };
function runs(events: ReviewEvent[]): Run[] {
  return events.reduce<Run[]>((list, event) => {
    const last = list.at(-1);
    const similar = last && !event.comment && !last.lead.comment && last.lead.action === event.action && last.lead.actorName === event.actorName;
    return similar ? [...list.slice(0, -1), { ...last, rest: [...last.rest, event] }] : [...list, { lead: event, rest: [] }];
  }, []);
}

function Entry({ event, latest = false, scopeLabel }: { event: ReviewEvent; latest?: boolean; scopeLabel: (scope: string) => string }) {
  const Icon = icons[event.action];
  return <li id={reviewEventAnchor(event.id).slice(1)} data-tone={tone(event.action)} data-latest={latest || undefined} className="trail-entry">
    <span className="trail-dot" aria-hidden="true"><Icon /></span>
    <div className="trail-body">
      <p className="trail-time"><time dateTime={event.createdAt} title={full.format(new Date(event.createdAt))}>{stamp.format(new Date(event.createdAt))}</time><span className="trail-ago">{timeAgo(event.createdAt)}</span></p>
      <p className="trail-title">{label(event)}{event.scope !== 'general' && <span className="trail-scope">{scopeLabel(event.scope)}</span>}</p>
      <p className="trail-actor"><Avatar className="trail-avatar"><AvatarFallback>{initials(event.actorName) || '·'}</AvatarFallback></Avatar>{event.actorName}{event.actorName !== event.actorRole && <><span aria-hidden="true">·</span><span className="trail-role">{event.actorRole}</span></>}<span className="trail-submission">Submission {event.submissionNumber}</span></p>
      {event.comment && <blockquote className="review-comment">{event.comment}</blockquote>}
    </div>
  </li>;
}

/**
 * Every review step on the plan as an activity trail, newest first: coloured step icons on one line, the time,
 * the step, who did it, and notes as quotes. Runs of similar steps fold away. Each entry is a notification
 * anchor (#review-event-<id>); opening one that is folded expands its run.
 */
export function ReviewHistory({ events, scopeLabel }: { events: ReviewEvent[]; scopeLabel: (scope: string) => string }) {
  const grouped = useMemo(() => runs(events), [events]);
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const reveal = () => {
      const run = grouped.find(item => item.rest.some(event => reviewEventAnchor(event.id) === window.location.hash));
      if (run) setOpen(current => new Set([...current, run.lead.id]));
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [grouped]);

  return <Card className="review-history" id="review-history">
    <CardHeader><CardTitle><h2>Review history</h2></CardTitle></CardHeader>
    <CardContent>
      {!events.length ? <ReviewTrailArt className="empty-art-trail" caption="No review steps yet" /> : <ol className="trail">
        {grouped.flatMap((run, index) => {
          const expanded = open.has(run.lead.id);
          return [
            <Entry key={run.lead.id} event={run.lead} latest={index === 0} scopeLabel={scopeLabel} />,
            ...(expanded ? run.rest.map(event => <Entry key={event.id} event={event} scopeLabel={scopeLabel} />) : []),
            ...(run.rest.length && !expanded ? [<li key={`more-${run.lead.id}`} className="trail-more"><button type="button" onClick={() => setOpen(current => new Set([...current, run.lead.id]))}><span aria-hidden="true"><EllipsisIcon /></span>Show {run.rest.length} similar {run.rest.length === 1 ? 'step' : 'steps'}</button></li>] : []),
          ];
        })}
      </ol>}
    </CardContent>
  </Card>;
}
