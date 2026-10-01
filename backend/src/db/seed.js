import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { r2PublicUrl } from '../config/r2.js';

// Store images live on Cloudflare R2 when configured, otherwise on the backend's /uploads
const IMG = r2PublicUrl ? `${r2PublicUrl}/images` : '/uploads/images';

const categories = [
  ['Power Bank', 'power-bank', 'POWER BANK', 'Stay Powered Everywhere', `${IMG}/banners/powerbank-right.jpg`],
  ['Earbuds', 'earbuds', 'EARBUDS', 'Pure Sound, Zero Wires', `${IMG}/categories/earbuds.jpg`],
  ['Smart Watch', 'smart-watch', 'SMART WATCH', 'Smart Life On Your Wrist', `${IMG}/categories/smart-watch.jpg`],
  ['Headphone', 'headphone', 'HEADPHONE', 'Immersive Premium Sound', `${IMG}/categories/headphone.jpg`],
  ['Mobile Accessories', 'mobile-accessories', 'ACCESSORIES', 'Everything Your Phone Needs', `${IMG}/categories/mobile-accessories.jpg`],
  ['Charging Cable', 'charging-cable', 'CHARGING CABLE', 'Fast & Durable Charging', `${IMG}/categories/charging-cable.jpg`],
  ['Car Accessories', 'car-accessories', 'CAR ACCESSORIES', 'Power On The Road', `${IMG}/categories/car-accessories.jpg`],
];

