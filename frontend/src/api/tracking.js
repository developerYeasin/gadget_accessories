// Marketing pixels: Facebook (Meta) Pixel, TikTok Pixel, Google Analytics 4 and Google Tag Manager.
// IDs come from admin Settings. Every store event is sent to each enabled platform and pushed
// to the GTM dataLayer in GA4 ecommerce format. Meta/TikTok events are also posted to our server
// (/api/track), which forwards them through the Conversions API / Events API with the same event id.

const VALID = {
  fb: /^\d{5,20}$/,
  tiktok: /^[A-Z0-9]{10,30}$/i,
  ga4: /^G-[A-Z0-9]{4,20}$/i,
  gtm: /^GTM-[A-Z0-9]{4,12}$/i,
};

const enabled = { fb: false, tiktok: false, ga4: false, gtm: false };
let initialized = false;

const BASE = import.meta.env.VITE_API_URL || '';
const newEventId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const cookie = (name) => (document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`)) || [])[1];

// Click ids from the landing URL, kept for the session so the server events can be attributed
const clickIds = () => {
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ['fbclid', 'ttclid']) if (q.get(k)) sessionStorage.setItem(`gah_${k}`, q.get(k));
    return { fbclid: sessionStorage.getItem('gah_fbclid'), ttclid: sessionStorage.getItem('gah_ttclid') };
  } catch {
    return {};
  }
};

// Browser identifiers the server-side events need for matching (sent with orders too)
export function trackingContext() {
  if (typeof window === 'undefined') return {};
  const { fbclid, ttclid } = clickIds();
  return {
    url: window.location.href,
    fbp: cookie('_fbp'),
    fbc: cookie('_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined),
    ttp: cookie('_ttp'),
    ttclid: ttclid || undefined,
  };
}

function sendServer(event, eventId, { items = [], value = 0, search } = {}) {
  if (!enabled.fb && !enabled.tiktok) return;
  const token = localStorage.getItem('gah_token');
  fetch(`${BASE}/api/track`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      event, event_id: eventId, value, search, ...trackingContext(),
      items: items.map((i) => ({ id: i.item_id, name: i.item_name, price: i.price, quantity: i.quantity })),
    }),
  }).catch(() => {});
}

const addScript = (src) => {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
};

export function initTracking(settings) {
  if (initialized || !settings || typeof window === 'undefined') return;
  initialized = true;
  const fb = String(settings.fb_pixel_id || '').trim();
  const tiktok = String(settings.tiktok_pixel_id || '').trim();
  const ga4 = String(settings.ga4_id || '').trim();
  const gtm = String(settings.gtm_id || '').trim();

  window.dataLayer = window.dataLayer || [];
  clickIds();

  if (VALID.gtm.test(gtm)) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`);
    enabled.gtm = true;
  }

  if (VALID.ga4.test(ga4)) {
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ga4, { send_page_view: false });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`);
    enabled.ga4 = true;
  }

  if (VALID.fb.test(fb)) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', fb);
    enabled.fb = true;
  }

  if (VALID.tiktok.test(tiktok)) {
    /* eslint-disable */
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; };
      ttq.load = function (e, n) {
        var i = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        var o = d.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = i + '?sdkid=' + e + '&lib=' + t;
        var a = d.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a);
      };
    }(window, document, 'ttq');
    /* eslint-enable */
    window.ttq.load(tiktok);
    enabled.tiktok = true;
  }
}

/* ---------- Event helpers ---------- */
const CURRENCY = 'BDT';
const toItem = (p, quantity = 1) => ({
  item_id: `GAH-${p.id}`,
  item_name: p.name,
  item_brand: p.brand || undefined,
  item_category: p.category_name || undefined,
  price: Number(p.price),
  quantity,
});

function send({ ga, fb, tt, items = [], value = 0, extra = {}, eventId = newEventId() }) {
  const ids = items.map((i) => i.item_id);
  const contents = items.map((i) => ({ id: i.item_id, quantity: i.quantity, item_price: i.price }));

  if (enabled.gtm || enabled.ga4) {
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event: ga, ecommerce: { currency: CURRENCY, value, items, ...extra } });
  }
  if (enabled.ga4 && window.gtag) window.gtag('event', ga, { currency: CURRENCY, value, items, ...extra });
  if (enabled.fb && window.fbq && fb) {
    window.fbq('track', fb, { content_ids: ids, contents, content_type: 'product', currency: CURRENCY, value, ...(extra.search_term ? { search_string: extra.search_term } : {}) }, eventId ? { eventID: eventId } : undefined);
  }
  if (enabled.tiktok && window.ttq && tt) {
    window.ttq.track(tt, {
      contents: items.map((i) => ({ content_id: i.item_id, content_name: i.item_name, quantity: i.quantity, price: i.price })),
      content_type: 'product', currency: CURRENCY, value, ...(extra.search_term ? { query: extra.search_term } : {}),
    }, eventId ? { event_id: eventId } : undefined);
  }
  // Purchase is sent server-side by the order itself
  if (fb && fb !== 'Purchase') sendServer(fb, eventId, { items, value, search: extra.search_term });
}

export const track = {
  pageView(path) {
    if (enabled.gtm) window.dataLayer.push({ event: 'page_view', page_path: path });
    if (enabled.ga4 && window.gtag) window.gtag('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title });
    const eventId = newEventId();
    if (enabled.fb && window.fbq) window.fbq('track', 'PageView', {}, { eventID: eventId });
    if (enabled.tiktok && window.ttq) window.ttq.page();
    sendServer('PageView', eventId);
  },
  viewItem(p) {
    const item = toItem(p);
    send({ ga: 'view_item', fb: 'ViewContent', tt: 'ViewContent', items: [item], value: item.price });
  },
  addToCart(p, qty = 1) {
    const item = toItem(p, qty);
    send({ ga: 'add_to_cart', fb: 'AddToCart', tt: 'AddToCart', items: [item], value: item.price * qty });
  },
  addToWishlist(p) {
    const item = toItem(p);
    send({ ga: 'add_to_wishlist', fb: 'AddToWishlist', tt: 'AddToWishlist', items: [item], value: item.price });
  },
  beginCheckout(cart, total) {
    send({ ga: 'begin_checkout', fb: 'InitiateCheckout', tt: 'InitiateCheckout', items: cart.map((c) => toItem(c, c.quantity)), value: total });
  },
  search(term) {
    send({ ga: 'search', fb: 'Search', tt: 'Search', extra: { search_term: term } });
  },
  purchase(orderNumber, cart, total, extra = {}) {
    send({
      ga: 'purchase', fb: 'Purchase', tt: 'CompletePayment',
      items: cart.map((c) => toItem(c, c.quantity)), value: total,
      extra: { transaction_id: orderNumber, ...extra }, eventId: orderNumber,
    });
  },
  signUp() {
    if (enabled.gtm || enabled.ga4) window.dataLayer.push({ event: 'sign_up' });
    const eventId = newEventId();
    if (enabled.fb && window.fbq) window.fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
    if (enabled.tiktok && window.ttq) window.ttq.track('CompleteRegistration', {}, { event_id: eventId });
    sendServer('CompleteRegistration', eventId);
  },
};
