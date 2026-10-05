// Courier integration: Steadfast parcel booking + status sync, and a customer's delivery history
// across all Bangladeshi couriers (bdcourier.com aggregator) so risky COD orders can be spotted.
import pool from '../config/db.js';
import { changeOrderStatus } from './orders.js';
import { getSettings } from './settings.js';

const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };

/* ---------- Steadfast ---------- */
const STEADFAST_API = 'https://portal.packzy.com/api/v1';
export const steadfastTrackingUrl = (code) => (code ? `https://steadfast.com.bd/t/${encodeURIComponent(code)}` : null);

// Steadfast delivery_status → our order status. Statuses not listed leave the order as it is.
const STEADFAST_TO_ORDER = { delivered: 'delivered', partial_delivered: 'delivered', cancelled: 'cancelled' };

async function steadfast(path, { method = 'GET', body } = {}) {
  const s = await getSettings();
  if (!s.steadfast_api_key || !s.steadfast_secret_key) fail('Steadfast API key and secret key are not set in Settings');
  let res;
  try {
    res = await fetch(`${STEADFAST_API}${path}`, {
      method,
      headers: { 'Api-Key': s.steadfast_api_key, 'Secret-Key': s.steadfast_secret_key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    fail(`Could not reach Steadfast (${err.message})`, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.status && Number(data.status) >= 400)) {
    const detail = data.errors ? Object.values(data.errors).flat().join(', ') : '';
    fail(`Steadfast: ${detail || data.message || `HTTP ${res.status}`}`, res.status === 401 ? 400 : 502);
  }
  return data;
}

// Steadfast wants an 11-digit local mobile number
const localPhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('880')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('1')) d = `0${d}`;
  return d;
};

export async function bookSteadfast(orderId) {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!o) fail('Order not found', 404);
  if (o.courier_tracking_code) fail(`Already sent to ${o.courier} (${o.courier_tracking_code})`);
  if (o.status === 'cancelled') fail('Cancelled orders cannot be sent to the courier');
  const phone = localPhone(o.phone);
  if (!/^01\d{9}$/.test(phone)) fail(`Invalid phone "${o.phone}" — Steadfast needs an 11 digit number (01XXXXXXXXX)`);
  const [items] = await pool.query('SELECT product_name, quantity FROM order_items WHERE order_id = ?', [o.id]);

  const data = await steadfast('/create_order', {
    method: 'POST',
    body: {
      invoice: o.order_number,
      recipient_name: o.customer_name.slice(0, 100),
      recipient_phone: phone,
      recipient_email: o.email || undefined,
      recipient_address: [o.address, o.city].filter(Boolean).join(', ').slice(0, 250),
      // Paid online → courier collects nothing
      cod_amount: o.payment_status === 'paid' ? 0 : Math.round(Number(o.total)),
      note: o.note ? o.note.slice(0, 250) : undefined,
      item_description: items.map((i) => `${i.product_name} x${i.quantity}`).join(', ').slice(0, 250),
    },
  });
  const c = data.consignment || {};
  if (!c.tracking_code) fail(`Steadfast: ${data.message || 'no tracking code returned'}`, 502);
  await changeOrderStatus(o.id, 'shipped', {
    courier: 'steadfast',
    courier_tracking_code: String(c.tracking_code),
    courier_consignment_id: c.consignment_id != null ? String(c.consignment_id) : null,
    courier_status: c.status || 'in_review',
    courier_booked_at: new Date(),
  });
  return { tracking_code: c.tracking_code, consignment_id: c.consignment_id, tracking_url: steadfastTrackingUrl(c.tracking_code) };
}

