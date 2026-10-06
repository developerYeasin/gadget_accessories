import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FiAlertCircle, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/client';

// The payment gateway sends the customer back here; the server confirms the payment with the gateway.
export default function PaymentVerify() {
  const [params] = useSearchParams();
  const order = params.get('order') || '';
  const phone = params.get('phone') || '';
  const invoiceId = params.get('invoiceId') || '';
  // bizscalpay (default), bkash (adds paymentID & status) or sslcommerz
  const gateway = ['bkash', 'sslcommerz'].includes(params.get('gateway')) ? params.get('gateway') : 'bizscalpay';
  const paymentID = params.get('paymentID') || '';
  const gatewayStatus = params.get('status') || '';
  const [state, setState] = useState('checking');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.post(`/payment/${gateway}/verify`, { order_number: order, phone, invoiceId, paymentID, status: gatewayStatus })
      .then((r) => alive && setState(r.status))
      .catch((err) => { if (alive) { setState('error'); setMessage(err.message); } });
    return () => { alive = false; };
  }, [order, phone, invoiceId, gateway, paymentID, gatewayStatus]);

  const retry = async () => {
    setBusy(true);
    try {
      const pay = await api.post(`/payment/${gateway}/create`, { order_number: order, phone });
      window.location.assign(pay.paymentUrl);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  const successUrl = `/order-success/${order}?phone=${encodeURIComponent(phone)}`;
  if (state === 'paid' || state === 'already') return <Navigate to={`${successUrl}&paid=1`} replace />;
  if (state === 'checking') return <div className="container page empty-state"><div className="spinner" /><p className="muted">Confirming your payment…</p></div>;

  return (
    <div className="container page empty-state">
      {state === 'pending' ? <FiClock className="empty-state__icon" /> : <FiAlertCircle className="empty-state__icon" />}
      <h2>{state === 'pending' ? 'Payment not completed yet' : 'Payment was not successful'}</h2>
      <p className="muted">
        {message || (state === 'pending'
          ? 'If you already paid, it may take a minute to confirm — refresh this page shortly.'
          : 'No money was taken for this attempt. You can try again or pay cash on delivery.')}
      </p>
      <p className="muted">Your order <b className="gold">#{order}</b> is saved.</p>
      <div className="row center">
        <button className="btn btn--gold" onClick={retry} disabled={busy}>{busy ? 'Please wait…' : 'Try Paying Again'}</button>
        <Link to={successUrl} className="btn btn--outline">Pay Cash on Delivery</Link>
      </div>
    </div>
  );
}
