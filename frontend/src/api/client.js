const BASE = import.meta.env.VITE_API_URL || '';

// Shown when a product/category has no image (inline so the frontend ships no image files)
const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280"><rect width="400" height="280" fill="#15130f"/><path d="M128 190 200 118l72 72h-30v-8h14l-56-56-56 56h14v8z" fill="#5a4718"/></svg>')}`;

export const imageUrl = (path) => {
  if (!path) return PLACEHOLDER;
  if (/^https?:\/\//.test(path)) return path;
  return path.startsWith('/uploads') ? `${BASE}${path}` : path;
};

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