// Apply a Steadfast delivery status (from the webhook or a manual refresh) to the order
export async function applySteadfastStatus(order, deliveryStatus) {
  const courierStatus = String(deliveryStatus || '').toLowerCase();
  if (!courierStatus) return order;
  const next = STEADFAST_TO_ORDER[courierStatus];
  const extra = { courier_status: courierStatus };
  // Delivered COD parcel → the courier collected the money
  if (next === 'delivered' && order.payment_status === 'unpaid') extra.payment_status = 'paid';
  if (next && next !== order.status) {
    await changeOrderStatus(order.id, next, extra);
  } else {
    await pool.query(`UPDATE orders SET ${Object.keys(extra).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(extra), order.id]);
  }
  return { ...order, ...extra, status: next || order.status };
}

export async function refreshSteadfast(orderId) {
  const [[o]] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!o) fail('Order not found', 404);
  if (o.courier !== 'steadfast' || !o.courier_tracking_code) fail('This order has not been sent to Steadfast');
  const data = o.courier_consignment_id
    ? await steadfast(`/status_by_cid/${encodeURIComponent(o.courier_consignment_id)}`)
    : await steadfast(`/status_by_trackingcode/${encodeURIComponent(o.courier_tracking_code)}`);
  return applySteadfastStatus(o, data.delivery_status);
}

export async function steadfastBalance() {
  const data = await steadfast('/get_balance');
  return Number(data.current_balance || 0);
}

/* ---------- Customer delivery history (all couriers) ---------- */
// Already-fetched results for many phones at once (no API calls) — for the orders list
export async function cachedHistories(phones) {
  const list = [...new Set(phones.map(localPhone).filter((p) => /^01\d{9}$/.test(p)))].slice(0, 500);
  if (!list.length) return {};
  const [rows] = await pool.query('SELECT phone, data FROM courier_checks WHERE phone IN (?)', [list]);
  return Object.fromEntries(rows.map((r) => [r.phone, (typeof r.data === 'string' ? JSON.parse(r.data) : r.data).summary]));
}

const HISTORY_TTL = 6 * 60 * 60 * 1000;

const summarize = (row) => {
  const total = Number(row?.total_parcel || 0);
  const success = Number(row?.success_parcel || 0);
  const cancelled = Number(row?.cancelled_parcel || 0);
  return { total, success, cancelled, ratio: total ? Math.round((success / total) * 100) : 0 };
};

// Returns { phone, summary, couriers: [{ name, total, success, cancelled, ratio }], checked_at, cached }
export async function courierHistory(rawPhone, { force = false } = {}) {
  const phone = localPhone(rawPhone);
  if (!/^01\d{9}$/.test(phone)) fail('Enter an 11 digit phone number (01XXXXXXXXX)');

  if (!force) {
    const [[hit]] = await pool.query('SELECT data, checked_at FROM courier_checks WHERE phone = ?', [phone]);
    if (hit && Date.now() - new Date(hit.checked_at.replace(' ', 'T')).getTime() < HISTORY_TTL) {
      return { ...(typeof hit.data === 'string' ? JSON.parse(hit.data) : hit.data), cached: true };
    }
  }

  const s = await getSettings();
  const key = s.bdcourier_api_key || process.env.FRAUD_API_KEY;
  if (!key) fail('Add a BD Courier API key in Settings → Courier to check delivery history');
  let res;
  try {
    res = await fetch(process.env.BDCOURIER_URL || 'https://bdcourier.com/api/courier-check', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    fail(`Could not reach BD Courier (${err.message})`, 502);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === 'error') fail(`BD Courier: ${body.message || body.error || `HTTP ${res.status}`}`, 502);

  const raw = body.courierData || body.data || {};
  const couriers = Object.entries(raw)
    .filter(([k, v]) => k !== 'summary' && v && typeof v === 'object')
    .map(([k, v]) => ({ name: v.name || k, ...summarize(v) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const result = { phone, summary: summarize(raw.summary), couriers, checked_at: new Date().toISOString() };
  await pool.query(
    'INSERT INTO courier_checks (phone, data, checked_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE data = VALUES(data), checked_at = NOW()',
    [phone, JSON.stringify(result)]
  );
  return { ...result, cached: false };
}
