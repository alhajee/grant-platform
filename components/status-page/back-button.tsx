'use client';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Back to the previous page; the dashboard link beside it covers a page opened directly. */
export function BackButton() {
  return <Button type="button" variant="outline" className="rounded-full" onClick={() => window.history.back()}><ArrowLeftIcon data-icon="inline-start" />Go back</Button>;
}
