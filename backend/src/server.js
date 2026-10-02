import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './config/db.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import wishlistRoutes from './routes/wishlist.js';
import adminRoutes from './routes/admin.js';
import adminExtraRoutes from './routes/adminExtra.js';
import feedRoutes from './routes/feed.js';
import pushRoutes from './routes/push.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', true);

app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminExtraRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/push', pushRoutes);
app.use('/api', catalogRoutes);

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, _req, res, _next) => {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Duplicate entry (slug or email already exists)' });
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Server error' : err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API running on http://localhost:${PORT}`));
