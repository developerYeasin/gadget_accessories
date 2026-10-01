import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { protect, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils.js';

const router = Router();
const publicUser = ({ password_hash, ...u }) => u;

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (exists.length) return res.status(409).json({ message: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('INSERT INTO users (name, email, phone, password_hash) VALUES (?,?,?,?)', [name, email.toLowerCase(), phone || null, hash]);
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (user.is_blocked) return res.status(403).json({ message: 'Your account has been blocked. Please contact support.' });
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', protect, asyncHandler(async (req, res) => {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user || user.is_blocked) return res.status(401).json({ message: 'Session expired' });
  res.json(publicUser(user));
}));

router.put('/me', protect, asyncHandler(async (req, res) => {
  const { name, phone, address, city, password } = req.body;
  await pool.query('UPDATE users SET name = COALESCE(?, name), phone = ?, address = ?, city = ? WHERE id = ?', [name || null, phone || null, address || null, city || null, req.user.id]);
  if (password) {
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), req.user.id]);
  }
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json(publicUser(user));
}));

export default router;
