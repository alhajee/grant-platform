import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { reviewEventAnchor } from '@/lib/notifications';
import { reviewActionLabels, type ReviewEvent } from '@/lib/plan-review';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Every review step on the plan, newest first. Each entry is a notification anchor (#review-event-<id>). */
export function ReviewHistory({ events, scopeLabel }: { events: ReviewEvent[]; scopeLabel: (scope: string) => string }) {
  return <Card className="review-history">
    <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
    <CardContent>
      {!events.length ? <p>No submissions yet.</p> : <ol>{events.map(event => <li key={event.id} id={reviewEventAnchor(event.id).slice(1)}>
        <strong>{event.action === 'approve' && event.actorRole === 'UBEC Executive Secretary' ? 'Approved by UBEC' : reviewActionLabels[event.action]}</strong>
        <span>Submission {event.submissionNumber} · {event.actorName}</span>
        <span>{event.actorRole} · {date.format(new Date(event.createdAt))}</span>
        {event.scope !== 'general' && <span>{scopeLabel(event.scope)}</span>}
        {event.comment && <p className="review-comment">{event.comment}</p>}
      </li>)}</ol>}
    </CardContent>
  </Card>;
}
