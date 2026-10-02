import { Router } from 'express';
import pool from '../config/db.js';
import { optionalAuth, protect, adminOnly } from '../middleware/auth.js';
import { asyncHandler } from '../utils.js';
import {
  pushEnabled, vapidPublicKey, saveSubscription, removeSubscription, broadcast, notifyUser,
} from '../services/push.js';

const router = Router();

router.get('/public-key', (_req, res) => res.json({ enabled: pushEnabled, publicKey: vapidPublicKey }));

// Subscribe this browser. audience=admin needs an admin login; order_number+phone links a guest's device to an order.
router.post('/subscribe', optionalAuth, asyncHandler(async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ message: 'Push notifications are not configured' });
  const { subscription, audience, order_number: orderNumber, phone } = req.body;
  if (audience === 'admin' && req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const id = await saveSubscription({
    subscription, userId: req.user?.id || null, audience: audience === 'admin' ? 'admin' : 'customer', userAgent: req.get('user-agent'),
  });
  if (orderNumber) {
    const [[order]] = await pool.query('SELECT id, phone, user_id FROM orders WHERE order_number = ?', [orderNumber]);
    const allowed = order && (order.phone === phone || (req.user && order.user_id === req.user.id));
    if (allowed) await pool.query('INSERT IGNORE INTO push_order_links (order_id, subscription_id) VALUES (?,?)', [order.id, id]);
  }
  res.status(201).json({ ok: true });
}));

router.post('/unsubscribe', asyncHandler(async (req, res) => {
  await removeSubscription(req.body.endpoint);
  res.json({ ok: true });
}));

/* ---------- Admin ---------- */
router.get('/admin/stats', protect, adminOnly, asyncHandler(async (_req, res) => {
  const [[counts]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM push_subscriptions WHERE audience = 'customer') AS customers,
    (SELECT COUNT(*) FROM push_subscriptions WHERE audience = 'admin') AS admins`);
  const [campaigns] = await pool.query('SELECT * FROM push_campaigns ORDER BY created_at DESC LIMIT 30');
  res.json({ enabled: pushEnabled, ...counts, campaigns });
}));

router.post('/admin/send', protect, adminOnly, asyncHandler(async (req, res) => {
  const { title, body, url, image } = req.body;
  if (!title?.trim()) return res.status(400).json({ message: 'Title is required' });
  const result = await broadcast({ title: title.trim(), body, url: url || '/', image: image || undefined, tag: 'promo' });
  await pool.query('INSERT INTO push_campaigns (title, body, url, image, sent, failed, created_by) VALUES (?,?,?,?,?,?,?)',
    [title.trim(), body || null, url || '/', image || null, result.sent, result.failed, req.user.id]);
  res.json(result);
}));

// Sends a test to the admin's own devices
router.post('/admin/test', protect, adminOnly, asyncHandler(async (req, res) => {
  const result = await notifyUser(req.user.id, {
    title: 'Test notification ✅', body: 'Push notifications are working on this device.', url: '/admin', tag: 'test',
  });
  if (!result.sent) return res.status(400).json({ message: 'No subscribed device for your account — click "Enable on this device" first.' });
  res.json(result);
}));

export default router;
