"use client";
import "./notifications.css";
import { Fragment, useState, type ReactNode } from 'react';
import { ArrowRightIcon, BellIcon, BellOffIcon, BellRingIcon, CheckCheckIcon, CheckIcon, ClipboardCheckIcon, InboxIcon, MessageSquareTextIcon, RotateCcwIcon, SendIcon, UserPlusIcon } from 'lucide-react';
import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { describeNotification, groupByPlan, timeAgo, type NotificationItem, type NotificationKind, type NotificationTodo } from '@/lib/notifications';
import { useNotifications, type AlertPermission } from './use-notifications';

type View = 'all' | 'unread' | 'todo';

// Seeded accounts are named "<STATE> SUBEB Director", so initials come from the part after the body name.
function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const body = words.findIndex(word => /^(SUBEB|UBEB|UBEC)$/i.test(word));
  const own = body >= 0 && body < words.length - 1 ? words.slice(body + 1) : words;
  return own.slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
}
const countLabel = (count: number) => count > 99 ? '99+' : String(count);
const roleTone = (role: string) => role.startsWith('UBEC ') ? 'ubec' : role === 'Executive Chairman' ? 'chairman' : role === 'Data Entry Staff' ? 'entry' : 'director';
const kindIcons: Record<NotificationKind, typeof SendIcon> = { sent: SendIcon, changes: RotateCcwIcon, approved: CheckIcon, assigned: UserPlusIcon, feedback: MessageSquareTextIcon };

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  const message = describeNotification(item);
  const unread = !item.readAt;
  const KindIcon = kindIcons[message.kind];
  return <Item asChild className="notification-row" data-unread={unread || undefined}>
    <a href={message.href} onClick={() => onOpen(item)}>
      <ItemMedia>
        <Avatar size="lg" className="notification-avatar" data-tone={roleTone(item.actorRole)}>
          <AvatarFallback>{initials(message.actor)}</AvatarFallback>
          <AvatarBadge className="notification-kind" data-kind={message.kind}><KindIcon /></AvatarBadge>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="notification-heading"><strong>{message.actor}</strong><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString('en-GB')}>{timeAgo(item.createdAt)}</time></ItemTitle>
        <ItemDescription className="notification-text">{message.verb} <b>{message.target}</b>{message.suffix && ` ${message.suffix}`}</ItemDescription>
        {item.comment && <ItemDescription className="notification-comment">{item.comment}</ItemDescription>}
      </ItemContent>
      {unread && <ItemActions><span className="notification-unread-dot"><span className="sr-only">Unread</span></span></ItemActions>}
    </a>
  </Item>;
}

function TodoRow({ todo }: { todo: NotificationTodo }) {
  return <Item asChild className="notification-row notification-todo">
    <a href={todo.href}>
      <ItemMedia>
        <Avatar size="lg" className="notification-avatar" data-tone="todo"><AvatarFallback><ClipboardCheckIcon /></AvatarFallback></Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="notification-heading"><strong>{todo.label}</strong></ItemTitle>
        <ItemDescription className="notification-text">Waiting for you</ItemDescription>
      </ItemContent>
      <ItemActions><ArrowRightIcon className="notification-todo-arrow" aria-hidden="true" /></ItemActions>
    </a>
  </Item>;
}

function Grouped<T extends { planId: number }>({ items, context, render }: { items: T[]; context: (item: T) => string; render: (item: T) => ReactNode }) {
  return groupByPlan(items, context).map((group, index) => <Fragment key={group.key}>
    {index > 0 && <Separator />}
    <section aria-label={group.context}>
      <h3 className="notification-group-title">{group.context}</h3>
      <ItemGroup>{group.items.map((item, row) => <Fragment key={row}>{row > 0 && <ItemSeparator className="notification-row-separator" />}{render(item)}</Fragment>)}</ItemGroup>
    </section>
  </Fragment>);
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof InboxIcon; title: string; text: string }) {
  return <Empty className="notification-empty">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Icon /></EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{text}</EmptyDescription>
    </EmptyHeader>
  </Empty>;
}

