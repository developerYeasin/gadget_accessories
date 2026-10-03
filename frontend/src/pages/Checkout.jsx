import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FaTruck } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api, { cartWeight, deliveryCharge, imageUrl, money } from '../api/client';
import { cartKey, useStore } from '../context/StoreContext';
import { track } from '../api/tracking';
import { Breadcrumb } from '../components/Shared';

export default function Checkout() {
  const { cart: storeCart, clearCart, user, settings } = useStore();
  const navigate = useNavigate();
  // "Buy Now" checks out just that one product and leaves the cart untouched
  const buyNow = useLocation().state?.buyNow;
  const cart = buyNow ? [buyNow] : storeCart;
  const cartTotal = cart.reduce((s, i) => s + i.quantity * i.price, 0);
  const [quote, setQuote] = useState(null);
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

  // Weights live on the server (older cart lines may not carry them), so ask it for the charge
  const quoteKey = cart.map((i) => `${i.id}x${i.quantity}`).join(',');
  useEffect(() => {
    if (!cart.length) return;
    let alive = true;
    api.post('/orders/quote', { items: cart.map((i) => ({ product_id: i.id, quantity: i.quantity })) })
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  if (!cart.length) return <Navigate to="/cart" replace />;

  const weight = cartWeight(cart);
  const chargeFor = (area) => (quote ? quote[area] : deliveryCharge(settings, area, weight));
  const delivery = chargeFor(form.area);
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
        items: cart.map((i) => ({ product_id: i.id, variant_id: i.variant_id || undefined, quantity: i.quantity })),
      });
      track.purchase(res.order_number, cart, res.total, { shipping: delivery, coupon: coupon?.code });
      if (!buyNow) clearCart();
      navigate(`/order-success/${res.order_number}?phone=${encodeURIComponent(form.phone)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page page--checkout">
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
              Inside Dhaka <b>{money(chargeFor('inside_dhaka'))}</b>
            </label>
            <label className={form.area === 'outside_dhaka' ? 'is-active' : ''}>
              <input type="radio" name="area" value="outside_dhaka" checked={form.area === 'outside_dhaka'} onChange={set('area')} />
              Outside Dhaka <b>{money(chargeFor('outside_dhaka'))}</b>
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
            <div key={cartKey(i)} className="summary__item">
              <img src={imageUrl(i.image)} alt="" />
              <span>{i.name}{i.variant_name && <span className="variant-tag">{i.variant_name}</span>} <span className="muted">× {i.quantity}</span></span>
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
