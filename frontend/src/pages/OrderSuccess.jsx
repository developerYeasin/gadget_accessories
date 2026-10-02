import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FiBell, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { permission, pushSupported, subscribePush } from '../api/push';

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  const [params] = useSearchParams();
  const phone = params.get('phone') || '';
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Already allowed on this device? Link it to this order silently.
  useEffect(() => {
    if (pushSupported() && permission() === 'granted') {
      subscribePush({ order_number: orderNumber, phone }).then(() => setSubscribed(true)).catch(() => {});
    }
  }, [orderNumber, phone]);
  const getUpdates = async () => {
    setBusy(true);
    try {
      await subscribePush({ order_number: orderNumber, phone });
      setSubscribed(true);
      toast.success("We'll notify you when your order status changes");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container page empty-state">
      <FiCheckCircle className="empty-state__icon" />
      <h2>Thank you! Your order has been placed.</h2>
      <p className="muted">Order Number: <b className="gold">{orderNumber}</b></p>
      <p className="muted">Our team will call you shortly to confirm your order.</p>
      {pushSupported() && (subscribed
        ? <p className="gold"><FiBell /> You'll get a notification when your order status changes.</p>
        : <button className="btn btn--ghost" onClick={getUpdates} disabled={busy}><FiBell /> {busy ? 'Please wait…' : 'Get order updates on this device'}</button>)}
      <div className="row center">
        <Link to={`/track-order?order=${orderNumber}&phone=${encodeURIComponent(phone)}`} className="btn btn--outline">Track Order</Link>
        <Link to="/shop" className="btn btn--gold">Continue Shopping</Link>
      </div>
    </div>
  );
}
