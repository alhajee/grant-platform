'use client';
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, SparklesIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Page banners: a white card with a tinted grid wash in the corner, a round icon badge, title and description, and an
 * optional grey ×. Tones by use case: info (how something works), success (done), warning (needs attention), danger
 * (blocked or failing), brand (announcements). `Banner` is one banner; `BannerStack` shows several as a stack (the
 * first in front, the rest peeking behind) that fans out on hover or keyboard focus. A banner with a `dismissKey`
 * remembers its × in this browser; without one it returns on the next visit.
 */
const bannerVariants = cva('relative isolate flex items-start gap-3.5 overflow-hidden rounded-2xl border bg-card p-3.5 pr-11 text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/.04),0_8px_24px_-12px_rgb(0_0_0/.12)]', {
  variants: {
    tone: {
      info: '[--banner-accent:#6d4aff]',
      success: '[--banner-accent:#16a34a]',
      warning: '[--banner-accent:#d97706]',
      danger: '[--banner-accent:#e11d48]',
      brand: '[--banner-accent:var(--primary)]',
    },
  },
  defaultVariants: { tone: 'info' },
});
const toneIcons = { info: InfoIcon, success: CircleCheckIcon, warning: CircleAlertIcon, danger: TriangleAlertIcon, brand: SparklesIcon };

type BannerContent = VariantProps<typeof bannerVariants> & {
  /** Replaces the tone's icon. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** The description. */
  children?: React.ReactNode;
  /** A button or link under the text. */
  action?: React.ReactNode;
};
type BannerCardProps = Omit<React.ComponentProps<'div'>, 'title'> & BannerContent & { onDismiss?: () => void };

/** The banner itself; `onDismiss` shows the ×. */
function BannerCard({ tone, icon, title, action, onDismiss, className, children, ...props }: BannerCardProps) {
  const ToneIcon = toneIcons[tone ?? 'info'];
  return <div role="note" data-slot="banner" data-tone={tone ?? 'info'} className={cn(bannerVariants({ tone }), !onDismiss && 'pr-3.5', className)} {...props}>
    {/* Tinted wash with a faint grid, fading out from the top-left corner. */}
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-80 max-w-full" style={{
      backgroundImage: 'linear-gradient(to right, color-mix(in srgb, var(--banner-accent) 30%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--banner-accent) 30%, transparent) 1px, transparent 1px), radial-gradient(120% 110% at 0% 0%, color-mix(in srgb, var(--banner-accent) 24%, transparent), transparent 75%)',
      backgroundSize: '22px 22px, 22px 22px, 100% 100%',
      maskImage: 'radial-gradient(100% 130% at 0% 0%, #000 10%, transparent 80%)',
      WebkitMaskImage: 'radial-gradient(100% 130% at 0% 0%, #000 10%, transparent 80%)',
    }} />
    <span aria-hidden="true" data-slot="banner-icon" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-(--banner-accent) shadow-[0_1px_3px_rgb(0_0_0/.08),0_4px_12px_-4px_rgb(0_0_0/.12)] ring-1 ring-black/5 [&>svg]:size-5">
      {icon ?? <ToneIcon fill="currentColor" stroke="white" strokeWidth={2.25} className="size-6!" />}
    </span>
    <div className="min-w-0 flex-1 self-center">
      <p className="text-sm font-semibold leading-snug">{title}</p>
      {children && <div className="mt-0.5 text-sm leading-snug text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
    {onDismiss && <Button type="button" variant="ghost" size="icon" className="absolute top-2.5 right-2.5 size-7 rounded-full text-muted-foreground hover:text-foreground [&_svg]:size-4" aria-label="Dismiss" onClick={onDismiss}><XIcon /></Button>}
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
        style={open ? { zIndex: shown.length - i } : { gridArea: '1 / 1', zIndex: shown.length - i, transformOrigin: 'top center', transform: `translateY(${-depth * peek}px) scale(${1 - depth * 0.035})`, opacity: i > maxPeeks ? 0 : 1 - depth * 0.15 }}>
        <BannerCard tone={b.tone} icon={b.icon} title={b.title} action={b.action} onDismiss={b.dismissible === false ? undefined : () => close(b)}
          className={cn('h-full', back && '[&>*]:opacity-0')}>{b.children}</BannerCard>
      </div>;
    })}
    {!open && shown.length > 1 && <span className="sr-only">{shown.length} notices. Hover or focus to see them all.</span>}
  </section>;
}

export { Banner, BannerCard, BannerStack, bannerVariants };
