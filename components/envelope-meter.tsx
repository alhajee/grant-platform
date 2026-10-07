"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import "./envelope-meter.css";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** "12%", or "<1%" for a sliver, so a small amount never reads as nothing. */
function percent(value: number) {
  if (value > 0 && value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

/**
 * How much of a funding envelope is allocated: the envelope and what is left (or over), a bar and the
 * allocated amount with its share. `partner` is another component drawing on the same pool (Infrastructure
 * and TLM): it counts towards the bar and "left". Shared by every component editor so they read the same.
 */
export function EnvelopeMeter({ label, envelope, used, partner, compact = false, className }: {
  label: string;
  envelope: number;
  used: number;
  partner?: { label: string; amount: number };
  compact?: boolean;
  className?: string;
}) {
  const combined = used + (partner?.amount ?? 0);
  const left = Math.round((envelope - combined) * 100) / 100;
  const over = left < 0;
  const share = envelope > 0 ? combined / envelope * 100 : combined > 0 ? 100 : 0;
  return (
    <div className={cn("envelope-meter", className)} data-compact={compact || undefined} data-over={over || undefined}>
      <div className="envelope-meter-head">
        <span>{label}: <strong>{money.format(envelope)}</strong></span>
        <span className="envelope-left" data-empty={left <= 0 || undefined}>{over ? `${money.format(-left)} over` : `${money.format(left)} left`}</span>
      </div>
      <Progress value={Math.min(share, 100)} aria-label={`${label}: ${percent(share)} allocated`} className="envelope-meter-bar" />
      <p className="envelope-meter-foot">{money.format(combined)} allocated ({percent(share)}){partner && partner.amount > 0 ? ` · includes ${money.format(partner.amount)} for ${partner.label}` : ""}</p>
    </div>
  );
}
