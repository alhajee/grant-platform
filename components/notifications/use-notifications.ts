"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { describeNotification, notificationText, type NotificationFeed, type NotificationItem } from '@/lib/notifications';
import { installAudioUnlock, isSoundEnabled, playChime } from './notification-sound';

const POLL_MS = 30_000;
// Shared by every tab so only one of them chimes and raises a browser alert for a notification.
const ALERTED_KEY = 'beapms:notifications:alerted-through';
const MAX_ALERTS = 3;

export type AlertPermission = NotificationPermission | 'unsupported';

function readAlerted() {
  try { return Number(localStorage.getItem(ALERTED_KEY)) || 0; } catch { return 0; }
}
function writeAlerted(id: number) {
  try { if (id > readAlerted()) localStorage.setItem(ALERTED_KEY, String(id)); } catch { /* storage unavailable: alerts may repeat across tabs */ }
}

const permissionListeners = new Set<() => void>();
function subscribePermission(callback: () => void) { permissionListeners.add(callback); return () => { permissionListeners.delete(callback); }; }
const currentPermission = (): AlertPermission => typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';

function showBrowserAlerts(items: NotificationItem[], onOpen: (item: NotificationItem) => void) {
  if (currentPermission() !== 'granted') return;
  const alerts = items.length > MAX_ALERTS
    ? [{ tag: `beapms-summary-${items[0].id}`, title: 'BEAPMS Portal', body: `You have ${items.length} new notifications.`, item: items[0] }]
    : items.map(item => ({ tag: `beapms-${item.id}`, title: describeNotification(item).context, body: notificationText(item), item }));
  for (const alert of alerts) {
    try {
      const notice = new Notification(alert.title, { body: alert.body, tag: alert.tag, icon: '/ubec-logo.png' });
      notice.onclick = () => { window.focus(); notice.close(); onOpen(alert.item); };
    } catch { /* some browsers only allow alerts from a service worker */ }
  }
}

function syncTitle(unread: number) {
  const base = document.title.replace(/^\(\d+\+?\) /, '');
  document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
}

export function useNotifications() {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [failed, setFailed] = useState(false);
  const [ringing, setRinging] = useState(0);
  const baseline = useRef<number | null>(null);
  const permission = useSyncExternalStore(subscribePermission, currentPermission, () => 'unsupported' as AlertPermission);

  const markRead = useCallback(async (ids: number[] | 'all') => {
    setFeed(previous => previous && {
      ...previous,
      notifications: previous.notifications.map(item => ids === 'all' || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item),
      unreadCount: ids === 'all' ? 0 : Math.max(0, previous.unreadCount - previous.notifications.filter(item => ids.includes(item.id) && !item.readAt).length),
    });
    try {
      // keepalive lets the request finish when the click also navigates away.
      const response = await fetch('/api/notifications', { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids === 'all' ? { all: true } : { ids }) });
      if (!response.ok) throw new Error();
      return true;
    } catch { return false; }
  }, []);

  const openFromAlert = useCallback((item: NotificationItem) => {
    void markRead([item.id]);
    window.location.assign(describeNotification(item).href);
  }, [markRead]);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (response.status === 401) return;
      if (!response.ok) throw new Error();
      const next = await response.json() as NotificationFeed;
      const newest = next.notifications[0]?.id ?? 0;
      if (baseline.current === null) {
        // Existing notifications never raise alerts; only ones that arrive while the page is open.
        baseline.current = Math.max(newest, readAlerted());
        writeAlerted(baseline.current);
      } else if (newest > baseline.current) {
        const since = Math.max(baseline.current, readAlerted());
        const fresh = next.notifications.filter(item => item.id > since && !item.readAt);
        baseline.current = newest;
        writeAlerted(newest);
        if (fresh.length) {
          // One chime per poll however many arrived; it plays whether or not the window has focus.
          setRinging(count => count + 1);
          if (isSoundEnabled()) playChime();
          if (document.visibilityState !== 'visible' || !document.hasFocus()) showBrowserAlerts(fresh, openFromAlert);
        }
      }
      setFeed(next);
      setFailed(false);
    } catch { setFailed(true); }
  }, [openFromAlert]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = window.setInterval(() => { void load(); }, POLL_MS);
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  useEffect(() => { if (feed) syncTitle(feed.unreadCount); }, [feed]);
  // The bell is always mounted, so this is where the first click or key press unlocks audio for the chime.
  useEffect(() => { installAudioUnlock(); }, []);

  const requestPermission = useCallback(async () => {
    if (currentPermission() !== 'default') return;
    try { await Notification.requestPermission(); } finally { permissionListeners.forEach(listener => listener()); }
  }, []);

  return { feed, failed, ringing, permission, reload: load, markRead, requestPermission };
}
