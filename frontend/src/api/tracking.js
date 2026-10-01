// Marketing pixels: Facebook (Meta) Pixel, TikTok Pixel, Google Analytics 4 and Google Tag Manager.
// IDs come from admin Settings. Every store event is sent to each enabled platform and pushed
// to the GTM dataLayer in GA4 ecommerce format.

const VALID = {
  fb: /^\d{5,20}$/,
  tiktok: /^[A-Z0-9]{10,30}$/i,
  ga4: /^G-[A-Z0-9]{4,20}$/i,
  gtm: /^GTM-[A-Z0-9]{4,12}$/i,
};

const enabled = { fb: false, tiktok: false, ga4: false, gtm: false };
let initialized = false;

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

function send({ ga, fb, tt, items = [], value = 0, extra = {}, eventId }) {
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
}

export const track = {
  pageView(path) {
    if (enabled.gtm) window.dataLayer.push({ event: 'page_view', page_path: path });
    if (enabled.ga4 && window.gtag) window.gtag('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title });
    if (enabled.fb && window.fbq) window.fbq('track', 'PageView');
    if (enabled.tiktok && window.ttq) window.ttq.page();
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
    if (enabled.fb && window.fbq) window.fbq('track', 'CompleteRegistration');
    if (enabled.tiktok && window.ttq) window.ttq.track('CompleteRegistration');
  },
};
