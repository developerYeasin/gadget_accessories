import { Router } from 'express';
import pool from '../config/db.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { applyCoupon, asyncHandler, deliveryCharge, itemWeight } from '../utils.js';
import { background, notifyAdmins } from '../services/push.js';
import { payConfig } from '../services/bizscalpay.js';
import { gatewayEnabled, mfsPayment } from '../services/payments.js';
import { trackServer } from '../services/serverTracking.js';

const router = Router();

const makeOrderNumber = () =>
  'GAH' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);

router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const { customer_name, phone, email, address, city, area = 'inside_dhaka', note, payment_method = 'cod', items, coupon_code, tracking = {} } = req.body;
  if (!customer_name || !phone || !address) return res.status(400).json({ message: 'Name, phone and address are required' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty' });
  if (!['cod', 'online', 'bkash', 'nagad', 'sslcommerz', 'mfs'].includes(payment_method)) return res.status(400).json({ message: 'Invalid payment method' });
  const available = payment_method === 'cod' || payment_method === 'mfs' || (payment_method === 'online' ? (await payConfig()).enabled : await gatewayEnabled(payment_method));
  if (!available) return res.status(400).json({ message: 'This payment method is not available right now' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const lines = [];
    for (const it of items) {
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const [[p]] = await conn.query('SELECT id, name, image, price, stock, weight, free_delivery FROM products WHERE id = ? AND is_active = 1 FOR UPDATE', [it.product_id]);
      if (!p) throw Object.assign(new Error('A product in your cart is no longer available'), { status: 400 });
      const [variants] = await conn.query('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 FOR UPDATE', [p.id]);
      if (variants.length) {
        // Products with variants must be bought as a specific variant, at that variant's price and stock
        const v = variants.find((x) => x.id === Number(it.variant_id));
        if (!v) throw Object.assign(new Error(`Please choose an option for "${p.name}"`), { status: 400 });
        if (v.stock < qty) throw Object.assign(new Error(`Only ${v.stock} left of "${p.name} — ${v.name}"`), { status: 400 });
        lines.push({ ...p, price: v.price, image: v.image || p.image, variant_id: v.id, variant_name: v.name, qty });
      } else {
        if (p.stock < qty) throw Object.assign(new Error(`Only ${p.stock} left of "${p.name}"`), { status: 400 });
        lines.push({ ...p, variant_id: null, variant_name: null, qty });
      }
    }
    const [settingRows] = await conn.query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'delivery%'");
    const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
    const delivery = lines.some((l) => l.free_delivery) ? 0 : deliveryCharge(s, area, lines.reduce((g, l) => g + itemWeight(s, l.weight) * l.qty, 0));
    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    let discount = 0;
    let couponCode = null;
    if (coupon_code) {
      const applied = await applyCoupon(conn, coupon_code, subtotal);
      discount = applied.discount;
      couponCode = applied.coupon.code;
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [applied.coupon.id]);
    }
    const total = subtotal + delivery - discount;
    const orderNumber = makeOrderNumber();
    // Send Money: the admin confirms the Transaction ID before marking the order paid
    const mfs = payment_method === 'mfs' ? await mfsPayment(conn, req.body.mfs || {}) : null;

    const [r] = await conn.query(
      `INSERT INTO orders (order_number, user_id, customer_name, phone, email, address, city, area, note, subtotal, delivery_charge, discount, coupon_code, total, payment_method, payment_ref)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNumber, req.user?.id || null, customer_name, phone, email || null, address, city || null,
        area === 'outside_dhaka' ? 'outside_dhaka' : 'inside_dhaka', note || null, subtotal, delivery, discount, couponCode, total, mfs ? mfs.method : payment_method, mfs ? mfs.ref : null]
    );
    for (const l of lines) {
      await conn.query('INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, product_image, price, quantity) VALUES (?,?,?,?,?,?,?,?)',
        [r.insertId, l.id, l.variant_id, l.variant_name ? `${l.name} — ${l.variant_name}` : l.name, l.variant_name, l.image, l.price, l.qty]);
      await conn.query('UPDATE products SET stock = GREATEST(stock - ?, 0), sold_count = sold_count + ? WHERE id = ?', [l.qty, l.qty, l.id]);
      if (l.variant_id) await conn.query('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [l.qty, l.variant_id]);
    }
    await conn.commit();
    res.status(201).json({ order_number: orderNumber, total });
    background(notifyAdmins({
      title: `🛒 New order #${orderNumber}`,
      body: `${customer_name} · ৳${Number(total).toLocaleString('en-US')} · ${lines.reduce((n, l) => n + l.qty, 0)} item(s)`,
      url: '/admin/orders',
      tag: `order-${orderNumber}`,
    }));
    // Server copy of the browser's Purchase pixel (same event id = order number, so it is counted once)
    const t = typeof tracking === 'object' && tracking ? tracking : {};
    trackServer({
      event: 'Purchase',
      eventId: orderNumber,
      req,
      url: typeof t.url === 'string' ? t.url.slice(0, 1000) : undefined,
      user: { email, phone, name: customer_name, city, external_id: req.user?.id, fbp: t.fbp, fbc: t.fbc, ttp: t.ttp, ttclid: t.ttclid },
      data: {
        value: total,
        order_id: orderNumber,
        items: lines.map((l) => ({ id: `GAH-${l.id}`, name: l.name, price: Number(l.price), quantity: l.qty })),
      },
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// Delivery charge for a cart, using product weights from the database
router.post('/quote', asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
  const ids = [...new Set(items.map((i) => Number(i.product_id)).filter(Boolean))];
  const [rows] = ids.length ? await pool.query('SELECT id, weight, free_delivery FROM products WHERE id IN (?)', [ids]) : [[]];
  const [settingRows] = await pool.query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'delivery%'");
  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const w = Object.fromEntries(rows.map((r) => [r.id, r.weight]));
  const grams = items.reduce((g, i) => (w[Number(i.product_id)] === undefined ? g
    : g + itemWeight(s, w[Number(i.product_id)]) * Math.max(1, Math.floor(Number(i.quantity) || 1))), 0);
  const free = rows.some((r) => r.free_delivery);
  res.json({ weight: grams, free_delivery: free, inside_dhaka: free ? 0 : deliveryCharge(s, 'inside_dhaka', grams), outside_dhaka: free ? 0 : deliveryCharge(s, 'outside_dhaka', grams) });
}));

router.get('/my', protect, asyncHandler(async (req, res) => {
  const [orders] = await pool.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(orders);
}));

// Track: owner, admin, or anyone who knows the order's phone number
router.get('/:orderNumber', optionalAuth, asyncHandler(async (req, res) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE order_number = ?', [req.params.orderNumber]);
  const allowed = order && (
    req.user?.role === 'admin' ||
    (req.user && order.user_id === req.user.id) ||
    (req.query.phone && req.query.phone === order.phone)
  );
  if (!allowed) return res.status(404).json({ message: 'Order not found' });
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  res.json({ ...order, items });
}));

export default router;
