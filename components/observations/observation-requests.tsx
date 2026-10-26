'use client';
import './observations.css';
import { CheckIcon, ClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { observationDepartmentName, type ObservationRequest } from '@/lib/observation-requests';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/**
 * Observation requests before sending to UBEC (row 156), newest first: who asked and when, the Executive Chairman's note,
 * and each department's reply. Used on the SUBEB plan page and the UBEC observations page.
 */
export function ObservationRequests({ requests, limit }: { requests: readonly ObservationRequest[]; limit?: number }) {
  const shown = limit ? requests.slice(0, limit) : requests;
  return <ol className="observation-requests">{shown.map((request, index) => <li key={request.id}>
    <p className="observation-request-head"><strong>{index === 0 ? 'Latest request' : 'Earlier request'}</strong><span>{request.requestedByName} · {date.format(new Date(request.createdAt))}</span></p>
    {request.comment && <blockquote>{request.comment}</blockquote>}
    <ul>{request.departments.map(d => <li key={d.department} data-done={!!d.completedAt || undefined}>
      <span className="observation-dept">{d.completedAt ? <CheckIcon aria-hidden="true" /> : <ClockIcon aria-hidden="true" />}{observationDepartmentName(d.department)}</span>
      {d.completedAt ? <Badge variant="secondary" title={`Sent back by ${d.completedByName} · ${date.format(new Date(d.completedAt))}`}>Sent back {day.format(new Date(d.completedAt))}</Badge> : <Badge variant="warning">Waiting</Badge>}
      {d.note && <p className="observation-note">{d.note}</p>}
    </li>)}</ul>
  </li>)}</ol>;
}
