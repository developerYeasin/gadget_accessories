import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FiCheckCircle } from 'react-icons/fi';

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  const [params] = useSearchParams();
  const phone = params.get('phone') || '';
  return (
    <div className="container page empty-state">
      <FiCheckCircle className="empty-state__icon" />
      <h2>Thank you! Your order has been placed.</h2>
      <p className="muted">Order Number: <b className="gold">{orderNumber}</b></p>
      <p className="muted">Our team will call you shortly to confirm your order.</p>
      <div className="row center">
        <Link to={`/track-order?order=${orderNumber}&phone=${encodeURIComponent(phone)}`} className="btn btn--outline">Track Order</Link>
        <Link to="/shop" className="btn btn--gold">Continue Shopping</Link>
      </div>
    </div>
  );
}