function AlertSetting({ permission, onEnable }: { permission: AlertPermission; onEnable: () => void }) {
  // Nothing to show once alerts are on (or impossible): the footer only carries actions.
  if (permission === 'unsupported' || permission === 'granted') return null;
  if (permission === 'denied') return <span className="notification-alert-state" title="Allow notifications for this site in your browser settings to get desktop alerts."><BellOffIcon aria-hidden="true" />Desktop alerts blocked</span>;
  return <Button variant="ghost" size="sm" className="notification-footer-action" onClick={onEnable} title="Get an alert when something new arrives, even while this window is minimised."><BellRingIcon />Turn on desktop alerts</Button>;
}

export function NotificationBell() {
  const { feed, failed, ringing, permission, reload, markRead, requestPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const unread = feed?.unreadCount ?? 0;
  const todos = feed?.todos ?? [];
  // Open on what needs the user: their waiting work when nothing new has arrived.
  const activeView: View = view ?? (unread === 0 && todos.length ? 'todo' : 'all');
  const shown = (feed?.notifications ?? []).filter(item => activeView !== 'unread' || !item.readAt);
  const label = unread ? `Notifications, ${unread} unread` : todos.length ? `Notifications, ${todos.length} waiting for you` : 'Notifications';

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) { setView(null); void reload(); }
  }
  function openItem(item: NotificationItem) { if (!item.readAt) void markRead([item.id]); }

  function body() {
    if (activeView === 'todo') return todos.length
      ? <Grouped items={todos} context={todo => todo.period} render={todo => <TodoRow key={todo.href} todo={todo} />} />
      : <EmptyState icon={ClipboardCheckIcon} title="Nothing waiting for you" text="Components that need your action will appear here." />;
    if (!feed) return failed
      ? <EmptyState icon={BellOffIcon} title="Notifications unavailable" text="Check your connection, then open this panel again." />
      : <div className="notification-loading">{[0, 1, 2].map(key => <div key={key}><Skeleton className="size-10 rounded-full" /><div><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56" /></div></div>)}</div>;
    if (!shown.length) return activeView === 'unread'
      ? <EmptyState icon={CheckCheckIcon} title="No unread notifications" text="You have read everything sent to you." />
      : <EmptyState icon={InboxIcon} title="You're all caught up" text="Plan updates sent to you will appear here." />;
    return <Grouped items={shown} context={item => describeNotification(item).context} render={item => <NotificationRow key={item.id} item={item} onOpen={openItem} />} />;
  }

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="notification-bell" aria-label={label} data-active={unread > 0 || undefined}>
        <BellIcon key={ringing} data-ringing={ringing > 0 || undefined} aria-hidden="true" />
        {unread > 0 ? <Badge className="notification-badge" aria-hidden="true">{countLabel(unread)}</Badge> : todos.length > 0 && <span className="notification-dot" aria-hidden="true" />}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={10} collisionPadding={12} className="notification-panel">
      <div className="notification-panel-header">
        <h2>Notifications</h2>
        <ToggleGroup type="single" value={activeView} onValueChange={value => { if (value) setView(value as View); }} className="notification-views" aria-label="Show">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="unread">Unread{unread > 0 && <Badge className="notification-count">{countLabel(unread)}</Badge>}</ToggleGroupItem>
          <ToggleGroupItem value="todo">To do{todos.length > 0 && <Badge className="notification-count">{countLabel(todos.length)}</Badge>}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Separator />
      {/* shadcn scroll-fade-b (as in MessageScroller): the last rows fade out until the list is scrolled to the end. */}
      <div className="notification-scroll scroll-fade-b scroll-fade-b-16 overflow-y-auto overscroll-contain">{body()}</div>
      {(unread > 0 || permission === 'default' || permission === 'denied') && <>
        <Separator />
        <div className="notification-footer">
          {unread > 0 && <Button variant="ghost" size="sm" className="notification-footer-action notification-mark-all" onClick={() => void markRead('all')}><CheckCheckIcon />Mark all as read</Button>}
          <AlertSetting permission={permission} onEnable={() => void requestPermission()} />
        </div>
      </>}
    </PopoverContent>
  </Popover>;
}
