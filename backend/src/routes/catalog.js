import { Router } from 'express';
import pool from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { applyCoupon, asyncHandler, formatProduct, formatVariant, VARIANT_COUNT_SQL } from '../utils.js';
import { publicSettings } from '../services/settings.js';

const router = Router();

router.get('/categories', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
     FROM categories c ORDER BY c.sort_order, c.name`
  );
  res.json(rows);
}));

router.get('/categories/:slug', asyncHandler(async (req, res) => {
  const [[cat]] = await pool.query('SELECT * FROM categories WHERE slug = ?', [req.params.slug]);
  if (!cat) return res.status(404).json({ message: 'Category not found' });
  res.json(cat);
}));

const SORTS = {
  popularity: 'p.sold_count DESC',
  newest: 'p.created_at DESC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  rating: 'p.rating DESC',
};

router.get('/products', asyncHandler(async (req, res) => {
  const { category, q, sort = 'popularity', min, max, brand, flash, featured, offers, in_stock } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 12));
  const where = ['p.is_active = 1'];
  const params = [];
  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (q) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR c.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (min) { where.push('p.price >= ?'); params.push(Number(min)); }
  if (max) { where.push('p.price <= ?'); params.push(Number(max)); }
  if (brand) { where.push('p.brand IN (?)'); params.push(String(brand).split(',')); }
  if (flash === '1') where.push('p.is_flash_sale = 1');
  if (featured === '1') where.push('p.is_featured = 1');
  if (offers === '1') where.push('p.old_price > p.price');
  if (in_stock === '1') where.push('p.stock > 0');
  const whereSql = where.join(' AND ');
  const from = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) total ${from} WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, ${VARIANT_COUNT_SQL} ${from} WHERE ${whereSql}
     ORDER BY ${SORTS[sort] || SORTS.popularity} LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  const [brands] = await pool.query(`SELECT DISTINCT p.brand ${from} WHERE p.is_active = 1 ${category ? 'AND c.slug = ?' : ''} AND p.brand IS NOT NULL ORDER BY p.brand`, category ? [category] : []);
  res.json({ products: rows.map(formatProduct), total, page, pages: Math.ceil(total / limit), brands: brands.map((b) => b.brand) });
}));

router.get('/products/:slug', asyncHandler(async (req, res) => {
  const [[p]] = await pool.query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p
     LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.is_active = 1`,
    [req.params.slug]
  );
  if (!p) return res.status(404).json({ message: 'Product not found' });
  const [related] = await pool.query(
    `SELECT p.*, ${VARIANT_COUNT_SQL} FROM products p WHERE p.category_id = ? AND p.id <> ? AND p.is_active = 1 ORDER BY p.sold_count DESC LIMIT 4`,
    [p.category_id, p.id]
  );
  const [reviews] = await pool.query(
    'SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? AND r.is_approved = 1 ORDER BY r.created_at DESC LIMIT 30',
    [p.id]
  );
  const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY sort_order, id', [p.id]);
  res.json({ product: { ...formatProduct(p), variant_count: variants.length, variants: variants.map(formatVariant) }, related: related.map(formatProduct), reviews });
}));

router.post('/products/:id/reviews', protect, asyncHandler(async (req, res) => {
  const rating = Number(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ message: 'Rating must be 1-5' });
  await pool.query('INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?,?,?,?)', [req.params.id, req.user.id, rating, req.body.comment || null]);
  // Blend the new review into the displayed rating
  await pool.query(
    'UPDATE products SET rating = ROUND((rating * review_count + ?) / (review_count + 1), 1), review_count = review_count + 1 WHERE id = ?',
    [rating, req.params.id]
  );
  res.status(201).json({ message: 'Review added' });
}));

router.get('/banners', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order');
  res.json(rows);
}));

router.get('/settings', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  res.json(publicSettings(rows));
}));

router.post('/coupons/validate', asyncHandler(async (req, res) => {
  const { discount, coupon } = await applyCoupon(pool, req.body.code, Number(req.body.subtotal) || 0);
  res.json({ code: coupon.code, discount });
}));

router.get('/pages/:slug', asyncHandler(async (req, res) => {
  const [[page]] = await pool.query('SELECT slug, title, content, updated_at FROM pages WHERE slug = ? AND is_active = 1', [req.params.slug]);
  if (!page) return res.status(404).json({ message: 'Page not found' });
  res.json(page);
}));

router.post('/contact', asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !message) return res.status(400).json({ message: 'Name and message are required' });
  await pool.query('INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)', [name, email, phone, subject, message]);
  res.status(201).json({ message: 'Message sent. We will contact you soon!' });
}));

export default router;
