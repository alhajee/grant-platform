'use client';

import { CheckIcon, PencilIcon, SendIcon, Undo2Icon, type LucideIcon } from 'lucide-react';
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
      })}</ul> : <EmptyTrail />}
    </CardContent>
  </Card>;
}

const trailSteps = ['Data Entry', 'Director', 'BEAP Chair', 'Chairman'];

/** Empty state: the review chain a plan will move along, with no steps taken yet. */
function EmptyTrail() {
  const gap = 76, start = 26, y = 26;
  return <figure className="recent-activity-empty">
    <svg viewBox="0 0 280 66" role="img" aria-label="No activity yet">
      <line x1={start} y1={y} x2={start + gap * 3} y2={y} stroke="#2c7a5e" strokeOpacity=".3" strokeWidth="1.5" strokeDasharray="4 5" strokeLinecap="round" />
      {trailSteps.map((step, index) => {
        const x = start + gap * index;
        return <g key={step}>
          <circle cx={x} cy={y} r="13" fill="#fff" stroke="#2c7a5e" strokeOpacity={index === 0 ? .55 : .28} strokeWidth="1.5" strokeDasharray={index === 0 ? undefined : '3 3'} />
          <circle cx={x} cy={y} r="4.5" fill="#2c7a5e" fillOpacity={index === 0 ? .45 : .14} />
          <text x={x} y="60" textAnchor="middle" fontSize="9.5" fill="currentColor" fillOpacity=".7">{step}</text>
        </g>;
      })}
    </svg>
    <figcaption>No activity yet</figcaption>
  </figure>;
}
