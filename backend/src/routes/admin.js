import { Router } from 'express';
import pool from '../config/db.js';
import { protect, adminOnly } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { asyncHandler, formatProduct, slugify } from '../utils.js';

const router = Router();
router.use(protect, adminOnly);

router.get('/stats', asyncHandler(async (_req, res) => {
  const [[counts]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM products) AS products,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
    (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'cancelled') AS revenue,
    (SELECT COUNT(*) FROM contact_messages WHERE is_read = 0) AS unread_messages,
    (SELECT COUNT(*) FROM products WHERE stock <= 5) AS low_stock,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE status <> 'cancelled' AND DATE(created_at) = CURDATE()) AS today_revenue,
    (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE()) AS today_orders,
    (SELECT COUNT(*) FROM reviews) AS reviews,
    (SELECT COUNT(*) FROM orders WHERE payment_status = 'unpaid' AND status = 'delivered') AS unpaid_delivered`);
  const [lowStock] = await pool.query('SELECT id, name, image, stock FROM products WHERE stock <= 5 ORDER BY stock LIMIT 6');
  const [recent] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8');
  res.json({ ...counts, recent_orders: recent, low_stock_items: lowStock });
}));

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

/* ---------- Products ---------- */
router.get('/products', asyncHandler(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.name LIKE ? ORDER BY p.created_at DESC`, [q]);
  res.json(rows.map(formatProduct));
}));

const productFields = (b) => {
  const images = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
  const image = b.image || images[0] || null;
  return [
    b.category_id || null, b.name, b.slug ? slugify(b.slug) : slugify(b.name), b.brand || null,
    b.short_description || null, b.description || null, Number(b.price), b.old_price ? Number(b.old_price) : null,
    Number(b.stock) || 0, image, JSON.stringify(images.length ? images : image ? [image] : []),
    JSON.stringify(Array.isArray(b.features) ? b.features.filter(Boolean) : []),
    Number(b.rating) || 0, Number(b.review_count) || 0,
    b.is_featured ? 1 : 0, b.is_flash_sale ? 1 : 0, b.is_active === false ? 0 : 1,
  ];
};
const PRODUCT_COLS = 'category_id, name, slug, brand, short_description, description, price, old_price, stock, image, images, features, rating, review_count, is_featured, is_flash_sale, is_active';

router.post('/products', asyncHandler(async (req, res) => {
  if (!req.body.name || !req.body.price) return res.status(400).json({ message: 'Name and price are required' });
  const [r] = await pool.query(`INSERT INTO products (${PRODUCT_COLS}) VALUES (${PRODUCT_COLS.split(',').map(() => '?').join(',')})`, productFields(req.body));
  res.status(201).json({ id: r.insertId });
}));

router.put('/products/:id', asyncHandler(async (req, res) => {
  const set = PRODUCT_COLS.split(',').map((c) => `${c.trim()} = ?`).join(', ');
  await pool.query(`UPDATE products SET ${set} WHERE id = ?`, [...productFields(req.body), req.params.id]);
  res.json({ ok: true });
}));

router.delete('/products/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Categories ---------- */
router.post('/categories', asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ message: 'Name is required' });
  const [r] = await pool.query(
    'INSERT INTO categories (name, slug, image, banner_image, banner_title, banner_subtitle, sort_order) VALUES (?,?,?,?,?,?,?)',
    [b.name, slugify(b.slug || b.name), b.image || null, b.banner_image || null, b.banner_title || null, b.banner_subtitle || null, Number(b.sort_order) || 0]
  );
  res.status(201).json({ id: r.insertId });
}));

router.put('/categories/:id', asyncHandler(async (req, res) => {
  const b = req.body;
  await pool.query(
    'UPDATE categories SET name=?, slug=?, image=?, banner_image=?, banner_title=?, banner_subtitle=?, sort_order=? WHERE id=?',
    [b.name, slugify(b.slug || b.name), b.image || null, b.banner_image || null, b.banner_title || null, b.banner_subtitle || null, Number(b.sort_order) || 0, req.params.id]
  );
  res.json({ ok: true });
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Banners ---------- */
router.get('/banners', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM banners ORDER BY sort_order');
  res.json(rows);
}));

router.post('/banners', asyncHandler(async (req, res) => {
  const b = req.body;
  const [r] = await pool.query('INSERT INTO banners (line1, highlight, line2, image, link, sort_order, is_active) VALUES (?,?,?,?,?,?,?)',
    [b.line1, b.highlight, b.line2, b.image, b.link || '/shop', Number(b.sort_order) || 0, b.is_active === false ? 0 : 1]);
  res.status(201).json({ id: r.insertId });
}));

router.put('/banners/:id', asyncHandler(async (req, res) => {
  const b = req.body;
  await pool.query('UPDATE banners SET line1=?, highlight=?, line2=?, image=?, link=?, sort_order=?, is_active=? WHERE id=?',
    [b.line1, b.highlight, b.line2, b.image, b.link || '/shop', Number(b.sort_order) || 0, b.is_active === false ? 0 : 1, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/banners/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM banners WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Orders ---------- */
router.get('/orders', asyncHandler(async (req, res) => {
  const { status, payment, q } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (payment) { where.push('o.payment_status = ?'); params.push(payment); }
  if (q) { where.push('(o.order_number LIKE ? OR o.phone LIKE ? OR o.customer_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const [rows] = await pool.query(
    `SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count FROM orders o
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.created_at DESC LIMIT 500`, params);
  res.json(rows);
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  res.json({ ...order, items });
}));

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
router.put('/orders/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    // Return stock when an order is cancelled (and take it again if un-cancelled)
    if (status !== order.status && (status === 'cancelled' || order.status === 'cancelled')) {
      const sign = status === 'cancelled' ? 1 : -1;
      const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
      for (const it of items) {
        if (it.product_id) await conn.query('UPDATE products SET stock = stock + ?, sold_count = GREATEST(sold_count - ?, 0) WHERE id = ?', [sign * it.quantity, sign * it.quantity, it.product_id]);
      }
    }
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

/* ---------- Customers, messages, settings ---------- */
router.get('/customers', asyncHandler(async (req, res) => {
  const role = req.query.role === 'admin' ? 'admin' : 'customer';
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.city, u.role, u.is_blocked, u.created_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
      (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.status <> 'cancelled') AS total_spent
     FROM users u WHERE u.role = ? AND (u.name LIKE ? OR u.email LIKE ? OR COALESCE(u.phone,'') LIKE ?) ORDER BY u.created_at DESC`, [role, q, q, q]);
  res.json(rows);
}));

router.get('/messages', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
  res.json(rows);
}));

router.put('/messages/:id/read', asyncHandler(async (req, res) => {
  await pool.query('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    await pool.query('INSERT INTO settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)', [k, v]);
  }
  res.json({ ok: true });
}));

export default router;
