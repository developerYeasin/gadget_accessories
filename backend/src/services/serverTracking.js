// Server-side copies of pixel events: Meta Conversions API and TikTok Events API.
// Ad blockers and iOS stop many browser pixels; these reach the platforms from our server instead.
// Each event carries the same event id the browser pixel used, so the platform counts the pair once.
// Best-effort only — a tracking failure must never affect a page or an order.
import crypto from 'crypto';
import { getSettings } from './settings.js';

const FB_API = 'https://graph.facebook.com/v22.0';
const TIKTOK_API = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const CURRENCY = 'BDT';

// Browser event names (Meta's) → TikTok's
const TIKTOK_EVENTS = {
  PageView: null, ViewContent: 'ViewContent', AddToCart: 'AddToCart', AddToWishlist: 'AddToWishlist',
  InitiateCheckout: 'InitiateCheckout', Search: 'Search', Purchase: 'CompletePayment', CompleteRegistration: 'CompleteRegistration',
};
export const EVENTS = new Set(Object.keys(TIKTOK_EVENTS));

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const hash = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s ? sha(s) : undefined;
};
// Hashed in E.164 without "+": 01XXXXXXXXX → 8801XXXXXXXXX
const hashPhone = (v) => {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return undefined;
  if (d.length === 11 && d.startsWith('01')) d = `88${d}`;
  return sha(d);
};

const clientIp = (req) => {
  const xff = req?.headers?.['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : req?.ip) || undefined;
};

/**
 * @param {object} e
 * @param {string} e.event       Meta standard event name (Purchase, AddToCart, ...)
 * @param {string} e.eventId     dedup key, same as the browser pixel's
 * @param {object} [e.req]       request (IP + user agent)
 * @param {string} [e.url]       page the event happened on
 * @param {object} [e.user]      { email, phone, name, city, external_id, fbp, fbc, ttp, ttclid }
 * @param {object} [e.data]      { value, items: [{ id, name, price, quantity }], order_id, search }
 */
export async function trackServer({ event, eventId, req, url, user = {}, data = {} }) {
  try {
    if (!EVENTS.has(event)) return;
    const s = await getSettings();
    const fb = { pixel: String(s.fb_pixel_id || '').trim(), token: String(s.fb_capi_token || '').trim() };
    const tt = { pixel: String(s.tiktok_pixel_id || '').trim(), token: String(s.tiktok_access_token || '').trim() };
    if (!(fb.pixel && fb.token) && !(tt.pixel && tt.token)) return;

    const ip = clientIp(req);
    const ua = req?.headers?.['user-agent'];
    const time = Math.floor(Date.now() / 1000);
    const items = Array.isArray(data.items) ? data.items : [];
    const [first, ...rest] = String(user.name || '').trim().split(/\s+/);
    const jobs = [];

    if (fb.pixel && fb.token) {
      const userData = {
        em: hash(user.email) && [hash(user.email)],
        ph: hashPhone(user.phone) && [hashPhone(user.phone)],
        fn: hash(first) && [hash(first)],
        ln: hash(rest.join(' ')) && [hash(rest.join(' '))],
        ct: hash(String(user.city || '').replace(/\s+/g, '')) && [hash(String(user.city || '').replace(/\s+/g, ''))],
        country: [sha('bd')],
        external_id: user.external_id ? [sha(String(user.external_id))] : undefined,
        client_ip_address: ip,
        client_user_agent: ua,
        fbp: user.fbp || undefined,
        fbc: user.fbc || undefined,
      };
      const custom = event === 'PageView' ? undefined : {
        currency: CURRENCY,
        value: Number(data.value) || 0,
        content_type: 'product',
        content_ids: items.map((i) => i.id),
        contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
        num_items: items.reduce((n, i) => n + (Number(i.quantity) || 0), 0) || undefined,
        order_id: data.order_id,
        search_string: data.search,
      };
      const body = {
        data: [{ event_name: event, event_time: time, event_id: eventId, action_source: 'website', event_source_url: url, user_data: userData, custom_data: custom }],
        test_event_code: s.fb_test_event_code || undefined,
      };
      jobs.push(post(`${FB_API}/${encodeURIComponent(fb.pixel)}/events?access_token=${encodeURIComponent(fb.token)}`, body, {}, 'Meta CAPI'));
    }

    const ttEvent = TIKTOK_EVENTS[event];
    if (tt.pixel && tt.token && ttEvent) {
      const body = {
        event_source: 'web',
        event_source_id: tt.pixel,
        data: [{
          event: ttEvent,
          event_time: time,
          event_id: eventId,
          user: {
            email: hash(user.email), phone: hashPhone(user.phone),
            external_id: user.external_id ? sha(String(user.external_id)) : undefined,
            ip, user_agent: ua, ttp: user.ttp || undefined, ttclid: user.ttclid || undefined,
          },
          page: url ? { url } : undefined,
          properties: {
            currency: CURRENCY,
            value: Number(data.value) || 0,
            content_type: 'product',
            contents: items.map((i) => ({ content_id: i.id, content_name: i.name, quantity: i.quantity, price: i.price })),
            order_id: data.order_id,
            query: data.search,
          },
        }],
      };
      jobs.push(post(TIKTOK_API, body, { 'Access-Token': tt.token }, 'TikTok Events API'));
    }
    await Promise.all(jobs);
  } catch (err) {
    console.error('[tracking]', err.message);
  }
}

async function post(url, body, headers, label) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    // TikTok answers 200 with a non-zero code on errors
    if (!res.ok || (data.code !== undefined && data.code !== 0)) console.error(`[tracking] ${label} rejected:`, JSON.stringify(data.error || data.message || data));
  } catch (err) {
    console.error(`[tracking] ${label} failed:`, err.message);
  }
}
