// Direct payment gateways: bKash tokenized checkout and SSLCommerz hosted checkout (cards, bKash, Nagad, Rocket…).
// Like BizscalPay, an order is only marked paid after the server confirms the payment with the gateway itself.
import pool from '../config/db.js';
import { background, notifyAdmins } from './push.js';
import { getSettings, isOn } from './settings.js';

const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

export const GATEWAY_NAMES = { bkash: 'bKash', sslcommerz: 'SSLCommerz' };

export async function gatewayEnabled(gateway) {
  const s = await getSettings();
  if (gateway === 'bkash') return isOn(s.bkash_enabled) && !!(s.bkash_app_key && s.bkash_app_secret && s.bkash_username && s.bkash_password);
  if (gateway === 'sslcommerz') return isOn(s.sslcommerz_enabled) && !!(s.sslcommerz_store_id && s.sslcommerz_store_password);
  return false;
}

const checkPayable = async (order, gateway) => {
  if (!(await gatewayEnabled(gateway))) fail(`${GATEWAY_NAMES[gateway] || 'This'} payment is not available right now`);
  if (order.payment_status === 'paid') fail('This order is already paid');
  if (order.status === 'cancelled') fail('This order was cancelled');
};

// Only the first confirmation flips the order, so admins are notified once. Returns 'paid' | 'already'.
export async function markOrderPaid(order, { method, ref, amount }) {
  if (Number.isFinite(amount) && amount + 0.01 < Number(order.total)) fail('Paid amount is less than the order total — contact support');
  const [r] = await pool.query(
    "UPDATE orders SET payment_status = 'paid', payment_method = ?, payment_ref = ? WHERE id = ? AND payment_status <> 'paid'",
    [method, String(ref), order.id]
  );
  if (!r.affectedRows) return 'already';
  background(notifyAdmins({
    title: `💳 Payment received #${order.order_number}`,
    body: `${order.customer_name} paid ৳${Number(order.total).toLocaleString('en-US')} with ${GATEWAY_NAMES[method] || method}`,
    url: '/admin/orders',
    tag: `order-${order.order_number}`,
  }));
  return 'paid';
}

const verifyUrl = (origin, gateway, order) =>
  `${origin}/payment/verify?gateway=${gateway}&order=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(order.phone)}`;