// [category, name, slug, brand, price, old_price, stock, image, rating, reviews, featured, flash, features]
const products = [
  ['power-bank', 'Vendens 20000mAh Power Bank (VD-PB059)', 'vendens-20000mah-power-bank-vd-pb059', 'Vendens', 1160, 1300, 40, `${IMG}/products/vendens-20000.jpg`, 4.8, 120, 1, 1, ['Fast Charging', 'High Capacity', 'Built-in Cable']],
  ['power-bank', 'Vendens 10000mAh Power Bank', 'vendens-10000mah-power-bank', 'Vendens', 750, 850, 55, `${IMG}/products/vendens-10000.jpg`, 4.7, 98, 1, 0, ['Fast Charging', 'Slim Design', 'Dual Output']],
  ['power-bank', 'Baseus 20000mAh Power Bank', 'baseus-20000mah-power-bank', 'Baseus', 1150, 1450, 30, `${IMG}/products/baseus-20000.jpg`, 4.6, 76, 1, 0, ['22.5W Fast Charging', 'LED Display', 'Type-C PD']],
  ['power-bank', 'Romoss 30000mAh Power Bank', 'romoss-30000mah-power-bank', 'Romoss', 1475, 1800, 25, `${IMG}/products/romoss-30000.jpg`, 4.7, 62, 0, 0, ['30000mAh', '3 Outputs', 'Safe Charging']],
  ['power-bank', 'Premium Slim 10000mAh Power Bank', 'premium-slim-10000mah-power-bank', 'Vendens', 890, 1050, 35, `${IMG}/products/power-bank.jpg`, 4.5, 41, 0, 0, ['Ultra Slim', 'Fast Charging']],
  ['earbuds', 'TWS Bluetooth Earbuds', 'tws-bluetooth-earbuds', 'Vendens', 990, 1250, 60, `${IMG}/products/earbuds.jpg`, 4.7, 96, 1, 1, ['Bluetooth 5.3', 'ENC Noise Cancel', '30H Playtime']],
  ['smart-watch', 'Smart Watch', 'smart-watch-amoled', 'Vendens', 1999, 2450, 20, `${IMG}/products/smart-watch.jpg`, 4.6, 84, 1, 1, ['AMOLED Display', 'Bluetooth Calling', 'Heart Rate']],
  ['headphone', 'Wireless Over-Ear Headphone', 'wireless-over-ear-headphone', 'Vendens', 1850, 2200, 18, `${IMG}/products/headphone.jpg`, 4.8, 57, 1, 1, ['Deep Bass', '40H Battery', 'Foldable']],
  ['mobile-accessories', '20W PD Fast Charger with Cable', '20w-pd-fast-charger-with-cable', 'Vendens', 650, 790, 70, `${IMG}/products/mobile-accessories.jpg`, 4.6, 112, 1, 1, ['20W PD', 'Type-C', 'Overheat Protection']],
  ['charging-cable', 'USB to Type-C Fast Charging Cable', 'usb-to-type-c-fast-charging-cable', 'Vendens', 290, 350, 150, `${IMG}/products/charging-cable.jpg`, 4.5, 143, 0, 1, ['3A Fast Charge', 'Braided', '1 Meter']],
  ['car-accessories', 'Dual Port Fast Car Charger', 'dual-port-fast-car-charger', 'Vendens', 550, 690, 45, `${IMG}/products/car-accessories.jpg`, 4.6, 38, 1, 0, ['PD + QC 3.0', 'Aluminium Body', 'LED Light']],

  // Power banks
  ['power-bank', 'Anker PowerCore 10000mAh', 'anker-powercore-10000mah', 'Anker', 1650, 1950, 30, `${IMG}/products/vendens-10000.jpg`, 4.9, 210, 1, 0, ['PowerIQ', 'Compact', 'Fast Recharge']],
  ['power-bank', 'Xiaomi Redmi 20000mAh Power Bank', 'xiaomi-redmi-20000mah-power-bank', 'Xiaomi', 1490, 1750, 40, `${IMG}/products/baseus-20000.jpg`, 4.7, 188, 1, 1, ['18W Fast Charge', 'Dual USB', 'Type-C Input']],
  ['power-bank', 'Baseus 10000mAh Magnetic Power Bank', 'baseus-10000mah-magnetic-power-bank', 'Baseus', 1890, 2300, 22, `${IMG}/products/power-bank.jpg`, 4.6, 67, 0, 1, ['MagSafe Compatible', '20W PD', 'Slim']],
  ['power-bank', 'Romoss 20000mAh PD Power Bank', 'romoss-20000mah-pd-power-bank', 'Romoss', 1290, 1550, 35, `${IMG}/products/romoss-30000.jpg`, 4.5, 54, 0, 0, ['22.5W', 'Triple Output', 'LED Indicator']],
  ['power-bank', 'Vendens 30000mAh Mega Power Bank', 'vendens-30000mah-mega-power-bank', 'Vendens', 1990, 2400, 18, `${IMG}/products/vendens-20000.jpg`, 4.8, 73, 1, 0, ['30000mAh', 'Built-in Cable', 'Digital Display']],
  // Earbuds
  ['earbuds', 'Vendens Pro ANC Earbuds', 'vendens-pro-anc-earbuds', 'Vendens', 1690, 2100, 40, `${IMG}/products/earbuds.jpg`, 4.8, 132, 1, 1, ['Active Noise Cancel', '35H Playtime', 'Low Latency']],
  ['earbuds', 'QCY T13 ANC TWS Earbuds', 'qcy-t13-anc-tws-earbuds', 'QCY', 1450, 1700, 50, `${IMG}/categories/earbuds.jpg`, 4.6, 210, 1, 0, ['ANC', '4 Mic ENC', 'App Support']],
  ['earbuds', 'Xiaomi Redmi Buds 5', 'xiaomi-redmi-buds-5', 'Xiaomi', 2490, 2900, 25, `${IMG}/products/earbuds.jpg`, 4.7, 96, 1, 0, ['46dB ANC', '40H Battery', 'Bluetooth 5.3']],
  ['earbuds', 'Gaming TWS Earbuds Low Latency', 'gaming-tws-earbuds-low-latency', 'Vendens', 1150, 1450, 60, `${IMG}/categories/earbuds.jpg`, 4.4, 48, 0, 1, ['45ms Latency', 'RGB Light', 'Dual Mode']],
  ['earbuds', 'Mini Sport Wireless Earbuds', 'mini-sport-wireless-earbuds', 'Vendens', 790, 990, 80, `${IMG}/products/earbuds.jpg`, 4.3, 39, 0, 0, ['IPX5 Waterproof', 'Touch Control', 'Mini Case']],
  // Smart watches
  ['smart-watch', 'Vendens Ultra Smart Watch', 'vendens-ultra-smart-watch', 'Vendens', 2690, 3200, 20, `${IMG}/products/smart-watch.jpg`, 4.7, 88, 1, 1, ['2.0" AMOLED', 'BT Calling', 'IP68']],
  ['smart-watch', 'Xiaomi Redmi Watch 4', 'xiaomi-redmi-watch-4', 'Xiaomi', 7990, 8990, 12, `${IMG}/categories/smart-watch.jpg`, 4.8, 64, 1, 0, ['1.97" AMOLED', 'GPS', '20 Days Battery']],
  ['smart-watch', 'Kids Smart Watch with GPS', 'kids-smart-watch-with-gps', 'Vendens', 2290, 2700, 15, `${IMG}/products/smart-watch.jpg`, 4.4, 27, 0, 0, ['GPS Tracking', 'SOS Call', 'Camera']],
  ['smart-watch', 'Amazfit Bip 5 Smart Watch', 'amazfit-bip-5-smart-watch', 'Amazfit', 8490, 9500, 10, `${IMG}/categories/smart-watch.jpg`, 4.7, 51, 0, 1, ['1.91" Display', 'Alexa Built-in', 'GPS']],
  ['smart-watch', 'Sports Fitness Smart Band', 'sports-fitness-smart-band', 'Vendens', 1290, 1600, 45, `${IMG}/products/smart-watch.jpg`, 4.3, 70, 0, 0, ['Heart Rate', 'SpO2', 'Sleep Tracking']],
  // Headphones
  ['headphone', 'Vendens Studio Pro ANC Headphone', 'vendens-studio-pro-anc-headphone', 'Vendens', 3490, 4200, 15, `${IMG}/products/headphone.jpg`, 4.8, 46, 1, 1, ['Hybrid ANC', '60H Battery', 'Hi-Res Audio']],
  ['headphone', 'Gaming Headphone with Mic', 'gaming-headphone-with-mic', 'Havit', 1650, 1990, 30, `${IMG}/categories/headphone.jpg`, 4.5, 82, 0, 0, ['50mm Driver', 'RGB Light', 'Noise Cancel Mic']],
  ['headphone', 'Foldable Bluetooth Headphone', 'foldable-bluetooth-headphone', 'Vendens', 1250, 1500, 40, `${IMG}/products/headphone.jpg`, 4.4, 59, 0, 1, ['Foldable', '30H Playtime', 'AUX Support']],
  ['headphone', 'Wired Bass Headphone', 'wired-bass-headphone', 'Vendens', 690, 850, 60, `${IMG}/categories/headphone.jpg`, 4.2, 33, 0, 0, ['Deep Bass', '3.5mm Jack', 'Lightweight']],
  // Mobile accessories
  ['mobile-accessories', '33W Super Fast Charger', '33w-super-fast-charger', 'Xiaomi', 990, 1200, 50, `${IMG}/products/mobile-accessories.jpg`, 4.7, 156, 1, 1, ['33W', 'Type-C Cable Included', 'Safe Charging']],
  ['mobile-accessories', '65W GaN Dual Port Charger', '65w-gan-dual-port-charger', 'Baseus', 2490, 2950, 25, `${IMG}/categories/mobile-accessories.jpg`, 4.8, 77, 1, 0, ['GaN Tech', 'Laptop Charging', 'PD + QC']],
  ['mobile-accessories', 'Magnetic Phone Holder Stand', 'magnetic-phone-holder-stand', 'Vendens', 450, 600, 90, `${IMG}/products/mobile-accessories.jpg`, 4.4, 41, 0, 0, ['360° Rotation', 'Strong Magnet', 'Foldable']],
  ['mobile-accessories', '15W Wireless Charging Pad', '15w-wireless-charging-pad', 'Vendens', 890, 1100, 40, `${IMG}/categories/mobile-accessories.jpg`, 4.5, 52, 0, 1, ['15W Qi', 'LED Indicator', 'Slim Design']],
  // Charging cables
  ['charging-cable', 'Type-C to Type-C 60W Cable', 'type-c-to-type-c-60w-cable', 'Baseus', 450, 550, 120, `${IMG}/products/charging-cable.jpg`, 4.7, 168, 1, 0, ['60W PD', 'Braided', '1.5 Meter']],
  ['charging-cable', 'USB to Lightning Fast Cable', 'usb-to-lightning-fast-cable', 'Vendens', 390, 490, 100, `${IMG}/categories/charging-cable.jpg`, 4.5, 97, 0, 1, ['2.4A', 'Durable', '1 Meter']],
  ['charging-cable', '3 in 1 Multi Charging Cable', '3-in-1-multi-charging-cable', 'Vendens', 490, 650, 85, `${IMG}/products/charging-cable.jpg`, 4.4, 61, 0, 0, ['Type-C + Lightning + Micro', 'Nylon Braided', '1.2 Meter']],
  ['charging-cable', '100W Type-C Fast Cable 2M', '100w-type-c-fast-cable-2m', 'Baseus', 690, 850, 60, `${IMG}/categories/charging-cable.jpg`, 4.8, 44, 1, 0, ['100W PD', 'Laptop Support', '2 Meter']],
  // Car accessories
  ['car-accessories', 'Magnetic Car Phone Holder', 'magnetic-car-phone-holder', 'Baseus', 690, 890, 50, `${IMG}/categories/car-accessories.jpg`, 4.6, 72, 1, 1, ['Air Vent Mount', 'Strong Magnet', '360° Rotate']],
  ['car-accessories', 'Car Bluetooth FM Transmitter', 'car-bluetooth-fm-transmitter', 'Vendens', 990, 1250, 30, `${IMG}/products/car-accessories.jpg`, 4.4, 36, 0, 0, ['Hands-free Call', 'Dual USB', 'Music Play']],
  ['car-accessories', '120W Super Fast Car Charger', '120w-super-fast-car-charger', 'Vendens', 1190, 1450, 25, `${IMG}/categories/car-accessories.jpg`, 4.7, 29, 0, 1, ['120W Output', 'PD + QC', 'Digital Voltmeter']],
];

