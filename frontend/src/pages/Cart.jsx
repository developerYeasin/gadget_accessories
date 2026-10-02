import { Link } from 'react-router-dom';
import { FiMinus, FiPlus, FiTrash2, FiShoppingCart, FiArrowRight } from 'react-icons/fi';
import { imageUrl, money } from '../api/client';
import { cartKey, useStore } from '../context/StoreContext';
import { Breadcrumb } from '../components/Shared';

export default function Cart() {
  const { cart, cartTotal, updateQty, removeFromCart } = useStore();

  if (!cart.length) {
    return (
      <div className="container page empty-state">
        <FiShoppingCart className="empty-state__icon" />
        <h2>Your cart is empty</h2>
        <p className="muted">Looks like you haven't added anything yet.</p>
        <Link to="/shop" className="btn btn--gold">Start Shopping <FiArrowRight /></Link>
      </div>
    );
  }

  return (
    <div className="container page">
      <Breadcrumb items={[['Cart']]} />
      <h1 className="page-title">Shopping <span className="gold">Cart</span></h1>
      <div className="cart-layout">
        <div className="cart-list">
          {cart.map((i) => (
            <div key={cartKey(i)} className="cart-item card">
              <Link to={`/product/${i.slug}`} className="cart-item__img"><img src={imageUrl(i.image)} alt={i.name} /></Link>
              <div className="cart-item__info">
                <Link to={`/product/${i.slug}`} className="cart-item__name">{i.name}</Link>
                {i.variant_name && <span className="variant-tag">{i.variant_name}</span>}
                <div className="cart-item__price">
                  <strong>{money(i.price)}</strong>
                  {i.old_price > i.price && <del>{money(i.old_price)}</del>}
                </div>
                <div className="cart-item__row">
                  <div className="qty qty--sm">
                    <button onClick={() => updateQty(cartKey(i), i.quantity - 1)} aria-label="Decrease"><FiMinus /></button>
                    <span>{i.quantity}</span>
                    <button onClick={() => updateQty(cartKey(i), i.quantity + 1)} aria-label="Increase"><FiPlus /></button>
                  </div>
                  <strong className="gold">{money(i.price * i.quantity)}</strong>
                  <button className="icon-btn danger" onClick={() => removeFromCart(cartKey(i))} aria-label="Remove"><FiTrash2 /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <aside className="card summary">
          <h3>Order Summary</h3>
          <div className="summary__row"><span>Subtotal</span><span>{money(cartTotal)}</span></div>
          <div className="summary__row muted"><span>Delivery</span><span>Calculated at checkout</span></div>
          <div className="summary__row summary__total"><span>Total</span><span className="gold">{money(cartTotal)}</span></div>
          <Link to="/checkout" className="btn btn--gold btn--block">Proceed to Checkout <FiArrowRight /></Link>
          <Link to="/shop" className="btn btn--ghost btn--block">Continue Shopping</Link>
        </aside>
      </div>
    </div>
  );
}
