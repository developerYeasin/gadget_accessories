const BASE = import.meta.env.VITE_API_URL || '';

// Shown when a product/category has no image (inline so the frontend ships no image files)
const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280"><rect width="400" height="280" fill="#15130f"/><path d="M128 190 200 118l72 72h-30v-8h14l-56-56-56 56h14v8z" fill="#5a4718"/></svg>')}`;

export const imageUrl = (path) => {
  if (!path) return PLACEHOLDER;
  if (/^https?:\/\//.test(path)) return path;
  return path.startsWith('/uploads') ? `${BASE}${path}` : path;
};

// WhatsApp link from the admin-set number (01XXXXXXXXX or +8801...) or a full URL.
// Phones open the app via wa.me; desktops go straight to the WhatsApp Web chat (wa.me only shows a landing page there).
const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
export const waLink = (settings, text) => {
  const raw = String(settings?.whatsapp || settings?.phone || '').trim();
  if (/^https?:\/\//.test(raw)) return text ? `${raw}${raw.includes('?') ? '&' : '?'}text=${encodeURIComponent(text)}` : raw;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `88${digits}`;
  const msg = text ? encodeURIComponent(text) : '';
  if (!isMobile()) return `https://web.whatsapp.com/send?phone=${digits}${msg ? `&text=${msg}` : ''}`;
  return `https://wa.me/${digits}${msg ? `?text=${msg}` : ''}`;
};

export const DELIVERY_DEFAULTS = { inside: 70, outside: 130, baseWeight: 1000, perKgInside: 15, perKgOutside: 25 };
// The area's charge covers the first base weight; each extra kg (or part) adds that area's per-kg charge.
// Products without a weight count as the default weight. Keep in sync with backend/src/utils.js
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
export const deliveryRules = (settings, area) => {
  const outside = area === 'outside_dhaka';
  return {
    base: outside ? num(settings?.delivery_outside_dhaka, DELIVERY_DEFAULTS.outside) : num(settings?.delivery_inside_dhaka, DELIVERY_DEFAULTS.inside),
    perKg: outside ? num(settings?.delivery_extra_kg_outside, DELIVERY_DEFAULTS.perKgOutside) : num(settings?.delivery_extra_kg_inside, DELIVERY_DEFAULTS.perKgInside),
    baseWeight: num(settings?.delivery_base_weight, DELIVERY_DEFAULTS.baseWeight),
  };
};
export const deliveryCharge = (settings, area, grams = 0) => {
  const { base, perKg, baseWeight } = deliveryRules(settings, area);
  const over = grams - baseWeight;
  return base + (over > 0 ? Math.ceil(over / 1000) * perKg : 0);
};
export const itemWeight = (settings, weight) => (Number(weight) > 0 ? Number(weight) : num(settings?.delivery_default_weight, 0));
export const cartWeight = (cart, settings) => cart.reduce((g, i) => g + itemWeight(settings, i.weight) * i.quantity, 0);
export const formatWeight = (g) => (g >= 1000 ? `${+(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`);

export const money = (n) => '৳' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

async function request(method, url, body) {
  const token = localStorage.getItem('gah_token');
  const isForm = body instanceof FormData;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    signal: controller.signal,
    headers: {
      ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })
    .catch((err) => {
      throw new Error(err.name === 'AbortError' ? 'Server is taking too long. Please try again.' : 'Cannot reach the server. Please check your connection.');
    })
    .finally(() => clearTimeout(timer));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return request('POST', '/admin/upload', fd);
  },
};

export default api;
