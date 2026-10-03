export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const formatVariant = (v) => ({
  ...v,
  options: parseJson(v.options, {}),
  is_active: !!v.is_active,
  discount: v.old_price && v.old_price > v.price ? Math.round(((v.old_price - v.price) / v.old_price) * 100) : 0,
});

// SQL snippet: number of active variants for product alias p
export const VARIANT_COUNT_SQL = '(SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count';

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
  options: parseJson(p.options, []),
  variant_count: Number(p.variant_count || 0),
  is_featured: !!p.is_featured,
  is_flash_sale: !!p.is_flash_sale,
  is_active: !!p.is_active,
  discount: p.old_price && p.old_price > p.price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : 0,
});

// Delivery: the area's charge covers the first `delivery_base_weight` grams, then each extra kg (or part) adds
// that area's per-kg charge. Products without a weight count as `delivery_default_weight`.
// Keep in sync with frontend/src/api/client.js
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
export const itemWeight = (s, weight) => (Number(weight) > 0 ? Number(weight) : num(s?.delivery_default_weight, 0));
export const deliveryCharge = (s, area, grams = 0) => {
  const outside = area === 'outside_dhaka';
  const base = outside ? num(s?.delivery_outside_dhaka, 130) : num(s?.delivery_inside_dhaka, 70);
  const perKg = outside ? num(s?.delivery_extra_kg_outside, 25) : num(s?.delivery_extra_kg_inside, 15);
  const over = grams - num(s?.delivery_base_weight, 1000);
  return base + (over > 0 ? Math.ceil(over / 1000) * perKg : 0);
};