const galleryExtras = {
  'power-bank': ['hero-powerbank', 'banner-powerbank', 'cat-power-bank'],
  earbuds: ['hero-earbuds', 'm-earbuds', 'cat-earbuds'],
  'smart-watch': ['hero-watch', 'm-watch', 'cat-smart-watch'],
  headphone: ['hero-headphone', 'hero-headphone2', 'cat-headphone'],
  'mobile-accessories': ['cat-mobile-accessories', 'hero-cable', 'cat-charging-cable'],
  'charging-cable': ['hero-cable', 'cat-charging-cable', 'cat-mobile-accessories'],
  'car-accessories': ['cat-car-accessories', 'cat-car-accessories-zoom', 'cat-mobile-accessories'],
};

const banners = [
  ['Latest', 'GADGETS', 'at Best Prices', `${IMG}/banners/hero-right.jpg`, '/shop', 1],
  ['Stay Powered', 'POWER BANK', 'Up to 20% Off', `${IMG}/banners/powerbank-right.jpg`, '/category/power-bank', 2],
  ['Premium', 'EARBUDS', 'Pure Wireless Sound', `${IMG}/categories/earbuds.jpg`, '/category/earbuds', 3],
  ['Smart', 'WATCHES', 'Style Meets Tech', `${IMG}/categories/smart-watch.jpg`, '/category/smart-watch', 4],
];

