import { Link } from 'react-router-dom';
import { FiMinus, FiPlus, FiTrash2, FiShoppingCart, FiArrowRight, FiPackage } from 'react-icons/fi';
import { cartWeight, deliveryCharge, formatWeight, imageUrl, money } from '../api/client';
import { cartKey, useStore } from '../context/StoreContext';
import { Breadcrumb } from '../components/Shared';

export default function Cart() {
  const { cart, updateQty, removeFromCart, isSelected, toggleSelected, selectAll, removeKeys, selectedItems, selectedTotal, settings } = useStore();

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

  const allOn = selectedItems.length === cart.length;
  const count = selectedItems.reduce((n, i) => n + i.quantity, 0);
  const weight = cartWeight(selectedItems, settings);

  return (
    <div className="container page">
      <Breadcrumb items={[['Cart']]} />
      <h1 className="page-title">Shopping <span className="gold">Cart</span></h1>
      <div className="cart-layout">
        <div className="cart-list">
          <div className="cart-bar card">
            <label className="tick">
              <input type="checkbox" checked={allOn} onChange={() => selectAll(!allOn)} />
              <span>Select all ({cart.length})</span>
            </label>
            {selectedItems.length > 0 && !allOn && (
              <button className="btn btn--ghost btn--sm danger" onClick={() => removeKeys(selectedItems.map(cartKey))}><FiTrash2 /> Remove selected</button>
            )}
          </div>
          {cart.map((i) => (
            <div key={cartKey(i)} className={`cart-item card ${isSelected(i) ? '' : 'is-off'}`}>
              <label className="tick cart-item__tick" aria-label={`Select ${i.name}`}>
                <input type="checkbox" checked={isSelected(i)} onChange={() => toggleSelected(cartKey(i))} />
              </label>
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
          <div className="summary__row"><span>Selected</span><span>{selectedItems.length} of {cart.length} products · {count} pcs</span></div>
          <div className="summary__row"><span>Subtotal</span><span>{money(selectedTotal)}</span></div>
          {weight > 0 && <div className="summary__row muted"><span><FiPackage /> Parcel weight</span><span>{formatWeight(weight)}</span></div>}
          <div className="summary__row muted">
            <span>Delivery</span>
            <span>{selectedItems.length ? `${money(deliveryCharge(settings, 'inside_dhaka', weight))} – ${money(deliveryCharge(settings, 'outside_dhaka', weight))}` : '—'}</span>
          </div>
          <div className="summary__row summary__total"><span>Total</span><span className="gold">{money(selectedTotal)}<small className="muted"> + delivery</small></span></div>
          {selectedItems.length
            ? <Link to="/checkout" className="btn btn--gold btn--block">Checkout ({selectedItems.length}) <FiArrowRight /></Link>
            : <button className="btn btn--gold btn--block" disabled>Select a product to checkout</button>}
          <Link to="/shop" className="btn btn--ghost btn--block">Continue Shopping</Link>
        </aside>
      </div>
    </div>
  );
}
