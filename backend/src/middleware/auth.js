import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = readUser(req);
  next();
}

// Also checks the account still exists, isn't blocked and the token wasn't revoked by a password change.
// Role is read from the database so a demoted admin loses access immediately.
export async function protect(req, res, next) {
  const payload = readUser(req);
  if (!payload) return res.status(401).json({ message: 'Please login first' });
  try {
    const [[u]] = await pool.query('SELECT id, name, role, is_blocked, token_version FROM users WHERE id = ?', [payload.id]);
    if (!u || u.is_blocked || (payload.tv ?? 0) !== u.token_version) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }
    req.user = { id: u.id, role: u.role, name: u.name };
    next();
  } catch (err) {
    next(err);
  }
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name, tv: user.token_version || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
