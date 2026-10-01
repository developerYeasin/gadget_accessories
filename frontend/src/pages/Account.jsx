import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FiLogOut, FiPackage, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api, { money } from '../api/client';
import { useStore } from '../context/StoreContext';
import OrderView, { StatusBadge } from '../components/OrderView';

export default function Account() {
  const { user, setUser, logout } = useStore();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', address: user?.address || '', city: user?.city || '', password: '' });

  useEffect(() => {
    if (user) api.get('/orders/my').then(setOrders).catch(() => {});
  }, [user]);

  if (!user) return <Navigate to="/login" state={{ from: '/account' }} replace />;

  const openOrder = async (o) => {
    if (open?.id === o.id) return setOpen(null);
    setOpen(await api.get(`/orders/${o.order_number}`));
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const u = await api.put('/auth/me', form);
      setUser(u);
      localStorage.setItem('gah_user', JSON.stringify(u));
      setForm({ ...form, password: '' });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="container page">
      <h1 className="page-title">Hello, <span className="gold">{user.name}</span></h1>
      <div className="account">
        <aside className="card account__nav">
          <button className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')}><FiPackage /> My Orders</button>
          <button className={tab === 'profile' ? 'is-active' : ''} onClick={() => setTab('profile')}><FiUser /> Profile</button>
          {user.role === 'admin' && <Link to="/admin">Admin Panel</Link>}
          <button onClick={logout}><FiLogOut /> Logout</button>
        </aside>
        <div className="card form-card">
          {tab === 'orders' ? (
            <>
              <h3>My Orders</h3>
              {!orders.length && <p className="muted">No orders yet. <Link to="/shop" className="gold">Start shopping</Link></p>}
              {orders.map((o) => (
                <div key={o.id} className="order-row">
                  <button className="order-row__head" onClick={() => openOrder(o)}>
                    <b>#{o.order_number}</b>
                    <span className="muted small">{o.created_at.slice(0, 10)}</span>
                    <StatusBadge status={o.status} />
                    <b className="gold">{money(o.total)}</b>
                  </button>
                  {open?.id === o.id && <OrderView order={open} />}
                </div>
              ))}
            </>
          ) : (
            <form onSubmit={save}>
              <h3>Profile</h3>
              <div className="form-grid">
                <label>Name<input className="input" value={form.name} onChange={set('name')} /></label>
                <label>Phone<input className="input" value={form.phone} onChange={set('phone')} /></label>
                <label>City<input className="input" value={form.city} onChange={set('city')} /></label>
                <label>Email<input className="input" value={user.email} disabled /></label>
                <label className="span-2">Address<textarea className="input" rows={2} value={form.address} onChange={set('address')} /></label>
                <label className="span-2">New Password (optional)<input className="input" type="password" value={form.password} onChange={set('password')} /></label>
              </div>
              <button className="btn btn--gold">Save Changes</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
