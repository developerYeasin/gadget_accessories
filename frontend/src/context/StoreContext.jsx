import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { track } from '../api/tracking';

const StoreContext = createContext(null);

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

  const addToCart = (product, quantity = 1, silent = false) => {
    if (product.stock <= 0) return toast.error('Out of stock');
    setCart((c) => {
      const found = c.find((i) => i.id === product.id);
      if (found) return c.map((i) => (i.id === product.id ? { ...i, quantity: Math.min(i.quantity + quantity, product.stock) } : i));
      const { id, name, slug, price, old_price, image, stock } = product;
      return [...c, { id, name, slug, price, old_price, image, stock, quantity }];
    });
    track.addToCart(product, quantity);
    if (!silent) toast.success('Added to cart');
  };
  const updateQty = (id, quantity) =>
    setCart((c) => c.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock || 99)) } : i)));
  const removeFromCart = (id) => setCart((c) => c.filter((i) => i.id !== id));
  const clearCart = () => setCart([]);

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

  const value = useMemo(() => ({
    user, setUser, saveAuth, logout,
    cart, cartCount, cartTotal, addToCart, updateQty, removeFromCart, clearCart,
    wishlist, inWishlist, toggleWishlist,
    settings, setSettings, categories, setCategories,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, cart, wishlist, settings, categories]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
