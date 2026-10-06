import { Router } from 'express';
import pool from '../config/db.js';
import { asyncHandler } from '../utils.js';

// Product catalog feeds for Facebook / Instagram Shop, TikTok Catalog and Google Merchant Center
const router = Router();

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;

async function loadFeed(req) {
  const [settingRows] = await pool.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('site_url','site_name')");
  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const site = (s.site_url || process.env.CLIENT_URL?.split(',')[0] || '').replace(/\/+$/, '');
  const api = `${req.protocol}://${req.get('host')}`;
  const abs = (path) => (!path ? '' : /^https?:\/\//.test(path) ? path : `${path.startsWith('/uploads') ? api : site}${path}`);
  const [products] = await pool.query(
    `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = 1 ORDER BY p.id`);
  const plainText = (html) => String(html || '').replace(/<(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
  const items = products.map((p) => {
    const onSale = p.old_price && p.old_price > p.price;
    return {
      id: `GAH-${p.id}`,
      title: p.name,
      // Descriptions are rich text (HTML) — feeds want plain text
      description: plainText(p.description) || p.short_description || p.name,
      link: `${site}/product/${p.slug}`,
      image: abs(p.image),
      brand: p.brand || s.site_name || 'Gadget Accessories Home',
      availability: p.stock > 0 ? 'in stock' : 'out of stock',
      // Regular price is the higher one; the current price becomes the sale price
      price: `${Number(onSale ? p.old_price : p.price).toFixed(2)} BDT`,
      sale_price: onSale ? `${Number(p.price).toFixed(2)} BDT` : '',
      category: p.category_name || '',
    };
  });
  return { items, site, siteName: s.site_name || 'Gadget Accessories Home' };
}

// RSS 2.0 with Google namespace — accepted by Facebook, TikTok and Google Merchant Center
router.get('/products.xml', asyncHandler(async (req, res) => {
  const { items, site, siteName } = await loadFeed(req);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${esc(siteName)}</title>
<link>${esc(site)}</link>
<description>${esc(siteName)} product catalog</description>
${items.map((i) => `<item>
  <g:id>${esc(i.id)}</g:id>
  <g:title>${esc(i.title)}</g:title>
  <g:description>${esc(i.description)}</g:description>
  <g:link>${esc(i.link)}</g:link>
  <g:image_link>${esc(i.image)}</g:image_link>
  <g:brand>${esc(i.brand)}</g:brand>
  <g:condition>new</g:condition>
  <g:availability>${i.availability}</g:availability>
  <g:price>${i.price}</g:price>${i.sale_price ? `\n  <g:sale_price>${i.sale_price}</g:sale_price>` : ''}
  <g:product_type>${esc(i.category)}</g:product_type>
</item>`).join('\n')}
</channel>
</rss>`;
  res.type('application/xml').send(xml);
}));

// TikTok Catalog CSV template columns
router.get('/tiktok.csv', asyncHandler(async (req, res) => {
  const { items } = await loadFeed(req);
  const head = ['sku_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'product_type'];
  const rows = items.map((i) => [i.id, i.title, i.description, i.availability, 'new', i.price, i.sale_price, i.link, i.image, i.brand, i.category].map(csv).join(','));
  res.type('text/csv').send([head.join(','), ...rows].join('\n'));
}));

export default router;
