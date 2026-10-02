import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiX, FiMinus, FiPlus, FiTrash2, FiShoppingCart, FiArrowRight } from 'react-icons/fi';
import { imageUrl, money } from '../api/client';
import { cartKey, useStore } from '../context/StoreContext';

export default function CartDrawer({ onClose }) {
  const { cart, cartCount, cartTotal, updateQty, removeFromCart } = useStore();

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="overlay overlay--right" onClick={onClose}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()} aria-label="Shopping cart">
        <div className="cart-drawer__head">
          <h3>Shopping <span className="gold">Cart</span> <span className="muted small">({cartCount})</span></h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>

        {!cart.length ? (
          <div className="cart-drawer__empty">
            <FiShoppingCart />
            <h3>Your cart is empty</h3>
            <Link to="/shop" className="btn btn--gold" onClick={onClose}>Start Shopping <FiArrowRight /></Link>
          </div>
        ) : (
          <>
            <div className="cart-drawer__list">
              {cart.map((i) => (
                <div key={cartKey(i)} className="cart-drawer__item">
                  <Link to={`/product/${i.slug}`} onClick={onClose}><img src={imageUrl(i.image)} alt={i.name} /></Link>
                  <div className="cart-drawer__info">
                    <Link to={`/product/${i.slug}`} onClick={onClose}>{i.name}</Link>
                    {i.variant_name && <span className="variant-tag">{i.variant_name}</span>}
                    <div className="cart-drawer__row">
                      <div className="qty qty--sm">
                        <button onClick={() => updateQty(cartKey(i), i.quantity - 1)} aria-label="Decrease"><FiMinus /></button>
                        <span>{i.quantity}</span>
                        <button onClick={() => updateQty(cartKey(i), i.quantity + 1)} aria-label="Increase"><FiPlus /></button>
                      </div>
                      <b className="gold">{money(i.price * i.quantity)}</b>
                      <button className="icon-btn danger" onClick={() => removeFromCart(cartKey(i))} aria-label="Remove"><FiTrash2 /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-drawer__foot">
              <div className="summary__row summary__total"><span>Subtotal</span><span className="gold">{money(cartTotal)}</span></div>
              <Link to="/checkout" className="btn btn--gold btn--block" onClick={onClose}>Checkout <FiArrowRight /></Link>
              <Link to="/cart" className="btn btn--ghost btn--block" onClick={onClose}>View Cart</Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
