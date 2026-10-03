'use client';

import { ArrowRightIcon, MessageSquareIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { reviewEventAnchor, timeAgo } from '@/lib/notifications';
import { reviewActionLabels, type ReviewEvent } from '@/lib/plan-review';

const RECENT_STEPS = 2;

export type StatusPanelProps = {
  /** The change request the plan is waiting on, if any. */
  feedback?: ReviewEvent;
  events: ReviewEvent[];
  scopeLabel: (scope: string) => string;
};

const stepLabel = (event: ReviewEvent) => event.action === 'approve' && event.actorRole === 'UBEC Executive Secretary' ? 'Approved by UBEC' : reviewActionLabels[event.action];

/**
 * Beside the funding summary: what the plan is waiting on (the latest change request) and the last few review
 * steps, each linking to its Review history entry. Component stages are on the component cards below.
 */
export function StatusPanel({ feedback, events, scopeLabel }: StatusPanelProps) {
  const recent = events.filter(event => event.id !== feedback?.id).slice(0, RECENT_STEPS);
  return <Card className="plan-status-panel">
    <CardHeader><CardTitle><h2>Where the plan is</h2></CardTitle></CardHeader>
    <CardContent>
      {feedback && <a className="status-feedback" href={reviewEventAnchor(feedback.id)}>
        <span className="status-feedback-title"><MessageSquareIcon aria-hidden="true" />Changes requested · {scopeLabel(feedback.scope)}</span>
        {feedback.comment && <span className="status-feedback-note">{feedback.comment}</span>}
        <small>{feedback.actorName} · <time dateTime={feedback.createdAt}>{timeAgo(feedback.createdAt)}</time></small>
      </a>}
      {recent.length > 0 && <ol className="status-steps" aria-label="Latest review steps">
        {recent.map(event => <li key={event.id}><a href={reviewEventAnchor(event.id)}>
          <span>{stepLabel(event)}{event.scope !== 'general' && <> · {scopeLabel(event.scope)}</>}</span>
          <small>{event.actorName} · <time dateTime={event.createdAt}>{timeAgo(event.createdAt)}</time></small>
        </a></li>)}
      </ol>}
      {!feedback && !recent.length && <p className="status-empty">No review steps yet. Components move from Data Entry to Directors, the BEAP Chair and the Executive Chairman.</p>}
      {events.length > 0 && <a className="status-history-link" href="#review-history">Full review history<ArrowRightIcon aria-hidden="true" /></a>}
    </CardContent>
  </Card>;
}
