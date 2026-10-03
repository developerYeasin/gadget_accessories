import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { track } from '../api/tracking';
import { currentSubscription } from '../api/push';

const StoreContext = createContext(null);

// A cart line is one product, or one variant of a product
export const cartKey = (item) => item.key || (item.variant_id ? `${item.id}:${item.variant_id}` : String(item.id));

const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export function StoreProvider({ children }) {
  const [user, setUser] = useState(() => load('gah_user', null));
  const [cart, setCart] = useState(() => load('gah_cart', []));
  const [wishlist, setWishlist] = useState(() => load('gah_wishlist', []));
  const [settings, setSettings] = useState({});
  const [categories, setCategories] = useState([]);

  useEffect(() => localStorage.setItem('gah_cart', JSON.stringify(cart)), [cart]);
  useEffect(() => localStorage.setItem('gah_wishlist', JSON.stringify(wishlist)), [wishlist]);

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
    api.get('/categories').then(setCategories).catch(() => {});
  }, []);

  // Refresh profile + merge guest wishlist into server wishlist after login
  useEffect(() => {
    if (!user) return;
    api.get('/auth/me').then(setUser).catch(() => logout());
    // A device that already allowed notifications now belongs to this account (for order updates)
    currentSubscription().then((sub) => sub && api.post('/push/subscribe', { subscription: sub.toJSON() })).catch(() => {});
    api.post('/wishlist/sync', { product_ids: load('gah_wishlist', []).map((p) => p.id) })
      .then(() => api.get('/wishlist'))
      .then(setWishlist)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const saveAuth = ({ token, user }) => {
    localStorage.setItem('gah_token', token);
    localStorage.setItem('gah_user', JSON.stringify(user));
    setUser(user);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('gah_token');
    localStorage.removeItem('gah_user');
    setUser(null);
    setWishlist([]);
  }, []);

  // Builds a cart line, or returns null (with a toast) when it can't be bought
  const makeLine = (product, variant = null) => {
    if (product.variant_count > 0 && !variant) { toast.error('Please choose an option first'); return null; }
    const stock = variant ? variant.stock : product.stock;
    if (stock <= 0) { toast.error('Out of stock'); return null; }
    const line = {
      id: product.id,
      variant_id: variant?.id || null,
      variant_name: variant?.name || null,
      name: product.name,
      slug: product.slug,
      price: variant ? variant.price : product.price,
      old_price: variant ? variant.old_price : product.old_price,
      image: variant?.image || product.image,
      stock,
      weight: Number(product.weight) || 0,
    };
    line.key = cartKey(line);
    return line;
  };
  const addToCart = (product, quantity = 1, silent = false, variant = null) => {
    const line = makeLine(product, variant);
    if (!line) return;
    const { stock } = line;
    setCart((c) => {
      const found = c.find((i) => cartKey(i) === line.key);
      if (found) return c.map((i) => (cartKey(i) === line.key ? { ...i, ...line, selected: true, quantity: Math.min(i.quantity + quantity, stock) } : i));
      return [...c, { ...line, quantity: Math.min(quantity, stock) }];
    });
    track.addToCart({ ...product, price: line.price }, quantity);
    if (!silent) toast.success('Added to cart');
  };
  const updateQty = (key, quantity) =>
    setCart((c) => c.map((i) => (cartKey(i) === key ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock || 99)) } : i)));
  const removeFromCart = (key) => setCart((c) => c.filter((i) => cartKey(i) !== key));
  const clearCart = () => setCart([]);
  // Cart lines are ticked by default; only ticked lines go to checkout
  const isSelected = (item) => item.selected !== false;
  const toggleSelected = (key) => setCart((c) => c.map((i) => (cartKey(i) === key ? { ...i, selected: !isSelected(i) } : i)));
  const selectAll = (on) => setCart((c) => c.map((i) => ({ ...i, selected: on })));
  // After an order: drop the ordered lines and tick what's left, ready for the next checkout
  const removeKeys = (keys) => setCart((c) => c.filter((i) => !keys.includes(cartKey(i))).map((i) => ({ ...i, selected: true })));

  const inWishlist = (id) => wishlist.some((p) => p.id === id);
  const toggleWishlist = async (product) => {
    const has = inWishlist(product.id);
    setWishlist((w) => (has ? w.filter((p) => p.id !== product.id) : [product, ...w]));
    toast.success(has ? 'Removed from wishlist' : 'Added to wishlist');
    if (!has) track.addToWishlist(product);
    if (user) {
      try {
        has ? await api.del(`/wishlist/${product.id}`) : await api.post(`/wishlist/${product.id}`);
      } catch { /* local state already updated */ }
    }
  };

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.quantity * i.price, 0);
  const selectedItems = cart.filter(isSelected);
  const selectedTotal = selectedItems.reduce((s, i) => s + i.quantity * i.price, 0);

  const value = useMemo(() => ({
    user, setUser, saveAuth, logout,
    cart, cartCount, cartTotal, makeLine, addToCart, updateQty, removeFromCart, clearCart,
    isSelected, toggleSelected, selectAll, removeKeys, selectedItems, selectedTotal,
    wishlist, inWishlist, toggleWishlist,
    settings, setSettings, categories, setCategories,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, cart, wishlist, settings, categories]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
