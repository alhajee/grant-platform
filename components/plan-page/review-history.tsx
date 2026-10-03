'use client';
import './review-history.css';

import { useEffect, useState } from 'react';
import { CheckIcon, PencilIcon, SendIcon, Undo2Icon, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { reviewEventAnchor, timeAgo } from '@/lib/notifications';
import { reviewActionLabels, type ReviewAction, type ReviewEvent } from '@/lib/plan-review';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const INITIAL = 6;
const icons: Record<ReviewAction, LucideIcon> = { submit: SendIcon, endorse: SendIcon, forward: SendIcon, request_changes: Undo2Icon, approve: CheckIcon, edit: PencilIcon };
const tone = (action: ReviewAction) => action === 'request_changes' ? 'changes' : action === 'approve' ? 'approved' : action === 'edit' ? 'edited' : 'sent';
const label = (event: ReviewEvent) => event.action === 'approve' && event.actorRole === 'UBEC Executive Secretary' ? 'Approved by UBEC' : reviewActionLabels[event.action];

/**
 * Every review step on the plan as a timeline, newest first and grouped by submission. Each entry is a
 * notification anchor (#review-event-<id>); a link to an older entry shows the full history.
 */
export function ReviewHistory({ events, scopeLabel }: { events: ReviewEvent[]; scopeLabel: (scope: string) => string }) {
  const [showAll, setShowAll] = useState(false);
  // Opening a link to an entry that would be folded away shows everything, so the page can scroll to it.
  useEffect(() => {
    const hidden = new Set(events.slice(INITIAL).map(event => reviewEventAnchor(event.id)));
    const reveal = () => { if (hidden.has(window.location.hash)) setShowAll(true); };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [events]);
  const shown = showAll ? events : events.slice(0, INITIAL);
  const submissions = [...new Set(shown.map(event => event.submissionNumber))];

  return <Card className="review-history" id="review-history">
    <CardHeader><CardTitle><h2>Review history</h2></CardTitle></CardHeader>
    <CardContent>
      {!events.length ? <p className="review-history-empty">No review steps yet.</p> : <>
        {submissions.map(number => <section key={number} className="review-history-group" aria-label={`Submission ${number}`}>
          <h3>Submission {number}</h3>
          <ol>{shown.filter(event => event.submissionNumber === number).map(event => {
            const Icon = icons[event.action];
            return <li key={event.id} id={reviewEventAnchor(event.id).slice(1)} data-tone={tone(event.action)}>
              <span className="review-history-icon" aria-hidden="true"><Icon /></span>
              <div className="review-history-body">
                <p className="review-history-title"><strong>{label(event)}</strong>{event.scope !== 'general' && <Badge variant="secondary">{scopeLabel(event.scope)}</Badge>}</p>
                <p className="review-history-meta">{event.actorName === event.actorRole ? event.actorName : `${event.actorName} · ${event.actorRole}`} · <time dateTime={event.createdAt} title={date.format(new Date(event.createdAt))}>{timeAgo(event.createdAt)}</time></p>
                {event.comment && <blockquote className="review-comment">{event.comment}</blockquote>}
              </div>
            </li>;
          })}</ol>
        </section>)}
        {events.length > INITIAL && <Button type="button" variant="ghost" size="sm" className="review-history-more rounded-full" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : `Show all ${events.length} steps`}</Button>}
      </>}
    </CardContent>
  </Card>;
}
