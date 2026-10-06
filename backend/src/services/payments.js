// Direct payment gateways: bKash tokenized checkout and SSLCommerz hosted checkout (cards, bKash, Nagad, Rocket…).
// Like BizscalPay, an order is only marked paid after the server confirms the payment with the gateway itself.
import crypto from 'crypto';
import pool from '../config/db.js';
import { background, notifyAdmins } from './push.js';
import { getSettings, isOn } from './settings.js';

const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

export const GATEWAY_NAMES = { bkash: 'bKash', nagad: 'Nagad', sslcommerz: 'SSLCommerz' };

/* ---------- Self MFS (Send Money to the store's own number) ---------- */
// The customer sends money to the store's bKash / Nagad / Rocket number and submits the Transaction ID;
// an admin checks it in their app and marks the order paid. Orders use payment_method "mfs_<provider>".
export const MFS_PROVIDERS = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };

// Returns { method, ref } for the order, or throws if the details are missing / already used
export async function mfsPayment(conn, { provider, sender, trx }) {
  const s = await getSettings();
  if (!MFS_PROVIDERS[provider] || !isOn(s.mfs_enabled) || !isOn(s[`mfs_${provider}_enabled`]) || !s[`mfs_${provider}_number`]) {
    fail('This payment method is not available right now');
  }
  const trxId = String(trx || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(trxId)) fail('Enter the Transaction ID from your payment message (6–20 letters/numbers)');
  const from = String(sender || '').replace(/\D/g, '').replace(/^88/, '');
  if (!/^01\d{9}$/.test(from)) fail('Enter the 11 digit number you sent the money from');
  const [[used]] = await conn.query("SELECT order_number FROM orders WHERE payment_method LIKE 'mfs\\_%' AND payment_ref LIKE ?", [`%TrxID ${trxId}`]);
  if (used) fail('This Transaction ID was already used for another order');
  return { method: `mfs_${provider}`, ref: `${MFS_PROVIDERS[provider]} from ${from} · TrxID ${trxId}` };
}

export async function gatewayEnabled(gateway) {
  const s = await getSettings();
  if (gateway === 'bkash') return isOn(s.bkash_enabled) && !!(s.bkash_app_key && s.bkash_app_secret && s.bkash_username && s.bkash_password);
  if (gateway === 'nagad') return isOn(s.nagad_enabled) && !!(s.nagad_merchant_id && s.nagad_merchant_number && s.nagad_public_key && s.nagad_private_key);
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

/* ---------- Nagad (merchant payment gateway) ---------- */
// Every request carries RSA-encrypted "sensitiveData" (Nagad's public key) signed with the merchant's private key.
const NAGAD_API = { live: 'https://api.mynagad.com/api/dfs', sandbox: 'http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs' };

// Keys are pasted from the Nagad panel with or without the PEM header and line breaks
const toPem = (key, type) => {
  const body = String(key || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return `-----BEGIN ${type}-----\n${body.match(/.{1,64}/g)?.join('\n') || ''}\n-----END ${type}-----\n`;
};
const nagadKeys = (s) => {
  try {
    return {
      pub: crypto.createPublicKey(toPem(s.nagad_public_key, 'PUBLIC KEY')),
      priv: crypto.createPrivateKey(toPem(s.nagad_private_key, 'PRIVATE KEY')),
    };
  } catch {
    return fail('Nagad keys in Settings are not valid — paste the Nagad public key and your merchant private key');
  }
};
const nagadEncrypt = (pub, obj) => crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify(obj))).toString('base64');
const nagadSign = (priv, obj) => crypto.sign('sha256', Buffer.from(JSON.stringify(obj)), priv).toString('base64');
// Decrypt without padding and strip PKCS#1 v1.5 ourselves — newer Node versions refuse RSA_PKCS1_PADDING for private decryption
const nagadDecrypt = (priv, b64) => {
  const raw = crypto.privateDecrypt({ key: priv, padding: crypto.constants.RSA_NO_PADDING }, Buffer.from(b64, 'base64'));
  const sep = raw[0] === 0 && raw[1] === 2 ? raw.indexOf(0, 2) : -1;
  if (sep < 10) fail('Nagad: could not read the response — check the keys', 502);
  return JSON.parse(raw.subarray(sep + 1).toString('utf8'));
};
const dhakaNow = () => new Date(Date.now() + 6 * 3600000).toISOString().replace(/\D/g, '').slice(0, 14); // YYYYMMDDHHmmss, UTC+6

