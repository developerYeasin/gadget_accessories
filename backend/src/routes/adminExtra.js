import { Router } from 'express';
import pool from '../config/db.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { asyncHandler, slugify } from '../utils.js';

const router = Router();
router.use(protect, adminOnly);

/* ---------- Reports ---------- */
router.get('/reports', asyncHandler(async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const valid = "status <> 'cancelled'";
  const since = 'created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)';

  const [daily] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
     FROM orders WHERE ${valid} AND ${since} GROUP BY DATE(created_at) ORDER BY day`, [days - 1]);
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue, COALESCE(AVG(total),0) AS avg_order,
       COALESCE(SUM(discount),0) AS discounts
     FROM orders WHERE ${valid} AND ${since}`, [days - 1]);
  const [[{ items }]] = await pool.query(
    `SELECT COALESCE(SUM(oi.quantity),0) AS items FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'cancelled' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, [days - 1]);
  const [statuses] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM orders WHERE ${since} GROUP BY status`, [days - 1]);
  const [topProducts] = await pool.query(
    `SELECT oi.product_id, oi.product_name, oi.product_image, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.price) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'cancelled' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY oi.product_id, oi.product_name, oi.product_image ORDER BY qty DESC LIMIT 10`, [days - 1]);
  const [byCategory] = await pool.query(
    `SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.price) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
     WHERE o.status <> 'cancelled' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY c.name ORDER BY revenue DESC`, [days - 1]);

  // Fill missing days with zero so the chart has a continuous axis
  const map = Object.fromEntries(daily.map((d) => [String(d.day).slice(0, 10), d]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    series.push({ day: key, orders: map[key]?.orders || 0, revenue: Number(map[key]?.revenue || 0) });
  }
  res.json({ days, summary: { ...summary, items }, series, statuses, topProducts, byCategory });
}));

/* ---------- Orders (edit / delete) ---------- */
router.put('/orders/:id', asyncHandler(async (req, res) => {
  const b = req.body;
  const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const pick = (k) => (b[k] !== undefined ? b[k] : order[k]);
  if (!['unpaid', 'paid', 'refunded'].includes(pick('payment_status'))) return res.status(400).json({ message: 'Invalid payment status' });
  await pool.query(
    'UPDATE orders SET customer_name=?, phone=?, email=?, address=?, city=?, payment_status=?, admin_note=? WHERE id=?',
    [pick('customer_name'), pick('phone'), pick('email'), pick('address'), pick('city'), pick('payment_status'), pick('admin_note'), order.id]
  );
  res.json({ ok: true });
}));

router.delete('/orders/:id', asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (order.status !== 'cancelled') {
      const [items] = await conn.query('SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
      for (const it of items) {
        if (it.product_id) await conn.query('UPDATE products SET stock = GREATEST(stock + ?, 0), sold_count = GREATEST(sold_count - ?, 0) WHERE id = ?', [it.quantity, it.quantity, it.product_id]);
        if (it.variant_id) await conn.query('UPDATE product_variants SET stock = GREATEST(stock + ?, 0) WHERE id = ?', [it.quantity, it.variant_id]);
      }
    }
    await conn.query('DELETE FROM orders WHERE id = ?', [order.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

/* ---------- Customers / staff ---------- */
router.get('/users/:id', asyncHandler(async (req, res) => {
  const [[u]] = await pool.query('SELECT id, name, email, phone, address, city, role, is_blocked, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ message: 'User not found' });
  const [orders] = await pool.query('SELECT id, order_number, total, status, payment_status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC', [u.id]);
  const spent = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0);
  res.json({ ...u, orders, total_spent: spent });
}));

router.put('/users/:id', asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ message: "You can't change your own account here" });
  const { role, is_blocked } = req.body;
  if (role !== undefined) {
    if (!['customer', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  }
  if (is_blocked !== undefined) await pool.query('UPDATE users SET is_blocked = ? WHERE id = ?', [is_blocked ? 1 : 0, req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Inventory ---------- */
router.put('/products/:id/stock', asyncHandler(async (req, res) => {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM product_variants WHERE product_id = ? AND is_active = 1', [req.params.id]);
  if (n > 0) return res.status(400).json({ message: "This product has variants — edit each variant's stock in the product form" });
  const stock = Math.max(0, Math.floor(Number(req.body.stock)));
  if (!Number.isFinite(stock)) return res.status(400).json({ message: 'Invalid stock' });
  await pool.query('UPDATE products SET stock = ? WHERE id = ?', [stock, req.params.id]);
  res.json({ ok: true });
}));

router.put('/products/:id/toggle', asyncHandler(async (req, res) => {
  const field = { active: 'is_active', featured: 'is_featured', flash: 'is_flash_sale' }[req.body.field];
  if (!field) return res.status(400).json({ message: 'Invalid field' });
  await pool.query(`UPDATE products SET ${field} = 1 - ${field} WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Coupons ---------- */
router.get('/coupons', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
  res.json(rows);
}));

const couponFields = (b) => [
  String(b.code || '').trim().toUpperCase(), b.type === 'fixed' ? 'fixed' : 'percent', Number(b.value) || 0,
  Number(b.min_order) || 0, b.max_discount ? Number(b.max_discount) : null, b.usage_limit ? Number(b.usage_limit) : null,
  b.expires_at || null, b.is_active === false ? 0 : 1,
];

router.post('/coupons', asyncHandler(async (req, res) => {
  if (!req.body.code || !(Number(req.body.value) > 0)) return res.status(400).json({ message: 'Code and value are required' });
  const [r] = await pool.query('INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, expires_at, is_active) VALUES (?,?,?,?,?,?,?,?)', couponFields(req.body));
  res.status(201).json({ id: r.insertId });
}));

router.put('/coupons/:id', asyncHandler(async (req, res) => {
  await pool.query('UPDATE coupons SET code=?, type=?, value=?, min_order=?, max_discount=?, usage_limit=?, expires_at=?, is_active=? WHERE id=?', [...couponFields(req.body), req.params.id]);
  res.json({ ok: true });
}));

router.delete('/coupons/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Reviews ---------- */
router.get('/reviews', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, u.name AS user_name, u.email AS user_email, p.name AS product_name, p.slug AS product_slug
     FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id ORDER BY r.created_at DESC`);
  res.json(rows);
}));

router.put('/reviews/:id', asyncHandler(async (req, res) => {
  await pool.query('UPDATE reviews SET is_approved = ? WHERE id = ?', [req.body.is_approved ? 1 : 0, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/reviews/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Pages ---------- */
router.get('/pages', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM pages ORDER BY title');
  res.json(rows);
}));

router.post('/pages', asyncHandler(async (req, res) => {
  const { title, slug, content, is_active } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required' });
  const [r] = await pool.query('INSERT INTO pages (slug, title, content, is_active) VALUES (?,?,?,?)', [slugify(slug || title), title, content || '', is_active === false ? 0 : 1]);
  res.status(201).json({ id: r.insertId });
}));

router.put('/pages/:id', asyncHandler(async (req, res) => {
  const { title, slug, content, is_active } = req.body;
  await pool.query('UPDATE pages SET slug=?, title=?, content=?, is_active=? WHERE id=?', [slugify(slug || title), title, content || '', is_active === false ? 0 : 1, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/pages/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM pages WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