const settings = {
  site_name: 'Gadget Accessories Home',
  site_url: process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5173',
  fb_pixel_id: '',
  gtm_id: '',
  ga4_id: '',
  tiktok_pixel_id: '',
  phone: '01650230541',
  email: 'info@gadgetaccessorieshome.com',
  address: 'Dhaka, Bangladesh',
  facebook: 'https://facebook.com',
  whatsapp: 'https://wa.me/8801650230541',
  messenger: 'https://m.me',
  delivery_inside_dhaka: '60',
  delivery_outside_dhaka: '120',
  flash_sale_end: new Date(Date.now() + (2 * 24 + 14) * 3600 * 1000 + 36 * 60000).toISOString(),
};

const pages = [
  ['privacy-policy', 'Privacy Policy', 'We respect your privacy. Your name, phone number and address are used only to process and deliver your orders.\n\nWe never sell or share your personal information with third parties, except our delivery partners who need it to deliver your parcel.\n\nIf you have any question about your data, please contact us.'],
  ['terms-conditions', 'Terms & Conditions', 'By placing an order on Gadget Accessories Home you agree to these terms.\n\nPrices and stock may change without notice. We may cancel an order if a product is out of stock or the information provided is incorrect.\n\nPlease check your product in front of the delivery person before paying.'],
  ['return-policy', 'Return & Refund Policy', 'If you receive a damaged or wrong product, tell us within 3 days of delivery.\n\nThe product must be unused and in its original box with all accessories.\n\nAfter checking, we will replace the product or refund your money within 7 working days.'],
  ['shipping-policy', 'Shipping Policy', 'Inside Dhaka: delivery in 1–2 working days.\nOutside Dhaka: delivery in 2–4 working days.\n\nCash on delivery is available all over Bangladesh. Delivery charge is shown at checkout.'],
];

