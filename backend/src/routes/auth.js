import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/db.js';
import { deleteFromR2, uploadToR2 } from '../config/r2.js';
import { protect, signToken } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { asyncHandler } from '../utils.js';

const router = Router();
export const publicUser = ({ password_hash, token_version, ...u }) => u;

// Shared with admin user management
export const passwordError = (password) => {
  if (!password || String(password).length < 6) return 'Password must be at least 6 characters';
  if (String(password).length > 100) return 'Password is too long';
  return null;
};
export const emailError = (email) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()) ? null : 'Enter a valid email address');

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  const bad = emailError(email) || passwordError(password);
  if (bad) return res.status(400).json({ message: bad });
  const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (exists.length) return res.status(409).json({ message: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('INSERT INTO users (name, email, phone, password_hash, last_login_at) VALUES (?,?,?,?,NOW())', [name.trim(), email.toLowerCase().trim(), phone || null, hash]);
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase().trim()]);
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (user.is_blocked) return res.status(403).json({ message: 'Your account has been blocked. Please contact support.' });
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', protect, asyncHandler(async (req, res) => {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json(publicUser(user));
}));

// Profile details only — the password has its own endpoint that checks the current password
router.put('/me', protect, asyncHandler(async (req, res) => {
  const { name, email, phone, address, city } = req.body;
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ message: 'Name is required' });
  if (email !== undefined) {
    const bad = emailError(email);
    if (bad) return res.status(400).json({ message: bad });
    const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email.toLowerCase().trim(), req.user.id]);
    if (taken.length) return res.status(409).json({ message: 'That email is already used by another account' });
  }
  await pool.query(
    'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = ?, address = ?, city = ? WHERE id = ?',
    [name ? String(name).trim() : null, email ? email.toLowerCase().trim() : null, phone || null, address || null, city || null, req.user.id]
  );
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json(publicUser(user));
}));

// Changing the password signs out every other device; this one gets a fresh token
router.put('/password', protect, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current_password || '', user.password_hash))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  const bad = passwordError(new_password);
  if (bad) return res.status(400).json({ message: bad });
  if (await bcrypt.compare(new_password, user.password_hash)) {
    return res.status(400).json({ message: 'New password must be different from the current one' });
  }
  await pool.query(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1, password_changed_at = NOW() WHERE id = ?',
    [await bcrypt.hash(new_password, 10), user.id]
  );
  const [[fresh]] = await pool.query('SELECT * FROM users WHERE id = ?', [user.id]);
  res.json({ token: signToken(fresh), user: publicUser(fresh) });
}));

// Profile photo — the previous one is removed from storage
router.post('/avatar', protect, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  if (req.file.size > 2 * 1024 * 1024) return res.status(400).json({ message: 'Image must be under 2 MB' });
  const key = `avatars/${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(req.file.originalname).toLowerCase()}`;
  const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);
  const [[old]] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
  await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [url, req.user.id]);
  if (old?.avatar) deleteFromR2(old.avatar).catch(() => {});
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json(publicUser(user));
}));

router.delete('/avatar', protect, asyncHandler(async (req, res) => {
  const [[old]] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
  await pool.query('UPDATE users SET avatar = NULL WHERE id = ?', [req.user.id]);
  if (old?.avatar) deleteFromR2(old.avatar).catch(() => {});
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json(publicUser(user));
}));

// Sign out of every device, including this one
router.post('/logout-all', protect, asyncHandler(async (req, res) => {
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
}));

export default router;
