// One-off: upload bundled store images (backend/uploads/images) to Cloudflare R2
// and point every image column in the database at the R2 public URL.
// Usage: npm run images:r2   (safe to re-run)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { r2Enabled, r2PublicUrl, uploadToR2, contentTypeFor } from '../config/r2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..', 'uploads', 'images');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));

async function run() {
  if (!r2Enabled) throw new Error('R2 is not configured — fill R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL in backend/.env');

  const files = fs.existsSync(ROOT) ? walk(ROOT) : [];
  let done = 0;
  for (const file of files) {
    const key = `images/${path.relative(ROOT, file).split(path.sep).join('/')}`;
    await uploadToR2(key, fs.readFileSync(file), contentTypeFor(key));
    done++;
    if (done % 10 === 0 || done === files.length) console.log(`  uploaded ${done}/${files.length}`);
  }

  const from = '/uploads/images/';
  const to = `${r2PublicUrl}/images/`;
  const updates = [
    ['products', 'image'], ['products', 'images'], ['categories', 'image'], ['categories', 'banner_image'],
    ['banners', 'image'], ['order_items', 'product_image'],
  ];
  for (const [table, col] of updates) {
    const [r] = await pool.query(`UPDATE \`${table}\` SET \`${col}\` = REPLACE(\`${col}\`, ?, ?) WHERE \`${col}\` LIKE ?`, [from, to, `%${from}%`]);
    console.log(`  ${table}.${col}: ${r.affectedRows} rows → R2`);
  }
  console.log(`✔ ${done} images on R2 at ${to}`);
}

run()
  .catch((err) => { console.error('R2 migration failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
