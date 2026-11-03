'use client';

import { MailIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentFiles } from '@/components/document-files';
import { submissionLetterHref, type SubmissionLetter } from '@/lib/submission-letter';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

/** UBEC132: the SUBEB Executive Chairman's cover letter and signature sent with this submission (none on earlier rounds). */
export function SubmissionLetterCard({ planId, letters }: { planId: number; letters: readonly SubmissionLetter[] }) {
  const signature = letters.find(l => l.kind === 'signature'), letter = letters.find(l => l.kind === 'cover_letter');
  if (!signature && !letter) return null;
  return <Card className="plan-status-panel submission-letter-card">
    <CardHeader><CardTitle><h2><MailIcon aria-hidden="true" />Cover letter</h2></CardTitle>
      <CardDescription>From the Executive Chairman{signature ? `, signed ${date.format(new Date(signature.createdAt))}` : ''}</CardDescription></CardHeader>
    <CardContent className="submission-letter-card-body">
      {letter && <DocumentFiles compact documents={[{ id: letter.id, name: letter.name, size: letter.size, url: submissionLetterHref(planId, letter.id), description: letter.uploadedByName }]} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- a private, same-origin download */}
      {signature && <figure><img src={submissionLetterHref(planId, signature.id)} alt={`Signature of ${signature.uploadedByName}`} /><figcaption>{signature.uploadedByName}</figcaption></figure>}
    </CardContent>
  </Card>;
}