async function seed() {
  const conn = await pool.getConnection();
  try {
    for (const [i, [name, slug, bt, bs, img]] of categories.entries()) {
      await conn.query(
        `INSERT IGNORE INTO categories (name, slug, image, banner_title, banner_subtitle, banner_image, sort_order) VALUES (?,?,?,?,?,?,?)`,
        [name, slug, `${IMG}/categories/${slug}.jpg`, bt, bs, img, i + 1]
      );
    }
    const [cats] = await conn.query('SELECT id, slug FROM categories');
    const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

    for (const p of products) {
      const [cat, name, slug, brand, price, old, stock, image, rating, reviews, featured, flash, features] = p;
      await conn.query(
        `INSERT IGNORE INTO products (category_id, name, slug, brand, short_description, description, price, old_price, stock, image, images, features, rating, review_count, sold_count, is_featured, is_flash_sale)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [catId[cat], name, slug, brand, `${name} — 100% original with warranty.`,
          `${name} by ${brand}. Premium build quality with ${features.join(', ')}. 100% original product with official warranty. Cash on delivery available all over Bangladesh.`,
          price, old, stock, image, JSON.stringify([image]), JSON.stringify(features), rating, reviews, reviews * 2, featured, flash]
      );
    }

    // Give seeded products a multi-image gallery (enhanced main, close-up, and category angles)
    const [seeded] = await conn.query(
      `SELECT p.id, p.image, p.images, c.slug AS cat FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.image LIKE '%/images/products/%' OR p.image LIKE '%/images/categories/%'`);
    for (const r of seeded) {
      const [, dir, file] = /\/images\/(products|categories)\/([^/]+)\.jpg$/.exec(r.image) || [];
      if (!dir) continue;
      const base = `${IMG}/gallery/${dir.slice(0, 3)}-${file}`;
      const list = [...new Set([`${base}.jpg`, `${base}-zoom.jpg`, ...(galleryExtras[r.cat] || []).map((x) => `${IMG}/gallery/${x}.jpg`)])].slice(0, 5);
      await conn.query('UPDATE products SET image = ?, images = ? WHERE id = ?', [list[0], JSON.stringify(list), r.id]);
    }

    const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM banners');
    if (!n) {
      for (const b of banners) {
        await conn.query('INSERT INTO banners (line1, highlight, line2, image, link, sort_order) VALUES (?,?,?,?,?,?)', b);
      }
    }

    for (const [k, v] of Object.entries(settings)) {
      await conn.query('INSERT IGNORE INTO settings (`key`, `value`) VALUES (?,?)', [k, v]);
    }

    for (const [slug, title, content] of pages) {
      await conn.query('INSERT IGNORE INTO pages (slug, title, content) VALUES (?,?,?)', [slug, title, content]);
    }
    await conn.query(
      "INSERT IGNORE INTO coupons (code, type, value, min_order, max_discount) VALUES ('WELCOME10','percent',10,500,300), ('SAVE100','fixed',100,1500,NULL)"
    );

    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await conn.query(
      `INSERT IGNORE INTO users (name, email, password_hash, role) VALUES (?,?,?,'admin')`,
      [process.env.ADMIN_NAME || 'Admin', process.env.ADMIN_EMAIL, hash]
    );
    console.log('✔ Seed complete. Admin:', process.env.ADMIN_EMAIL);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
