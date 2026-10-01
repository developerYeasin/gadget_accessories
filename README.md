# Gadget Accessories Home — E-commerce

```
backend/   Node.js + Express + MySQL API  (port 5000)
frontend/  React + Vite storefront + admin panel (port 5173)
```

## Setup
```bash
cd backend
npm install
npm run setup      # creates/upgrades tables + seeds categories, products, banners, pages, coupons, admin (safe to re-run)
npm run dev

cd ../frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api and /uploads to :5000)
```

DB credentials live in `backend/.env` (see `.env.example`).

## Admin
Go to `/login` → `admin@gadgetaccessorieshome.com` / `admin123` (set in `.env` before seeding — change it!).
Admin panel `/admin`:
- **Dashboard** — revenue, today's sales, pending orders, low stock, 14-day sales chart, recent orders
- **Orders** — search, filter by status/payment, change status (cancel restores stock), payment status, edit customer info, private note, printable invoice, delete
- **Reports** — revenue chart (7/30/90/365 days), top products, sales by category, orders by status, CSV export
- **Products / Inventory / Categories** — CRUD with image upload, quick stock edit, visible/featured/flash toggles
- **Reviews** — hide/show or delete customer reviews
- **Coupons** — % or fixed, min order, max discount, usage limit, expiry (applied at checkout)
- **Banners** — hero slider
- **Customers** — search, order history, total spent, block/unblock, make admin
- **Messages** — contact form inbox
- **Pages** — Privacy, Terms, Return, Shipping policy (shown at `/page/<slug>`)
- **Settings** — store info, social links, delivery charges, flash sale timer, tracking IDs, product feeds

## Marketing & tracking
Admin → Settings → *Marketing & Tracking*: Facebook Pixel, TikTok Pixel, Google Tag Manager, GA4 IDs.
Events: PageView, ViewContent, AddToCart, AddToWishlist, InitiateCheckout, Search, Purchase (TikTok CompletePayment),
CompleteRegistration — plus GA4 ecommerce events in the GTM `dataLayer`. Purchase uses the order number as event ID.

Product catalog feeds (set **Website URL** in Settings to your live domain first):
- `/api/feed/products.xml` — Facebook / Instagram Shop, TikTok Catalog, Google Merchant Center
- `/api/feed/tiktok.csv` — TikTok Catalog CSV

## Store features
Home (hero slider, features, categories, flash sale countdown, featured/new), shop with filter/sort/search/pagination,
category banners, product detail + reviews, cart, wishlist, COD checkout (guest or logged in), order tracking,
customer account with order history, contact form, mobile bottom nav — dark/gold design.

## Production
`cd frontend && npm run build` → serve `dist/`; set `VITE_API_URL` if the API is on another domain,
and `CLIENT_URL` + a strong `JWT_SECRET` in `backend/.env`.
