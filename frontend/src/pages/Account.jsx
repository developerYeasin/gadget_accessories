import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FiBell, FiLock, FiLogOut, FiPackage, FiUser } from 'react-icons/fi';
import { currentSubscription, permission, pushSupported, subscribePush, unsubscribePush } from '../api/push';
import toast from 'react-hot-toast';
import api, { money } from '../api/client';
import { useStore } from '../context/StoreContext';
import OrderView, { StatusBadge } from '../components/OrderView';
import { PasswordForm, ProfileForm } from '../components/AccountForms';

export default function Account() {
  const { user, logout } = useStore();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(null);
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => { currentSubscription().then((s) => setPushOn(Boolean(s) && permission() === 'granted')); }, []);
  const togglePush = async () => {
    try {
      if (pushOn) {
        await unsubscribePush();
        setPushOn(false);
        toast.success('Notifications turned off');
      } else {
        await subscribePush();
        setPushOn(true);
        toast.success('Notifications turned on');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (user) api.get('/orders/my').then(setOrders).catch(() => {});
  }, [user]);

  if (!user) return <Navigate to="/login" state={{ from: '/account' }} replace />;

  const openOrder = async (o) => {
    if (open?.id === o.id) return setOpen(null);
    setOpen(await api.get(`/orders/${o.order_number}`));
  };

  return (
    <div className="container page">
      <h1 className="page-title">Hello, <span className="gold">{user.name}</span></h1>
      <div className="account">
        <aside className="card account__nav">
          <button className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')}><FiPackage /> My Orders</button>
          <button className={tab === 'profile' ? 'is-active' : ''} onClick={() => setTab('profile')}><FiUser /> Profile</button>
          <button className={tab === 'security' ? 'is-active' : ''} onClick={() => setTab('security')}><FiLock /> Password &amp; Security</button>
          {user.role === 'admin' && <Link to="/admin">Admin Panel</Link>}
          {pushSupported() && <button onClick={togglePush}><FiBell /> Notifications: {pushOn ? 'On' : 'Off'}</button>}
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
          ) : tab === 'profile' ? <ProfileForm /> : <PasswordForm />}
        </div>
      </div>
    </div>
  );
}
