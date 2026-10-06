// Public endpoints for the courier, payment gateway and server-side tracking integrations
import express, { Router } from 'express';
import crypto from 'crypto';
import pool from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils.js';
import { applyPathaoStatus, applySteadfastStatus } from '../services/courier.js';
import { createPayment, payConfig, validSignature, verifyPayment } from '../services/bizscalpay.js';
import { createBkash, createNagad, createSslcommerz, nagadOrder, verifyBkash, verifyNagad, verifySslcommerz } from '../services/payments.js';
import { EVENTS, trackServer } from '../services/serverTracking.js';
import { getSettings } from '../services/settings.js';

const router = Router();

/* ---------- Server-side tracking ---------- */
// The browser posts each pixel event here with the same event id; Purchase is sent by the order route itself.
const str = (v, max = 500) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
router.post('/track', optionalAuth, (req, res) => {
  res.status(204).end();
  const b = req.body || {};
  if (!EVENTS.has(b.event) || b.event === 'Purchase' || !str(b.event_id, 100)) return;
  const items = (Array.isArray(b.items) ? b.items.slice(0, 50) : []).map((i) => ({
    id: str(i.id, 60), name: str(i.name, 200), price: Number(i.price) || 0, quantity: Math.max(1, Number(i.quantity) || 1),
  }));
  trackServer({
    event: b.event,
    eventId: str(b.event_id, 100),
    req,
    url: str(b.url, 1000),
    user: { external_id: req.user?.id, fbp: str(b.fbp, 200), fbc: str(b.fbc, 300), ttp: str(b.ttp, 200), ttclid: str(b.ttclid, 300) },
    data: { value: Number(b.value) || 0, items, search: str(b.search, 200) },
  });
});

/* ---------- Online payment (BizscalPay) ---------- */
// Customers reach these from checkout / the verify page, so the order is identified by number + phone
const findOrder = async (orderNumber, phone) => {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE order_number = ?', [String(orderNumber || '')]);
  if (!o || String(phone || '') !== o.phone) throw Object.assign(new Error('Order not found'), { status: 404 });
  return o;
};

const storefrontOrigin = (req) => {
  const allowed = (process.env.CLIENT_URL || '').split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean);
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  return allowed.includes(origin) || !allowed.length ? origin : allowed[0];
};

router.post('/payment/bizscalpay/create', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json(await createPayment(order, storefrontOrigin(req)));
}));

router.post('/payment/bizscalpay/verify', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  const invoiceId = String(req.body.invoiceId || order.payment_ref || '');
  if (!invoiceId) return res.status(400).json({ message: 'Missing payment reference' });
  res.json({ status: await verifyPayment(order, invoiceId) });
}));

// Register this URL as the webhook in the BizscalPay dashboard. We still confirm with the gateway before acting.
router.post('/payment/bizscalpay/webhook', asyncHandler(async (req, res) => {
  const { webhookSecret } = await payConfig();
  if (!validSignature(req.rawBody, req.get('X-Bizscal-Signature'), webhookSecret)) return res.sendStatus(401);
  const { event, data } = req.body || {};
  const invoiceId = data?.invoiceId || data?.invoice_id;
  const orderNumber = data?.metadata?.order_number;
  if (!invoiceId || !orderNumber || !['transaction.verified', 'transaction.completed'].includes(event)) return res.sendStatus(200);
  const [[order]] = await pool.query('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
  if (order) await verifyPayment(order, invoiceId).catch((err) => console.error('[bizscalpay webhook]', err.message));
  res.sendStatus(200);
}));

/* ---------- Online payment (bKash, SSLCommerz) ---------- */
// Public URL of this API — SSLCommerz posts the customer's browser back here ('trust proxy' is on)
const apiOrigin = (req) => (process.env.API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

router.post('/payment/bkash/create', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json(await createBkash(order, storefrontOrigin(req)));
}));

router.post('/payment/bkash/verify', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json({ status: await verifyBkash(order, String(req.body.paymentID || ''), String(req.body.status || '')) });
}));

router.post('/payment/nagad/create', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json(await createNagad(order, apiOrigin(req), req.ip?.replace(/^::ffff:/, '')));
}));

router.post('/payment/nagad/verify', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json({ status: await verifyNagad(order, String(req.body.paymentID || '')) });
}));

