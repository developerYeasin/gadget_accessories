import { Router } from 'express';
import pool from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler, formatProduct } from '../utils.js';

const router = Router();
router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT p.* FROM wishlists w JOIN products p ON p.id = w.product_id WHERE w.user_id = ? ORDER BY w.created_at DESC',
    [req.user.id]
  );
  res.json(rows.map(formatProduct));
}));

router.post('/sync', asyncHandler(async (req, res) => {
  const ids = (req.body.product_ids || []).map(Number).filter(Boolean);
  for (const id of ids) {
    await pool.query('INSERT IGNORE INTO wishlists (user_id, product_id) SELECT ?, id FROM products WHERE id = ?', [req.user.id, id]);
  }
  res.json({ ok: true });
}));

router.post('/:productId', asyncHandler(async (req, res) => {
  await pool.query('INSERT IGNORE INTO wishlists (user_id, product_id) VALUES (?,?)', [req.user.id, req.params.productId]);
  res.status(201).json({ ok: true });
}));

router.delete('/:productId', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.productId]);
  res.json({ ok: true });
}));

export default router;
