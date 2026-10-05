// BizscalPay hosted checkout: create an invoice → customer pays on BizscalPay (bKash / Nagad / Rocket / card)
// → we verify the invoice server-side before marking the order paid. The webhook is a backup for the redirect.
import crypto from 'crypto';
import pool from '../config/db.js';
import { background, notifyAdmins } from './push.js';
import { getSettings, isOn } from './settings.js';

export const DEFAULT_API_BASE = 'https://bizscalpaybackend.bizscal.com';
const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

export async function payConfig() {
  const s = await getSettings();
  return {
    enabled: isOn(s.bizscalpay_enabled) && !!s.bizscalpay_api_key,
    apiBase: String(s.bizscalpay_api_base || DEFAULT_API_BASE).replace(/\/+$/, ''),
    apiKey: s.bizscalpay_api_key,
    webhookSecret: s.bizscalpay_webhook_secret || null,
  };
}

async function call(path, body) {
  const cfg = await payConfig();
  if (!cfg.apiKey) fail('Online payment is not configured');
  let res;
  try {
    res = await fetch(`${cfg.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    fail(`Could not reach the payment gateway (${err.message})`, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.message || `Payment gateway error (HTTP ${res.status})`, 502);
  return data;
}

// Returns { paymentUrl, invoiceId }. The gateway appends the invoice id to the redirect URL's trailing `invoiceId=`.
export async function createPayment(order, origin) {
  const cfg = await payConfig();
  if (!cfg.enabled) fail('Online payment is not available right now');
  if (order.payment_status === 'paid') fail('This order is already paid');
  if (order.status === 'cancelled') fail('This order was cancelled');
  const redirectUrl = `${origin}/payment/verify?order=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(order.phone)}&invoiceId=`;
  const data = await call('/api/v1/payment/create', {
    amount: Number(order.total),
    productName: `Order #${order.order_number}`,
    redirectUrl,
    metadata: { order_number: order.order_number, order_total: String(order.total) },
  });
  if (!data.paymentUrl || !data.invoiceId) fail('The payment gateway did not return a payment link', 502);
  await pool.query('UPDATE orders SET payment_ref = ? WHERE id = ?', [String(data.invoiceId), order.id]);
  return { paymentUrl: data.paymentUrl, invoiceId: data.invoiceId };
}

// Confirm with the gateway and mark the order paid. Returns 'paid' | 'already' | 'pending' | 'failed'.
export async function verifyPayment(order, invoiceId) {
  if (order.payment_status === 'paid') return 'already';
  const result = await call('/api/v1/payment/verify', { invoiceId });
  const meta = result.metadata || result.meta || {};
  if (meta.order_number && meta.order_number !== order.order_number) fail('This payment belongs to a different order');
  const status = String(result.status || '').toUpperCase();
  if (status === 'FAILED') return 'failed';
  if (status !== 'COMPLETED') return 'pending';
  const paid = Number(result.amount ?? order.total);
  if (Number.isFinite(paid) && paid + 0.01 < Number(order.total)) fail('Paid amount is less than the order total — contact support');

  // Only the first confirmation (redirect or webhook) flips it, so admins are notified once
  const [r] = await pool.query(
    "UPDATE orders SET payment_status = 'paid', payment_method = 'online', payment_ref = ? WHERE id = ? AND payment_status <> 'paid'",
    [String(invoiceId), order.id]
  );
  if (!r.affectedRows) return 'already';
  background(notifyAdmins({
    title: `💳 Payment received #${order.order_number}`,
    body: `${order.customer_name} paid ৳${Number(order.total).toLocaleString('en-US')} online`,
    url: '/admin/orders',
    tag: `order-${order.order_number}`,
  }));
  return 'paid';
}

// Webhook signature: "sha256=<hex HMAC of the raw body>"
export function validSignature(rawBody, header, secret) {
  if (!rawBody || !header || !secret) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const got = Buffer.from(String(header));
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