// Nagad sends the customer here (?order_id=…&payment_ref_id=…&status=…); the verify page confirms with Nagad
router.get('/payment/nagad/callback', asyncHandler(async (req, res) => {
  const store = (process.env.CLIENT_URL || '').split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean)[0] || '';
  const order = await nagadOrder(req.query.order_id);
  if (!order) return res.redirect(303, `${store}/`);
  const ref = String(req.query.payment_ref_id || '').slice(0, 100);
  res.redirect(303, `${store}/payment/verify?gateway=nagad&order=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(order.phone)}&paymentID=${encodeURIComponent(ref)}`);
}));

router.post('/payment/sslcommerz/create', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json(await createSslcommerz(order, apiOrigin(req)));
}));

router.post('/payment/sslcommerz/verify', asyncHandler(async (req, res) => {
  const order = await findOrder(req.body.order_number, req.body.phone);
  res.json({ status: await verifySslcommerz(order) });
}));

// SSLCommerz success / fail / cancel all land here (form POST). The status is checked with SSLCommerz
// on the verify page, so the posted fields are only used to find the way back to the store.
const sslForm = express.urlencoded({ extended: false, limit: '100kb' });
router.post('/payment/sslcommerz/return', sslForm, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const [[order]] = await pool.query('SELECT order_number, phone FROM orders WHERE order_number = ?', [String(b.value_a || '')]);
  const allowed = (process.env.CLIENT_URL || '').split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean);
  const store = allowed[0] || '';
  if (!order) return res.redirect(303, `${store}/`);
  res.redirect(303, `${store}/payment/verify?gateway=sslcommerz&order=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(order.phone)}`);
}));

// Server-to-server notice from SSLCommerz (set as IPN URL in their panel too) — confirmed with SSLCommerz before acting
router.post('/payment/sslcommerz/ipn', sslForm, asyncHandler(async (req, res) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE order_number = ?', [String(req.body?.value_a || '')]);
  if (order) await verifySslcommerz(order).catch((err) => console.error('[sslcommerz ipn]', err.message));
  res.sendStatus(200);
}));

/* ---------- Courier status webhook (Steadfast) ---------- */
// In the Steadfast portal set the callback URL to /api/courier/steadfast/webhook and the
// auth token to the same value as "Steadfast Webhook Token" in Settings.
router.post('/courier/steadfast/webhook', asyncHandler(async (req, res) => {
  const s = await getSettings();
  const expected = Buffer.from(`Bearer ${s.steadfast_webhook_token || ''}`);
  const got = Buffer.from(String(req.get('authorization') || ''));
  if (!s.steadfast_webhook_token || expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  const b = req.body || {};
  if (b.notification_type && b.notification_type !== 'delivery_status') return res.json({ status: 'success', message: 'Ignored' });
  const [[order]] = await pool.query(
    "SELECT * FROM orders WHERE courier = 'steadfast' AND (courier_consignment_id = ? OR order_number = ?) LIMIT 1",
    [String(b.consignment_id ?? ''), String(b.invoice ?? '')]
  );
  if (order) await applySteadfastStatus(order, b.status);
  res.json({ status: 'success', message: 'Webhook received successfully.' });
}));

/* ---------- Courier status webhook (Pathao) ---------- */
// Pathao merchant panel → Developers API → Webhook: URL /api/courier/pathao/webhook and the
// secret set to "Pathao Webhook Secret" in Settings. Pathao expects this header on every reply.
const PATHAO_INTEGRATION_SECRET = 'f3992ecc-59da-4cbe-a049-a13da2018d51';
router.post('/courier/pathao/webhook', asyncHandler(async (req, res) => {
  res.set('X-Pathao-Merchant-Webhook-Integration-Secret', PATHAO_INTEGRATION_SECRET);
  const s = await getSettings();
  const expected = Buffer.from(String(s.pathao_webhook_secret || ''));
  const got = Buffer.from(String(req.get('x-pathao-signature') || ''));
  if (!s.pathao_webhook_secret || expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const b = req.body || {};
  if (b.event && b.event !== 'webhook_integration') {
    const [[order]] = await pool.query(
      "SELECT * FROM orders WHERE courier = 'pathao' AND (courier_consignment_id = ? OR order_number = ?) LIMIT 1",
      [String(b.consignment_id ?? ''), String(b.merchant_order_id ?? '')]
    );
    if (order) await applyPathaoStatus(order, b.event);
  }
  res.status(202).json({ message: 'OK' });
}));

export default router;
