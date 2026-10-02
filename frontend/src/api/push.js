import api from './client';

const SW_URL = `/sw.js?api=${encodeURIComponent(import.meta.env.VITE_API_URL || '')}`;

// Web push helpers. Subscribing must be triggered by a user click (browsers block otherwise).
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const permission = () => (pushSupported() ? Notification.permission : 'unsupported');

export function registerServiceWorker() {
  if (!pushSupported()) return;
  navigator.serviceWorker.register(SW_URL).catch(() => {});
}

const toKey = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// extra: { audience: 'admin' } or { order_number, phone }
export async function subscribePush(extra = {}) {
  if (!pushSupported()) throw new Error('This browser does not support notifications');
  const { enabled, publicKey } = await api.get('/push/public-key');
  if (!enabled) throw new Error('Notifications are not set up on the server yet');
  const result = await Notification.requestPermission();
  if (result !== 'granted') throw new Error('Notifications are blocked — allow them in your browser settings');
  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  await api.post('/push/subscribe', { subscription: sub.toJSON(), ...extra });
  return sub;
}

export async function unsubscribePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
