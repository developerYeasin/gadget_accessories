import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { FaTruck } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api, { imageUrl, money } from '../api/client';
import { useStore } from '../context/StoreContext';
import { track } from '../api/tracking';
import { Breadcrumb } from '../components/Shared';

export default function Checkout() {
  const { cart, cartTotal, clearCart, user, settings } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customer_name: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    address: user?.address || '',
    city: user?.city || '',
    area: 'inside_dhaka',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (cart.length) track.beginCheckout(cart, cartTotal); }, []);

  if (!cart.length) return <Navigate to="/cart" replace />;

  const delivery = Number(form.area === 'outside_dhaka' ? settings.delivery_outside_dhaka ?? 120 : settings.delivery_inside_dhaka ?? 60);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const discount = coupon?.discount || 0;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    try {
      const res = await api.post('/coupons/validate', { code: couponInput, subtotal: cartTotal });
      setCoupon(res);
      toast.success(`Coupon applied: −${money(res.discount)}`);
    } catch (err) {
      setCoupon(null);
      toast.error(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!/^01\d{9}$/.test(form.phone.replace(/\D/g, '').replace(/^88/, ''))) return toast.error('Enter a valid 11 digit phone number');
    setBusy(true);
    try {
      const res = await api.post('/orders', {
        ...form,
        payment_method: 'cod',
        coupon_code: coupon?.code,
        items: cart.map((i) => ({ product_id: i.id, quantity: i.quantity })),
      });
      track.purchase(res.order_number, cart, res.total, { shipping: delivery, coupon: coupon?.code });
      clearCart();
      navigate(`/order-success/${res.order_number}?phone=${encodeURIComponent(form.phone)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <Breadcrumb items={[['Cart', '/cart'], ['Checkout']]} />
      <h1 className="page-title"><span className="gold">Checkout</span></h1>
      <form className="cart-layout" onSubmit={submit}>
        <div className="card form-card">
          <h3>Delivery Information</h3>
          {!user && <p className="muted small">Already have an account? <Link to="/login" className="gold">Login</Link></p>}
          <div className="form-grid">
            <label>Full Name *<input className="input" required value={form.customer_name} onChange={set('customer_name')} /></label>
            <label>Phone Number *<input className="input" required placeholder="01XXXXXXXXX" value={form.phone} onChange={set('phone')} /></label>
            <label>Email<input className="input" type="email" value={form.email} onChange={set('email')} /></label>
            <label>City / District<input className="input" value={form.city} onChange={set('city')} /></label>
            <label className="span-2">Full Address *<textarea className="input" required rows={2} value={form.address} onChange={set('address')} /></label>
            <label className="span-2">Order Note<textarea className="input" rows={2} placeholder="Any special instruction" value={form.note} onChange={set('note')} /></label>
          </div>
          <h3>Delivery Area</h3>
          <div className="radio-cards">
            <label className={form.area === 'inside_dhaka' ? 'is-active' : ''}>
              <input type="radio" name="area" value="inside_dhaka" checked={form.area === 'inside_dhaka'} onChange={set('area')} />
              Inside Dhaka <b>{money(settings.delivery_inside_dhaka ?? 60)}</b>
            </label>
            <label className={form.area === 'outside_dhaka' ? 'is-active' : ''}>
              <input type="radio" name="area" value="outside_dhaka" checked={form.area === 'outside_dhaka'} onChange={set('area')} />
              Outside Dhaka <b>{money(settings.delivery_outside_dhaka ?? 120)}</b>
            </label>
          </div>
          <h3>Payment Method</h3>
          <div className="radio-cards">
            <label className="is-active"><input type="radio" checked readOnly /> <FaTruck className="gold" /> Cash on Delivery</label>
          </div>
        </div>
        <aside className="card summary">
          <h3>Your Order</h3>
          {cart.map((i) => (
            <div key={i.id} className="summary__item">
              <img src={imageUrl(i.image)} alt="" />
              <span>{i.name} <span className="muted">× {i.quantity}</span></span>
              <b>{money(i.price * i.quantity)}</b>
            </div>
          ))}
          <div className="summary__row"><span>Subtotal</span><span>{money(cartTotal)}</span></div>
          <div className="summary__row"><span>Delivery Charge</span><span>{money(delivery)}</span></div>
          <div className="coupon-box">
            <input className="input" placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} />
            {coupon
              ? <button type="button" className="btn btn--ghost" onClick={() => { setCoupon(null); setCouponInput(''); }}>Remove</button>
              : <button type="button" className="btn btn--outline" onClick={applyCoupon}>Apply</button>}
          </div>
          {discount > 0 && <div className="summary__row discount-row"><span>Discount ({coupon.code})</span><span>−{money(discount)}</span></div>}
          <div className="summary__row summary__total"><span>Total</span><span className="gold">{money(cartTotal + delivery - discount)}</span></div>
          <button className="btn btn--gold btn--block btn--lg" disabled={busy}>{busy ? 'Placing Order...' : 'Confirm Order'}</button>
        </aside>
      </form>
    </div>
  );
}
