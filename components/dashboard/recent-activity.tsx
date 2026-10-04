'use client';

import { CheckIcon, PencilIcon, SendIcon, Undo2Icon, type LucideIcon } from 'lucide-react';
import { ReviewTrailArt } from '@/components/empty-art/review-trail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { timeAgo } from '@/lib/notifications';
import { describeActivity, type ActivityKind, type PlanActivity } from '@/lib/plan-activity';

const kindIcon: Record<ActivityKind, LucideIcon> = { sent: SendIcon, changes: Undo2Icon, approved: CheckIcon, edited: PencilIcon };

/** The latest review steps across the state's plans: what happened first, then who and when. Rows open the review. */
export function RecentActivity({ items }: { items: PlanActivity[] }) {
  return <Card className="recent-activity">
    <CardHeader><CardTitle><h2>Recent activity</h2></CardTitle></CardHeader>
    <CardContent>
      {items.length ? <ul>{items.map(item => {
        const message = describeActivity(item), Icon = kindIcon[message.kind];
        return <li key={item.id}><a href={message.href}>
          <span className="activity-icon" data-kind={message.kind} aria-hidden="true"><Icon /></span>
          <span className="activity-copy"><span>{message.text}</span><small>{item.actorName} · {message.plan} · <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time></small></span>
        </a></li>;
      })}</ul> : <ReviewTrailArt className="recent-activity-empty" caption="No activity yet" />}
    </CardContent>
  </Card>;
}
