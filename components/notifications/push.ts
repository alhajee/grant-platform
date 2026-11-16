'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * UBEC260: web push. Once alerts are allowed, this browser registers public/sw.js and a push subscription
 * (app/api/push), so notifications arrive while the portal is closed. On phones, iOS only allows it once BEAPMS is
 * added to the home screen; Android and desktop browsers can install the app from the bell ("Install the app").
 */
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let pushActive = false;
/** True once this tab holds a live push subscription: the service worker then shows alerts, not the page. */
export const pushIsActive = () => pushActive;

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** Registers the service worker and (with permission granted) saves this device's subscription; quiet on failure. */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const response = await fetch('/api/push', { cache: 'no-store' });
    if (!response.ok) return false;
    const { publicKey } = await response.json() as { publicKey: string };
    let subscription = await registration.pushManager.getSubscription();
    // A subscription made with another key (keys renewed) cannot be used: start again.
    const current = subscription?.options.applicationServerKey;
    if (subscription && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== publicKey) {
      await subscription.unsubscribe(); subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const json = subscription.toJSON();
    const saved = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    pushActive = saved.ok;
    return saved.ok;
  } catch { return false; }
}

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** The browser's install offer, when it makes one (Chrome, Edge, Android). */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const offer = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    // The install offer needs a registered service worker.
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    return () => { window.removeEventListener('beforeinstallprompt', offer); window.removeEventListener('appinstalled', installed); };
  }, []);
  const install = useCallback(async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setPrompt(null);
  }, [prompt]);
  return { canInstall: !!prompt, install };
}
