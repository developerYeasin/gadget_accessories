import pool from '../config/db.js';
import { background, notifyOrder } from './push.js';

export const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const STATUS_MESSAGES = {
  confirmed: '✅ Your order is confirmed. We are preparing it now.',
  processing: '📦 Your order is being packed.',
  shipped: '🚚 Your order is on the way!',
  delivered: '🎉 Your order has been delivered. Thank you for shopping with us!',
  cancelled: 'Your order has been cancelled. Contact us if this is unexpected.',
};

// Set an order's status, returning stock when it is cancelled (and taking it again if un-cancelled),
// then push the change to the customer's devices. `extra` columns are written in the same update.
export async function changeOrderStatus(orderId, status, extra = {}) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Invalid status'), { status: 400 });
  const conn = await pool.getConnection();
  let order;
  try {
    await conn.beginTransaction();
    [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (status !== order.status && (status === 'cancelled' || order.status === 'cancelled')) {
      const sign = status === 'cancelled' ? 1 : -1;
      const [items] = await conn.query('SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
      for (const it of items) {
        if (it.product_id) await conn.query('UPDATE products SET stock = GREATEST(stock + ?, 0), sold_count = GREATEST(sold_count - ?, 0) WHERE id = ?', [sign * it.quantity, sign * it.quantity, it.product_id]);
        if (it.variant_id) await conn.query('UPDATE product_variants SET stock = GREATEST(stock + ?, 0) WHERE id = ?', [sign * it.quantity, it.variant_id]);
      }
    }
    const cols = { status, ...extra };
    await conn.query(`UPDATE orders SET ${Object.keys(cols).map((k) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`, [...Object.values(cols), order.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  if (status !== order.status && STATUS_MESSAGES[status]) {
    background(notifyOrder(order.id, {
      title: `Order #${order.order_number} ${status}`,
      body: STATUS_MESSAGES[status],
      url: `/track-order?order=${order.order_number}&phone=${encodeURIComponent(order.phone)}`,
      tag: `order-${order.order_number}`,
    }));
  }
  return order;
}