async function request(name, url, opts) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(25000) });
  } catch (err) {
    fail(`Could not reach ${name} (${err.message})`, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${name}: ${data.statusMessage || data.message || data.failedreason || `HTTP ${res.status}`}`, 502);
  return data;
}

/* ---------- bKash (tokenized checkout) ---------- */
const BKASH_API = { live: 'https://tokenized.pay.bka.sh/v1.2.0-beta', sandbox: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta' };
let bkashToken = null; // { key, token, expires }

async function bkash(path, body) {
  const s = await getSettings();
  const base = isOn(s.bkash_sandbox) ? BKASH_API.sandbox : BKASH_API.live;
  const key = [base, s.bkash_app_key, s.bkash_app_secret, s.bkash_username, s.bkash_password].join('|');
  if (!bkashToken || bkashToken.key !== key || Date.now() > bkashToken.expires) {
    const t = await request('bKash', `${base}/tokenized/checkout/token/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', username: s.bkash_username, password: s.bkash_password },
      body: JSON.stringify({ app_key: s.bkash_app_key, app_secret: s.bkash_app_secret }),
    });
    if (!t.id_token) fail(`bKash: ${t.statusMessage || 'could not log in — check the credentials'}`);
    bkashToken = { key, token: t.id_token, expires: Date.now() + (Number(t.expires_in) || 3600) * 1000 - 120000 };
  }
  return request('bKash', `${base}/tokenized/checkout${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: bkashToken.token, 'X-APP-Key': s.bkash_app_key },
    body: JSON.stringify(body),
  });
}

export async function createBkash(order, origin) {
  await checkPayable(order, 'bkash');
  const data = await bkash('/create', {
    mode: '0011',
    payerReference: order.phone,
    // bKash adds ?paymentID=…&status=success|failure|cancel
    callbackURL: verifyUrl(origin, 'bkash', order),
    amount: Number(order.total).toFixed(2),
    currency: 'BDT',
    intent: 'sale',
    merchantInvoiceNumber: order.order_number,
  });
  if (!data.bkashURL || !data.paymentID) fail(`bKash: ${data.statusMessage || 'no payment link returned'}`, 502);
  await pool.query('UPDATE orders SET payment_ref = ? WHERE id = ?', [String(data.paymentID), order.id]);
  return { paymentUrl: data.bkashURL, paymentId: data.paymentID };
}

// Returns 'paid' | 'already' | 'pending' | 'failed'
export async function verifyBkash(order, paymentID, status) {
  if (order.payment_status === 'paid') return 'already';
  if (status && status !== 'success') return 'failed';
  if (!paymentID || String(paymentID) !== String(order.payment_ref)) fail('This payment belongs to a different order');
  let r = await bkash('/execute', { paymentID });
  // Already executed (e.g. page refreshed) → ask for the final state instead
  if (r.transactionStatus !== 'Completed') r = await bkash('/payment/status', { paymentID });
  if (r.merchantInvoiceNumber && r.merchantInvoiceNumber !== order.order_number) fail('This payment belongs to a different order');
  if (r.transactionStatus === 'Completed') {
    return markOrderPaid(order, { method: 'bkash', ref: r.trxID || paymentID, amount: Number(r.amount) });
  }
  return ['Initiated', 'Inprogress', 'Pending'].includes(r.transactionStatus) ? 'pending' : 'failed';
}

/* ---------- SSLCommerz ---------- */
const SSL_API = { live: 'https://securepay.sslcommerz.com', sandbox: 'https://sandbox.sslcommerz.com' };

async function sslConfig() {
  const s = await getSettings();
  return { base: isOn(s.sslcommerz_sandbox) ? SSL_API.sandbox : SSL_API.live, storeId: s.sslcommerz_store_id, storePass: s.sslcommerz_store_password };
}

// `apiOrigin` is this backend's public URL: SSLCommerz POSTs the customer's browser back to it, which a SPA can't receive
export async function createSslcommerz(order, apiOrigin) {
  await checkPayable(order, 'sslcommerz');
  const cfg = await sslConfig();
  const tranId = `${order.order_number}-${Date.now().toString(36)}`;
  const back = `${apiOrigin}/api/payment/sslcommerz/return`;
  const [items] = await pool.query('SELECT product_name FROM order_items WHERE order_id = ?', [order.id]);
  const form = new URLSearchParams({
    store_id: cfg.storeId,
    store_passwd: cfg.storePass,
    total_amount: Number(order.total).toFixed(2),
    currency: 'BDT',
    tran_id: tranId,
    success_url: back,
    fail_url: back,
    cancel_url: back,
    ipn_url: `${apiOrigin}/api/payment/sslcommerz/ipn`,
    cus_name: order.customer_name.slice(0, 50),
    cus_email: order.email || 'customer@example.com',
    cus_add1: (order.address || 'N/A').slice(0, 50),
    cus_city: (order.city || 'Dhaka').slice(0, 50),
    cus_country: 'Bangladesh',
    cus_phone: order.phone,
    shipping_method: 'NO',
    num_of_item: String(items.length || 1),
    product_name: (items.map((i) => i.product_name).join(', ') || `Order #${order.order_number}`).slice(0, 250),
    product_category: 'Gadget accessories',
    product_profile: 'physical-goods',
    value_a: order.order_number,
    value_b: order.phone,
  });
  const data = await request('SSLCommerz', `${cfg.base}/gwprocess/v4/api.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) fail(`SSLCommerz: ${data.failedreason || 'no payment link returned'}`, 502);
  await pool.query('UPDATE orders SET payment_ref = ? WHERE id = ?', [tranId, order.id]);
  return { paymentUrl: data.GatewayPageURL, tranId };
}

// Asks SSLCommerz about the order's current transaction id. Returns 'paid' | 'already' | 'pending' | 'failed'.
export async function verifySslcommerz(order) {
  if (order.payment_status === 'paid') return 'already';
  const tranId = order.payment_ref;
  if (!tranId || !tranId.startsWith(`${order.order_number}-`)) return 'failed';
  const cfg = await sslConfig();
  const qs = new URLSearchParams({ tran_id: tranId, store_id: cfg.storeId, store_passwd: cfg.storePass, format: 'json' });
  const data = await request('SSLCommerz', `${cfg.base}/validator/api/merchantTransIDvalidationAPI.php?${qs}`, { method: 'GET' });
  const rows = Array.isArray(data.element) ? data.element : [];
  const ok = rows.find((e) => ['VALID', 'VALIDATED'].includes(String(e.status).toUpperCase()) && e.tran_id === tranId);
  if (ok) {
    if (Number(ok.risk_level) === 1) return 'pending'; // flagged by SSLCommerz — confirm manually in their panel
    return markOrderPaid(order, { method: 'sslcommerz', ref: ok.bank_tran_id || tranId, amount: Number(ok.currency_amount || ok.amount) });
  }
  return rows.some((e) => ['PENDING', 'PROCESSING'].includes(String(e.status).toUpperCase())) ? 'pending' : 'failed';
}
