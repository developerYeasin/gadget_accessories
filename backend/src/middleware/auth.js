import jwt from 'jsonwebtoken';

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

export function protect(req, res, next) {
  req.user = readUser(req);
  if (!req.user) return res.status(401).json({ message: 'Please login first' });
  next();
}

export function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
