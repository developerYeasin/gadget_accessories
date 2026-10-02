import { Router } from 'express';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/db.js';
import { uploadToR2 } from '../config/r2.js';
import { background, notifyOrder } from '../services/push.js';
import { protect, adminOnly } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { asyncHandler, formatProduct, formatVariant, slugify, VARIANT_COUNT_SQL } from '../utils.js';

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

router.post('/upload', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const key = `uploads/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);
  res.status(201).json({ url });
}));

/* ---------- Products ---------- */
router.get('/products', asyncHandler(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name, ${VARIANT_COUNT_SQL} FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.name LIKE ? ORDER BY p.created_at DESC`, [q]);
  res.json(rows.map(formatProduct));
}));

router.get('/products/:id', asyncHandler(async (req, res) => {
  const [[p]] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ message: 'Product not found' });
  const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id', [p.id]);
  res.json({ ...formatProduct(p), variants: variants.map(formatVariant) });
}));

const cleanOptions = (options) => (Array.isArray(options) ? options : [])
  .map((o) => ({ name: String(o.name || '').trim(), values: [...new Set((o.values || []).map((v) => String(v).trim()).filter(Boolean))] }))
  .filter((o) => o.name && o.values.length);

const productFields = (b) => {
  const images = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
  const image = b.image || images[0] || null;
  return [
    b.category_id || null, b.name, b.slug ? slugify(b.slug) : slugify(b.name), b.brand || null,
    b.short_description || null, b.description || null, Number(b.price), b.old_price ? Number(b.old_price) : null,
    Number(b.stock) || 0, image, JSON.stringify(images.length ? images : image ? [image] : []),
    JSON.stringify(Array.isArray(b.features) ? b.features.filter(Boolean) : []),
    JSON.stringify(cleanOptions(b.options)),
    Number(b.rating) || 0, Number(b.review_count) || 0,
    b.is_featured ? 1 : 0, b.is_flash_sale ? 1 : 0, b.is_active === false ? 0 : 1,
    Math.max(0, Math.floor(Number(b.weight) || 0)),
  ];
};
const PRODUCT_COLS = 'category_id, name, slug, brand, short_description, description, price, old_price, stock, image, images, features, options, rating, review_count, is_featured, is_flash_sale, is_active, weight';

// Replace a product's variants with the submitted list (update by id, insert new, delete missing),
// then keep the product's price/stock in sync: lowest active variant price, total active stock.
async function saveVariants(conn, productId, variants) {
  if (!Array.isArray(variants)) return;
  const [existing] = await conn.query('SELECT id FROM product_variants WHERE product_id = ?', [productId]);
  const existingIds = new Set(existing.map((v) => v.id));
  const keep = [];
  for (const [i, v] of variants.entries()) {
    const name = String(v.name || '').trim() || Object.values(v.options || {}).join(' / ');
    if (!name) continue;
    const price = Number(v.price);
    if (!(price > 0)) throw Object.assign(new Error(`Price is required for variant "${name}"`), { status: 400 });
    const row = [name, JSON.stringify(v.options || {}), v.sku || null, price, v.old_price ? Number(v.old_price) : null,
      Math.max(0, Math.floor(Number(v.stock) || 0)), v.image || null, i, v.is_active === false ? 0 : 1];
    if (v.id && existingIds.has(Number(v.id))) {
      await conn.query('UPDATE product_variants SET name=?, options=?, sku=?, price=?, old_price=?, stock=?, image=?, sort_order=?, is_active=? WHERE id=?', [...row, v.id]);
      keep.push(Number(v.id));
    } else {
      const [r] = await conn.query('INSERT INTO product_variants (name, options, sku, price, old_price, stock, image, sort_order, is_active, product_id) VALUES (?,?,?,?,?,?,?,?,?,?)', [...row, productId]);
      keep.push(r.insertId);
    }
  }
  const remove = [...existingIds].filter((id) => !keep.includes(id));
  if (remove.length) await conn.query('DELETE FROM product_variants WHERE id IN (?)', [remove]);

  const [[agg]] = await conn.query(
    `SELECT COUNT(*) n, COALESCE(SUM(stock),0) stock,
      (SELECT price FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY price LIMIT 1) price,
      (SELECT old_price FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY price LIMIT 1) old_price
     FROM product_variants WHERE product_id = ? AND is_active = 1`, [productId, productId, productId]);
  if (agg.n > 0) await conn.query('UPDATE products SET price = ?, old_price = ?, stock = ? WHERE id = ?', [agg.price, agg.old_price, agg.stock, productId]);
}

const withTransaction = async (fn) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

router.post('/products', asyncHandler(async (req, res) => {
  const hasVariants = Array.isArray(req.body.variants) && req.body.variants.length > 0;
  if (!req.body.name || (!req.body.price && !hasVariants)) return res.status(400).json({ message: 'Name and price are required' });
  const id = await withTransaction(async (conn) => {
    const fields = productFields({ ...req.body, price: req.body.price || req.body.variants?.[0]?.price });
    const [r] = await conn.query(`INSERT INTO products (${PRODUCT_COLS}) VALUES (${PRODUCT_COLS.split(',').map(() => '?').join(',')})`, fields);
    await saveVariants(conn, r.insertId, req.body.variants);
    return r.insertId;
  });
  res.status(201).json({ id });
}));

router.put('/products/:id', asyncHandler(async (req, res) => {
  const set = PRODUCT_COLS.split(',').map((c) => `${c.trim()} = ?`).join(', ');
  await withTransaction(async (conn) => {
    await conn.query(`UPDATE products SET ${set} WHERE id = ?`, [...productFields({ ...req.body, price: req.body.price || req.body.variants?.[0]?.price }), req.params.id]);
    await saveVariants(conn, Number(req.params.id), req.body.variants);
  });
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
const STATUS_MESSAGES = {
  confirmed: '✅ Your order is confirmed. We are preparing it now.',
  processing: '📦 Your order is being packed.',
  shipped: '🚚 Your order is on the way!',
  delivered: '🎉 Your order has been delivered. Thank you for shopping with us!',
  cancelled: 'Your order has been cancelled. Contact us if this is unexpected.',
};
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
      const [items] = await conn.query('SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
      for (const it of items) {
        if (it.product_id) await conn.query('UPDATE products SET stock = GREATEST(stock + ?, 0), sold_count = GREATEST(sold_count - ?, 0) WHERE id = ?', [sign * it.quantity, sign * it.quantity, it.product_id]);
        if (it.variant_id) await conn.query('UPDATE product_variants SET stock = GREATEST(stock + ?, 0) WHERE id = ?', [sign * it.quantity, it.variant_id]);
      }
    }
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
    await conn.commit();
    res.json({ ok: true });
    if (status !== order.status && STATUS_MESSAGES[status]) {
      background(notifyOrder(order.id, {
        title: `Order #${order.order_number} ${status}`,
        body: STATUS_MESSAGES[status],
        url: `/track-order?order=${order.order_number}&phone=${encodeURIComponent(order.phone)}`,
        tag: `order-${order.order_number}`,
      }));
    }
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
