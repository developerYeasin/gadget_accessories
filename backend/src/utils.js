export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const slugify = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Returns { coupon, discount } or throws a 400 error explaining why the code can't be used
export async function applyCoupon(db, code, subtotal) {
  const [[c]] = await db.query('SELECT * FROM coupons WHERE code = ?', [String(code || '').trim().toUpperCase()]);
  const fail = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
  if (!c || !c.is_active) fail('Invalid coupon code');
  if (c.expires_at && new Date(c.expires_at.replace(' ', 'T')) < new Date()) fail('This coupon has expired');
  if (c.usage_limit != null && c.used_count >= c.usage_limit) fail('This coupon has reached its usage limit');
  if (subtotal < c.min_order) fail(`Minimum order ৳${c.min_order} required for this coupon`);
  let discount = c.type === 'percent' ? (subtotal * c.value) / 100 : c.value;
  if (c.max_discount != null) discount = Math.min(discount, c.max_discount);
  return { coupon: c, discount: Math.round(Math.min(discount, subtotal)) };
}

const parseJson = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

export const formatProduct = (p) => ({
  ...p,
  images: parseJson(p.images, p.image ? [p.image] : []),
  features: parseJson(p.features, []),
  is_featured: !!p.is_featured,
  is_flash_sale: !!p.is_flash_sale,
  is_active: !!p.is_active,
  discount: p.old_price && p.old_price > p.price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : 0,
});
