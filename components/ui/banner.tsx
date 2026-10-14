'use client';
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BrandArt, DangerArt, InfoArt, SuccessArt, WarningArt } from './banner-art';

/**
 * Page banners: a flat colour card (editorial palette) with the text on the left and an illustration bleeding off the
 * bottom right, plus an optional ×. Tones by use case: info (how something works), success (done), warning (needs
 * attention), danger (blocked or failing), brand (announcements), plain (white). `Banner` is one banner; `BannerStack`
 * shows several as a stack (the first in front, the rest peeking behind) that fans out on hover or keyboard focus. A
 * banner with a `dismissKey` remembers its × in this browser; without one it returns on the next visit.
 */
const bannerVariants = cva('relative isolate flex min-h-24 items-stretch overflow-hidden rounded-2xl shadow-[0_1px_2px_rgb(0_0_0/.05),0_10px_28px_-14px_rgb(0_0_0/.25)]', {
  variants: {
    tone: {
      info: 'bg-[#efe8dc] text-[#2a2620] [--banner-muted:#5e574c]',
      success: 'bg-[#dcebd5] text-[#1f2e1c] [--banner-muted:#4a5c45]',
      warning: 'bg-[#f7edbd] text-[#2e2810] [--banner-muted:#5f5530] [background-image:radial-gradient(rgb(94_80_20/.12)_1px,transparent_1.2px)] [background-size:14px_14px]',
      danger: 'bg-[#f6e0e2] text-[#33191d] [--banner-muted:#6b4a50]',
      brand: 'bg-[#f3f0e6] text-[#24302b] [--banner-muted:#55605a] [background-image:radial-gradient(rgb(0_0_0/.05)_1px,transparent_1.2px)] [background-size:7px_7px]',
      plain: 'border bg-white text-[#1d1d1f] [--banner-muted:#5f5f64]',
    },
  },
  defaultVariants: { tone: 'info' },
});
type Tone = NonNullable<VariantProps<typeof bannerVariants>['tone']>;
const toneArt: Record<Tone, () => React.ReactElement> = { info: InfoArt, success: SuccessArt, warning: WarningArt, danger: DangerArt, brand: BrandArt, plain: InfoArt };

type BannerContent = VariantProps<typeof bannerVariants> & {
  /** Illustration on the right; defaults to the tone's (components/ui/banner-art.tsx). */
  art?: React.ReactNode;
  title: React.ReactNode;
  /** The description. */
  children?: React.ReactNode;
  /** A button or link under the text (a dark pill reads best). */
  action?: React.ReactNode;
};
type BannerCardProps = Omit<React.ComponentProps<'div'>, 'title'> & BannerContent & { onDismiss?: () => void };

/** The banner itself; `onDismiss` shows the ×. */
function BannerCard({ tone, art, title, action, onDismiss, className, children, ...props }: BannerCardProps) {
  const ToneArt = toneArt[tone ?? 'info'];
  return <div role="note" data-slot="banner" data-tone={tone ?? 'info'} className={cn(bannerVariants({ tone }), className)} {...props}>
    <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center py-4 pr-2 pl-5">
      <p className="text-base font-bold leading-tight tracking-tight">{title}</p>
      {children && <div className="mt-1 text-sm leading-snug text-(--banner-muted)">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
    <div aria-hidden="true" data-slot="banner-art" className={cn('relative -mb-1 hidden w-40 shrink-0 self-end sm:block', onDismiss && 'mr-10')} style={{ height: 100 }}>
      {art ?? <ToneArt />}
    </div>
    {onDismiss && <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 z-20 size-7 rounded-full bg-white/70 text-[#1d1d1f] shadow-xs backdrop-blur hover:bg-white [&_svg]:size-3.5" aria-label="Dismiss" onClick={onDismiss}><XIcon /></Button>}
  </div>;
}

const remembered = (key?: string) => { if (!key) return false; try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const remember = (key?: string) => { if (key) try { localStorage.setItem(key, '1'); } catch { /* shows again next visit */ } };

type BannerProps = Omit<BannerCardProps, 'onDismiss'> & {
  /** Shows the × button. */
  dismissible?: boolean;
  /** localStorage key that remembers the dismissal in this browser. */
  dismissKey?: string;
  onDismiss?: () => void;
};

/** One banner, optionally dismissible. */
function Banner({ dismissible = false, dismissKey, onDismiss, ...props }: BannerProps) {
  const [hidden, setHidden] = React.useState(() => remembered(dismissKey));
  if (hidden) return null;
  return <BannerCard {...props} onDismiss={dismissible ? () => { setHidden(true); remember(dismissKey); onDismiss?.(); } : undefined} />;
}

export type StackedBanner = BannerContent & { id: string; dismissible?: boolean; dismissKey?: string };

const peek = 10; // px each banner behind shows above the one in front
const maxPeeks = 2;

/** Several banners as a stack; hover or focus fans them out, and closing the front one brings the next forward. */
function BannerStack({ banners, className, label = 'Notices' }: { banners: readonly StackedBanner[]; className?: string; label?: string }) {
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(() => new Set(banners.filter(b => remembered(b.dismissKey)).map(b => b.id)));
  const [open, setOpen] = React.useState(false);
  const shown = banners.filter(b => !closed.has(b.id));
  if (!shown.length) return null;
  const close = (b: StackedBanner) => { remember(b.dismissKey); setClosed(prev => new Set([...prev, b.id])); };
  const behind = Math.min(shown.length - 1, maxPeeks);
  return <section aria-label={label} data-slot="banner-stack" data-open={open || undefined}
    className={cn('grid transition-[padding] duration-300 ease-out motion-reduce:transition-none', open && 'gap-2.5', className)}
    style={{ paddingTop: open ? 0 : behind * peek }}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    {shown.map((b, i) => {
      const back = !open && i > 0, depth = Math.min(i, maxPeeks);
      return <div key={b.id} inert={back || undefined} aria-hidden={back || undefined}
        className="transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={open ? { zIndex: shown.length - i } : { gridArea: '1 / 1', zIndex: shown.length - i, transformOrigin: 'top center', transform: `translateY(${-depth * peek}px) scale(${1 - depth * 0.035})`, opacity: i > maxPeeks ? 0 : 1 - depth * 0.12 }}>
        <BannerCard tone={b.tone} art={b.art} title={b.title} action={b.action} onDismiss={b.dismissible === false ? undefined : () => close(b)}
          className={cn('h-full', back && '[&>*]:opacity-0')}>{b.children}</BannerCard>
      </div>;
    })}
    {!open && shown.length > 1 && <span className="sr-only">{shown.length} notices. Hover or focus to see them all.</span>}
  </section>;
}

export { Banner, BannerCard, BannerStack, bannerVariants };
