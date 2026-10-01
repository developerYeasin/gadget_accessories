import { Router } from 'express';
import pool from '../config/db.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { applyCoupon, asyncHandler } from '../utils.js';

const router = Router();

const makeOrderNumber = () =>
  'GAH' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);

router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const { customer_name, phone, email, address, city, area = 'inside_dhaka', note, payment_method = 'cod', items, coupon_code } = req.body;
  if (!customer_name || !phone || !address) return res.status(400).json({ message: 'Name, phone and address are required' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const lines = [];
    for (const it of items) {
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const [[p]] = await conn.query('SELECT id, name, image, price, stock FROM products WHERE id = ? AND is_active = 1 FOR UPDATE', [it.product_id]);
      if (!p) throw Object.assign(new Error('A product in your cart is no longer available'), { status: 400 });
      if (p.stock < qty) throw Object.assign(new Error(`Only ${p.stock} left of "${p.name}"`), { status: 400 });
      lines.push({ ...p, qty });
    }
    const [settingRows] = await conn.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('delivery_inside_dhaka','delivery_outside_dhaka')");
    const s = Object.fromEntries(settingRows.map((r) => [r.key, Number(r.value)]));
    const delivery = area === 'outside_dhaka' ? s.delivery_outside_dhaka ?? 120 : s.delivery_inside_dhaka ?? 60;
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

    const [r] = await conn.query(
      `INSERT INTO orders (order_number, user_id, customer_name, phone, email, address, city, area, note, subtotal, delivery_charge, discount, coupon_code, total, payment_method)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNumber, req.user?.id || null, customer_name, phone, email || null, address, city || null,
        area === 'outside_dhaka' ? 'outside_dhaka' : 'inside_dhaka', note || null, subtotal, delivery, discount, couponCode, total, payment_method]
    );
    for (const l of lines) {
      await conn.query('INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity) VALUES (?,?,?,?,?,?)',
        [r.insertId, l.id, l.name, l.image, l.price, l.qty]);
      await conn.query('UPDATE products SET stock = stock - ?, sold_count = sold_count + ? WHERE id = ?', [l.qty, l.qty, l.id]);
    }
    await conn.commit();
    res.status(201).json({ order_number: orderNumber, total });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
