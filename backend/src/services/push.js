import crypto from 'crypto';
import webpush from 'web-push';
import dotenv from 'dotenv';
import pool from '../config/db.js';
import { r2PublicUrl } from '../config/r2.js';
dotenv.config();

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
export const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
export const vapidPublicKey = VAPID_PUBLIC_KEY || '';

if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ICON = r2PublicUrl ? `${r2PublicUrl}/images/brand/icon-192.png` : undefined;
const BADGE = r2PublicUrl ? `${r2PublicUrl}/images/brand/badge-72.png` : undefined;
const hash = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

// Insert or refresh a browser subscription; returns its id
export async function saveSubscription({ subscription, userId = null, audience = 'customer', userAgent = null }) {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw Object.assign(new Error('Invalid push subscription'), { status: 400 });
  if (!/^https:\/\//.test(endpoint)) throw Object.assign(new Error('Invalid push endpoint'), { status: 400 });
  await pool.query(
    `INSERT INTO push_subscriptions (endpoint, endpoint_hash, p256dh, auth, user_id, audience, user_agent) VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth),
       user_id = COALESCE(VALUES(user_id), user_id),
       audience = IF(VALUES(audience) = 'admin', 'admin', audience),
       user_agent = VALUES(user_agent)`,
    [endpoint, hash(endpoint), keys.p256dh, keys.auth, userId, audience, userAgent?.slice(0, 255) || null]);
  const [[row]] = await pool.query('SELECT id FROM push_subscriptions WHERE endpoint_hash = ?', [hash(endpoint)]);
  return row.id;
}

export async function removeSubscription(endpoint) {
  if (endpoint) await pool.query('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [hash(endpoint)]);
}

// Send one payload to many subscriptions; subscriptions the push service reports as gone are deleted
async function sendTo(rows, { title, body, url = '/', image, tag }) {
  if (!pushEnabled || !rows.length) return { sent: 0, failed: 0 };
  const payload = JSON.stringify({ title, body, url, image, tag, icon: ICON, badge: BADGE });
  let sent = 0;
  let failed = 0;
  const gone = [];
  await Promise.all(rows.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) gone.push(s.id);
      else console.warn('push failed:', err.statusCode || err.message);
    }
  }));
  if (gone.length) await pool.query('DELETE FROM push_subscriptions WHERE id IN (?)', [gone]);
  return { sent, failed };
}

const COLS = 'ps.id, ps.endpoint, ps.p256dh, ps.auth';

export async function notifyAdmins(payload) {
  const [rows] = await pool.query(`SELECT ${COLS} FROM push_subscriptions ps WHERE ps.audience = 'admin'`);
  return sendTo(rows, payload);
}

// The order's customer: their logged-in devices plus any device that asked for updates on this order
export async function notifyOrder(orderId, payload) {
  const [rows] = await pool.query(
    `SELECT DISTINCT ${COLS} FROM push_subscriptions ps
     LEFT JOIN push_order_links l ON l.subscription_id = ps.id AND l.order_id = ?
     LEFT JOIN orders o ON o.id = ? AND o.user_id IS NOT NULL AND o.user_id = ps.user_id
     WHERE l.order_id IS NOT NULL OR o.id IS NOT NULL`, [orderId, orderId]);
  return sendTo(rows, payload);
}

export async function broadcast(payload) {
  const [rows] = await pool.query(`SELECT ${COLS} FROM push_subscriptions ps WHERE ps.audience = 'customer'`);
  return sendTo(rows, payload);
}

export async function notifyUser(userId, payload) {
  const [rows] = await pool.query(`SELECT ${COLS} FROM push_subscriptions ps WHERE ps.user_id = ?`, [userId]);
  return sendTo(rows, payload);
}

// Fire-and-forget helper so a push problem never breaks the request that triggered it
export const background = (promise) => { promise.catch((err) => console.warn('push error:', err.message)); };
