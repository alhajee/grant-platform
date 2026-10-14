'use client';
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Solid coloured page banners. Tones by use case: info (how something works), success (done), warning (needs
 * attention), danger (blocked or failing), brand (announcements). `Banner` is one banner; `BannerStack` shows several
 * as a stack (the first in front, the rest peeking behind) that fans out on hover or keyboard focus. A banner with a
 * `dismissKey` remembers its × in this browser; without one it returns on the next visit.
 */
const bannerVariants = cva('relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-sm [&_[data-slot=banner-icon]>svg]:size-4', {
  variants: {
    tone: {
      info: 'bg-sky-700 text-white [--banner-muted:rgb(255_255_255/.82)] [--banner-hover:rgb(255_255_255/.16)]',
      success: 'bg-emerald-700 text-white [--banner-muted:rgb(255_255_255/.82)] [--banner-hover:rgb(255_255_255/.16)]',
      warning: 'bg-amber-400 text-amber-950 [--banner-muted:rgb(69_26_3/.78)] [--banner-hover:rgb(69_26_3/.1)]',
      danger: 'bg-rose-600 text-white [--banner-muted:rgb(255_255_255/.85)] [--banner-hover:rgb(255_255_255/.16)]',
      brand: 'bg-primary text-primary-foreground [--banner-muted:color-mix(in_srgb,var(--primary-foreground)_80%,transparent)] [--banner-hover:color-mix(in_srgb,var(--primary-foreground)_14%,transparent)]',
    },
  },
  defaultVariants: { tone: 'info' },
});

type BannerContent = VariantProps<typeof bannerVariants> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** The description. */
  children?: React.ReactNode;
  /** A button or link after the text. */
  action?: React.ReactNode;
};
type BannerCardProps = Omit<React.ComponentProps<'div'>, 'title'> & BannerContent & { onDismiss?: () => void };

/** The banner itself; `onDismiss` shows the small ×. */
function BannerCard({ tone, icon, title, action, onDismiss, className, children, ...props }: BannerCardProps) {
  return <div role="note" data-slot="banner" data-tone={tone ?? 'info'} className={cn(bannerVariants({ tone }), className)} {...props}>
    {icon && <span aria-hidden="true" data-slot="banner-icon" className="flex shrink-0 self-start pt-0.5 sm:self-center sm:pt-0">{icon}</span>}
    <p className="min-w-0 flex-1 leading-snug">
      <span className="font-semibold">{title}</span>
      {children && <span className="text-(--banner-muted)"><span aria-hidden="true" className="mx-2 hidden opacity-60 sm:inline">·</span><span className="block sm:inline">{children}</span></span>}
    </p>
    {action && <span className="shrink-0">{action}</span>}
    {onDismiss && <Button type="button" variant="ghost" size="icon" className="-mr-1.5 size-6 shrink-0 self-start rounded-full text-current hover:bg-(--banner-hover) hover:text-current sm:self-center [&_svg]:size-3.5" aria-label="Dismiss" onClick={onDismiss}><XIcon /></Button>}
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

const peek = 9; // px each banner behind shows above the one in front
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
    className={cn('grid transition-[padding] duration-300 ease-out motion-reduce:transition-none', open && 'gap-2', className)}
    style={{ paddingTop: open ? 0 : behind * peek }}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    {shown.map((b, i) => {
      const back = !open && i > 0;
      return <div key={b.id} inert={back || undefined} aria-hidden={back || undefined}
        className="transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={open ? { zIndex: shown.length - i } : { gridArea: '1 / 1', zIndex: shown.length - i, transformOrigin: 'top center', transform: `translateY(${-Math.min(i, maxPeeks) * peek}px) scale(${1 - Math.min(i, maxPeeks) * 0.04})`, opacity: i > maxPeeks ? 0 : 1 }}>
        <BannerCard tone={b.tone} icon={b.icon} title={b.title} action={b.action} onDismiss={b.dismissible === false ? undefined : () => close(b)}
          className={cn(back && 'shadow-md [&>*]:opacity-0')}>{b.children}</BannerCard>
      </div>;
    })}
    {!open && shown.length > 1 && <span className="sr-only">{shown.length} notices. Hover or focus to see them all.</span>}
  </section>;
}

export { Banner, BannerCard, BannerStack, bannerVariants };
