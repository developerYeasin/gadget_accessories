import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import OrderView from '../components/OrderView';
import { Breadcrumb } from '../components/Shared';

export default function TrackOrder() {
  const [params] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get('order') || '');
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  const track = async (e) => {
    e?.preventDefault();
    setError('');
    setOrder(null);
    try {
      setOrder(await api.get(`/orders/${encodeURIComponent(orderNumber.trim())}?phone=${encodeURIComponent(phone.trim())}`));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (params.get('order')) track();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container page narrow">
      <Breadcrumb items={[['Track Order']]} />
      <h1 className="page-title">Track <span className="gold">Order</span></h1>
      <form className="card form-card" onSubmit={track}>
        <div className="form-grid">
          <label>Order Number<input className="input" required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="GAH..." /></label>
          <label>Phone Number<input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></label>
        </div>
        <button className="btn btn--gold">Track</button>
        {error && <p className="error">{error}</p>}
      </form>
      {order && <div className="card form-card"><OrderView order={order} /></div>}
    </div>
  );
}
