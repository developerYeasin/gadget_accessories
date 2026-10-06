import { imageUrl, money } from '../api/client';

export const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

export function StatusBadge({ status }) {
  return <span className={`status status--${status}`}>{status}</span>;
}

export default function OrderView({ order }) {
  const step = STATUSES.indexOf(order.status);
  return (
    <div className="order-view">
      <div className="order-view__head">
        <div>
          <h3>Order <span className="gold">#{order.order_number}</span></h3>
          <p className="muted small">{new Date(order.created_at.replace(' ', 'T')).toLocaleString()}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      {order.status !== 'cancelled' && (
        <div className="tracker">
          {STATUSES.map((s, i) => (
            <div key={s} className={`tracker__step ${i <= step ? 'done' : ''}`}><i />{s}</div>
          ))}
        </div>
      )}
      {order.items?.map((it) => (
        <div key={it.id} className="summary__item">
          <img src={imageUrl(it.product_image)} alt="" />
          <span>{it.product_name} <span className="muted">× {it.quantity}</span></span>
          <b>{money(it.price * it.quantity)}</b>
        </div>
      ))}
      <div className="summary__row"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
      <div className="summary__row"><span>Delivery</span><span>{money(order.delivery_charge)}</span></div>
      {order.discount > 0 && <div className="summary__row discount-row"><span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</span><span>−{money(order.discount)}</span></div>}
      <div className="summary__row summary__total"><span>Total</span><span className="gold">{money(order.total)}</span></div>
      {order.courier_tracking_code && (
        <p className="small">
          Courier: <b>{{ steadfast: 'Steadfast', pathao: 'Pathao' }[order.courier] || order.courier}</b> · Tracking <b className="gold">{order.courier_tracking_code}</b>
          {order.courier === 'steadfast' && <> · <a className="gold" href={`https://steadfast.com.bd/t/${encodeURIComponent(order.courier_tracking_code)}`} target="_blank" rel="noreferrer">Track parcel →</a></>}
          {order.courier === 'pathao' && <> · <a className="gold" href={`https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(order.courier_tracking_code)}&phone=${encodeURIComponent(order.phone || '')}`} target="_blank" rel="noreferrer">Track parcel →</a></>}
        </p>
      )}
      <p className="small muted">Deliver to: {order.customer_name}, {order.phone} — {order.address}{order.city ? `, ${order.city}` : ''}</p>
    </div>
  );
}
