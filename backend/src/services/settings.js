import pool from '../config/db.js';

// Credentials stored in the settings table. They are never sent by the public /api/settings endpoint.
export const SECRET_KEYS = new Set([
  'steadfast_api_key', 'steadfast_secret_key', 'steadfast_webhook_token',
  'bdcourier_api_key',
  'bizscalpay_api_key', 'bizscalpay_webhook_secret',
  'fb_capi_token', 'fb_test_event_code', 'tiktok_access_token',
]);

export const publicSettings = (rows) =>
  Object.fromEntries(rows.filter((r) => !SECRET_KEYS.has(r.key)).map((r) => [r.key, r.value]));

// Settings change rarely but these are read on every tracked event, so keep them for a few seconds
let cache = null;
let cachedAt = 0;
export async function getSettings() {
  if (cache && Date.now() - cachedAt < 15000) return cache;
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cachedAt = Date.now();
  return cache;
}
export const clearSettingsCache = () => { cache = null; };

export const isOn = (v) => v === true || v === '1' || v === 'true' || v === 1;
