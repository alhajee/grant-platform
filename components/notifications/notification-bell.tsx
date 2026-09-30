"use client";
import "./notifications.css";
import { useState } from 'react';
import { ArrowUpRightIcon, BellIcon, BellOffIcon, BellRingIcon, ClipboardCheckIcon, InboxIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { describeNotification, timeAgo, type NotificationItem, type NotificationTodo } from '@/lib/notifications';
import { useNotifications, type AlertPermission } from './use-notifications';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—';
const countLabel = (count: number) => count > 99 ? '99+' : String(count);

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: (item: NotificationItem) => void }) {
  const message = describeNotification(item);
  const unread = !item.readAt;
  return <li>
    <a className="notification-row" href={message.href} data-unread={unread || undefined} data-source={item.source} onClick={() => onOpen(item)}>
      <span className="notification-avatar" aria-hidden="true">{initials(message.actor)}</span>
      <span className="notification-copy">
        <span className="notification-text"><strong>{message.actor}</strong> {message.text} <strong>{message.target}</strong></span>
        <span className="notification-meta"><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString('en-GB')}>{timeAgo(item.createdAt)}</time><i aria-hidden="true" />{message.context}</span>
        {item.comment && <span className="notification-comment">{item.comment}</span>}
      </span>
      {unread && <span className="notification-unread-dot"><span className="sr-only">Unread</span></span>}
    </a>
  </li>;
}

function TodoRow({ todo }: { todo: NotificationTodo }) {
  return <li>
    <a className="notification-row notification-todo" href={todo.href}>
      <span className="notification-avatar" aria-hidden="true"><ClipboardCheckIcon /></span>
      <span className="notification-copy"><span className="notification-text"><strong>{todo.label}</strong></span><span className="notification-meta">{todo.period}</span></span>
      <ArrowUpRightIcon className="notification-todo-arrow" aria-hidden="true" />
    </a>
  </li>;
}

function Empty({ icon: Icon, title, text }: { icon: typeof InboxIcon; title: string; text: string }) {
  return <div className="notification-empty"><Icon aria-hidden="true" /><strong>{title}</strong><span>{text}</span></div>;
}

function AlertSetting({ permission, onEnable }: { permission: AlertPermission; onEnable: () => void }) {
  if (permission === 'unsupported' || permission === 'granted') return null;
  if (permission === 'denied') return <p className="notification-alerts"><BellOffIcon aria-hidden="true" />Desktop alerts are blocked. Allow notifications for this site in your browser settings.</p>;
  return <div className="notification-alerts"><BellRingIcon aria-hidden="true" /><span>Get a desktop alert when something new arrives, even while this window is minimised.</span><Button size="sm" variant="outline" onClick={onEnable}>Turn on</Button></div>;
}

export function NotificationBell() {
  const { feed, failed, ringing, permission, reload, markRead, requestPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const unread = feed?.unreadCount ?? 0;
  const todos = feed?.todos ?? [];
  // Open on the tab that needs the user: new updates first, otherwise their waiting work.
  const activeTab = tab ?? (unread === 0 && todos.length ? 'todo' : 'updates');
  const label = unread ? `Notifications, ${unread} unread` : todos.length ? `Notifications, ${todos.length} waiting for you` : 'Notifications';

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) { setTab(null); void reload(); }
  }
  function openItem(item: NotificationItem) { if (!item.readAt) void markRead([item.id]); }

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button type="button" className="notification-bell" aria-label={label} data-active={unread > 0 || undefined}>
        <BellIcon key={ringing} data-ringing={ringing > 0 || undefined} aria-hidden="true" />
        {unread > 0 ? <span className="notification-badge" aria-hidden="true">{countLabel(unread)}</span> : todos.length > 0 && <span className="notification-dot" aria-hidden="true" />}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={10} collisionPadding={12} className="notification-panel">
      <div className="notification-panel-header">
        <h2>Notifications</h2>
        <Button variant="link" size="sm" className="notification-mark-all" disabled={!unread} onClick={() => void markRead('all')}>Mark all as read</Button>
      </div>
      <Tabs value={activeTab} onValueChange={setTab} className="notification-tabs">
        <TabsList variant="line">
          <TabsTrigger value="updates">Updates{unread > 0 && <span className="notification-count">{countLabel(unread)}</span>}</TabsTrigger>
          <TabsTrigger value="todo">To do{todos.length > 0 && <span className="notification-count" data-muted>{countLabel(todos.length)}</span>}</TabsTrigger>
        </TabsList>
        <TabsContent value="updates" className="notification-scroll">
          {!feed ? failed ? <Empty icon={BellOffIcon} title="Notifications unavailable" text="Check your connection, then open this panel again." /> : <div className="notification-loading">{[0, 1, 2].map(key => <div key={key}><Skeleton className="size-10 rounded-xl" /><div><Skeleton className="h-3.5 w-56" /><Skeleton className="h-3 w-32" /></div></div>)}</div>
            : feed.notifications.length ? <ul className="notification-list">{feed.notifications.map(item => <NotificationRow key={item.id} item={item} onOpen={openItem} />)}</ul>
            : <Empty icon={InboxIcon} title="You're all caught up" text="Plan updates sent to you will appear here." />}
        </TabsContent>
        <TabsContent value="todo" className="notification-scroll">
          {todos.length ? <ul className="notification-list">{todos.map(todo => <TodoRow key={todo.href} todo={todo} />)}</ul> : <Empty icon={ClipboardCheckIcon} title="Nothing waiting for you" text="Components that need your action will appear here." />}
        </TabsContent>
      </Tabs>
      <AlertSetting permission={permission} onEnable={() => void requestPermission()} />
    </PopoverContent>
  </Popover>;
}