async function nagadConfig() {
  const s = await getSettings();
  return { s, base: isOn(s.nagad_sandbox) ? NAGAD_API.sandbox : NAGAD_API.live, merchantId: String(s.nagad_merchant_id || '').trim() };
}
const nagadHeaders = (ip) => ({
  'Content-Type': 'application/json', Accept: 'application/json',
  'X-KM-Api-Version': 'v-0.2.0', 'X-KM-IP-V4': ip || '127.0.0.1', 'X-KM-Client-Type': 'PC_WEB',
});

// `apiOrigin` is this backend's public URL — Nagad sends the customer back to it with the payment reference
export async function createNagad(order, apiOrigin, ip) {
  await checkPayable(order, 'nagad');
  const { s, base, merchantId } = await nagadConfig();
  const { pub, priv } = nagadKeys(s);
  // Nagad order ids are alphanumeric, max 20 — a fresh one per attempt so retries work
  const orderId = `${order.order_number}${Date.now().toString(36).slice(-6)}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  const datetime = dhakaNow();
  const init = { merchantId, datetime, orderId, challenge: crypto.randomBytes(20).toString('hex') };
  const r1 = await request('Nagad', `${base}/check-out/initialize/${merchantId}/${orderId}`, {
    method: 'POST', headers: nagadHeaders(ip),
    body: JSON.stringify({ accountNumber: s.nagad_merchant_number, dateTime: datetime, sensitiveData: nagadEncrypt(pub, init), signature: nagadSign(priv, init) }),
  });
  if (!r1.sensitiveData) fail(`Nagad: ${r1.message || r1.reason || 'could not start the payment'}`, 502);
  const { paymentReferenceId, challenge } = nagadDecrypt(priv, r1.sensitiveData);

  const done = { merchantId, orderId, currencyCode: '050', amount: Number(order.total).toFixed(2), challenge };
  const r2 = await request('Nagad', `${base}/check-out/complete/${paymentReferenceId}`, {
    method: 'POST', headers: nagadHeaders(ip),
    body: JSON.stringify({
      sensitiveData: nagadEncrypt(pub, done), signature: nagadSign(priv, done),
      merchantCallbackURL: `${apiOrigin}/api/payment/nagad/callback`,
      additionalMerchantInfo: { order_number: order.order_number },
    }),
  });
  if (r2.status !== 'Success' || !r2.callBackUrl) fail(`Nagad: ${r2.message || r2.reason || 'no payment link returned'}`, 502);
  await pool.query('UPDATE orders SET payment_ref = ? WHERE id = ?', [`${orderId}|${paymentReferenceId}`, order.id]);
  return { paymentUrl: r2.callBackUrl, orderId };
}

// Finds the order behind a Nagad order id (from the callback)
export async function nagadOrder(orderId) {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE payment_ref LIKE ?', [`${String(orderId || '').replace(/[^A-Za-z0-9]/g, '')}|%`]);
  return o || null;
}

// Returns 'paid' | 'already' | 'pending' | 'failed'
export async function verifyNagad(order, paymentRefId) {
  if (order.payment_status === 'paid') return 'already';
  const [orderId, savedRef] = String(order.payment_ref || '').split('|');
  const ref = String(paymentRefId || savedRef || '');
  if (!orderId || !ref) return 'failed';
  const { base } = await nagadConfig();
  const r = await request('Nagad', `${base}/verify/payment/${encodeURIComponent(ref)}`, { method: 'GET', headers: nagadHeaders() });
  if (r.orderId && r.orderId !== orderId) fail('This payment belongs to a different order');
  if (r.status === 'Success') return markOrderPaid(order, { method: 'nagad', ref: r.issuerPaymentRefNo || ref, amount: Number(r.amount) });
  return ['Aborted', 'Cancelled', 'Failed', 'Rejected'].includes(r.status) ? 'failed' : 'pending';
}
