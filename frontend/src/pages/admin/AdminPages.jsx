import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiShoppingBag, FiDollarSign, FiUsers, FiBox, FiClock, FiAlertTriangle, FiX, FiPrinter, FiTrash2,
  FiTrendingUp, FiMail, FiSlash, FiShield, FiSearch,
} from 'react-icons/fi';
import api, { imageUrl, money } from '../../api/client';
import { useStore } from '../../context/StoreContext';
import OrderView, { StatusBadge } from '../../components/OrderView';
import { BarChart } from './AdminExtra';

const ALL_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal card ${wide ? 'modal--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><FiX /></button></div>
        {children}
      </div>
    </div>
  );
}

const PayBadge = ({ status }) => (
  <span className={`status status--${status === 'paid' ? 'delivered' : status === 'refunded' ? 'cancelled' : 'pending'}`}>{status}</span>
);

function OrdersTable({ orders, onOpen }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Phone</th><th>Total</th><th>Status</th><th>Payment</th><th>Date</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} onClick={() => onOpen?.(o)} className={onOpen ? 'clickable' : ''}>
              <td><b>#{o.order_number}</b></td><td>{o.customer_name}</td><td>{o.phone}</td>
              <td className="gold">{money(o.total)}</td><td><StatusBadge status={o.status} /></td>
              <td><PayBadge status={o.payment_status || 'unpaid'} /></td><td>{o.created_at.slice(0, 16)}</td>
            </tr>
          ))}
          {!orders.length && <tr><td colSpan={7} className="muted center">No orders</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const [s, setS] = useState(null);
  const [report, setReport] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    api.get('/admin/stats').then(setS).catch((e) => toast.error(e.message));
    api.get('/admin/reports?days=14').then(setReport).catch(() => {});
  }, []);
  if (!s) return <div className="spinner" />;
  const cards = [
    [<FiDollarSign key="1" />, 'Total Revenue', money(s.revenue), '/admin/reports'],
    [<FiTrendingUp key="2" />, `Today's Sales (${s.today_orders} orders)`, money(s.today_revenue), '/admin/orders'],
    [<FiClock key="3" />, 'Pending Orders', s.pending_orders, '/admin/orders?status=pending'],
    [<FiShoppingBag key="4" />, 'Total Orders', s.orders, '/admin/orders'],
    [<FiUsers key="5" />, 'Customers', s.customers, '/admin/customers'],
    [<FiBox key="6" />, 'Products', s.products, '/admin/products'],
    [<FiAlertTriangle key="7" />, 'Low Stock (≤5)', s.low_stock, '/admin/inventory'],
    [<FiMail key="8" />, 'Unread Messages', s.unread_messages, '/admin/messages'],
  ];
  return (
    <>
      <h1 className="admin__title">Dashboard</h1>
      <div className="stat-grid">
        {cards.map(([icon, label, value, to]) => (
          <Link key={label} to={to} className="card stat stat--link"><span className="stat__icon">{icon}</span><div><p className="muted small">{label}</p><h3>{value}</h3></div></Link>
        ))}
      </div>
      {s.unpaid_delivered > 0 && (
        <div className="alert">{s.unpaid_delivered} delivered order(s) still marked unpaid — <Link to="/admin/orders?payment=unpaid&status=delivered" className="gold">review payments</Link></div>
      )}
      <div className="admin-cols">
        <div className="card admin-card">
          <div className="admin-card__head"><h3>Sales — last 14 days</h3><Link to="/admin/reports" className="gold small">Full report →</Link></div>
          {report ? <BarChart series={report.series} height={200} /> : <div className="spinner" />}
        </div>
        <div className="card admin-card">
          <div className="admin-card__head"><h3>Low Stock</h3><Link to="/admin/inventory" className="gold small">Inventory →</Link></div>
          {!s.low_stock_items.length && <p className="muted">All products are well stocked.</p>}
          {s.low_stock_items.map((p) => (
            <div key={p.id} className="rank-row">
              <img src={imageUrl(p.image)} alt="" />
              <span className="rank-row__name">{p.name}</span>
              <b className={p.stock <= 0 ? 'danger' : 'gold'}>{p.stock <= 0 ? 'Out' : `${p.stock} left`}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-card__head admin__sub"><h3>Recent Orders</h3><Link to="/admin/orders" className="gold small">All orders →</Link></div>
      <OrdersTable orders={s.recent_orders} onOpen={() => navigate('/admin/orders')} />
    </>
  );
}

/* ---------------- Orders ---------------- */
function OrderModal({ id, onClose, onChanged }) {
  const [o, setO] = useState(null);
  const [form, setForm] = useState(null);
  const navigate = useNavigate();
  const load = () => api.get(`/admin/orders/${id}`).then((d) => {
    setO(d);
    setForm({ customer_name: d.customer_name, phone: d.phone, email: d.email || '', address: d.address, city: d.city || '', payment_status: d.payment_status, admin_note: d.admin_note || '' });
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);
  if (!o) return <Modal title="Order Details" onClose={onClose} wide><div className="spinner" /></Modal>;

  const changeStatus = async (st) => {
    try {
      await api.put(`/admin/orders/${o.id}/status`, { status: st });
      toast.success(`Order marked ${st}`);
      load();
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/admin/orders/${o.id}`, form);
      toast.success('Order updated');
      load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this order permanently? Stock will be restored.')) return;
    await api.del(`/admin/orders/${o.id}`);
    toast.success('Order deleted');
    onChanged();
    onClose();
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title="Order Details" onClose={onClose} wide>
      <OrderView order={o} />
      {o.note && <p className="small"><b>Customer note:</b> {o.note}</p>}
      <p className="small muted">Area: {o.area === 'outside_dhaka' ? 'Outside Dhaka' : 'Inside Dhaka'} · Payment: {o.payment_method.toUpperCase()}</p>

      <h4 className="modal__section">Order Status</h4>
      <div className="chips">
        {ALL_STATUSES.map((s) => (
          <button key={s} className={`chip ${o.status === s ? 'is-active' : ''}`} onClick={() => changeStatus(s)}>{s}</button>
        ))}
      </div>

      <form onSubmit={save}>
        <h4 className="modal__section">Edit Order</h4>
        <div className="form-grid">
          <label>Customer Name<input className="input" value={form.customer_name} onChange={set('customer_name')} /></label>
          <label>Phone<input className="input" value={form.phone} onChange={set('phone')} /></label>
          <label>Email<input className="input" value={form.email} onChange={set('email')} /></label>
          <label>City<input className="input" value={form.city} onChange={set('city')} /></label>
          <label className="span-2">Address<input className="input" value={form.address} onChange={set('address')} /></label>
          <label>Payment Status
            <select className="input" value={form.payment_status} onChange={set('payment_status')}>
              <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option>
            </select>
          </label>
          <label>Admin Note (private)<input className="input" value={form.admin_note} onChange={set('admin_note')} placeholder="e.g. Courier tracking no." /></label>
        </div>
        <div className="row">
          <button className="btn btn--gold">Save Changes</button>
          <button type="button" className="btn btn--ghost" onClick={() => navigate(`/admin/invoice/${o.id}`)}><FiPrinter /> Invoice</button>
          <button type="button" className="btn btn--ghost danger" onClick={remove}><FiTrash2 /> Delete</button>
        </div>
      </form>
    </Modal>
  );
}

export function Orders() {
  const initial = new URLSearchParams(window.location.search);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState(initial.get('status') || '');
  const [payment, setPayment] = useState(initial.get('payment') || '');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const load = () => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (payment) qs.set('payment', payment);
    if (q) qs.set('q', q);
    return api.get(`/admin/orders?${qs}`).then(setOrders).catch((e) => toast.error(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [status, payment, q]);

  const counts = ALL_STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]);

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Orders</h1>
        <div className="search-input"><FiSearch /><input placeholder="Order no, phone, name..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input input--auto" value={payment} onChange={(e) => setPayment(e.target.value)}>
          <option value="">All payments</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option>
        </select>
      </div>
      <div className="chips chips--flat tabs-row">
        <button className={`chip ${!status ? 'is-active' : ''}`} onClick={() => setStatus('')}>All</button>
        {ALL_STATUSES.map((s) => (
          <button key={s} className={`chip ${status === s ? 'is-active' : ''}`} onClick={() => setStatus(s)}>
            {s}{!status && counts.find((c) => c[0] === s)[1] ? ` (${counts.find((c) => c[0] === s)[1]})` : ''}
          </button>
        ))}
      </div>
      <OrdersTable orders={orders} onOpen={(o) => setOpen(o.id)} />
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

/* ---------------- Customers & staff ---------------- */
function UserModal({ id, onClose, onChanged }) {
  const [u, setU] = useState(null);
  const load = () => api.get(`/admin/users/${id}`).then(setU).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);
  const update = async (body, msg) => {
    try {
      await api.put(`/admin/users/${id}`, body);
      toast.success(msg);
      load();
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <Modal title="Customer Details" onClose={onClose} wide>
      {!u ? <div className="spinner" /> : (
        <>
          <div className="user-head">
            <span className="avatar">{u.name[0]?.toUpperCase()}</span>
            <div>
              <h3>{u.name} {u.role === 'admin' && <span className="status status--shipped">admin</span>} {!!u.is_blocked && <span className="status status--cancelled">blocked</span>}</h3>
              <p className="muted small">{u.email} · {u.phone || 'No phone'} · Joined {u.created_at.slice(0, 10)}</p>
              {u.address && <p className="muted small">{u.address}{u.city ? `, ${u.city}` : ''}</p>}
            </div>
          </div>
          <div className="stat-grid stat-grid--sm">
            <div className="card stat stat--plain"><div><p className="muted small">Orders</p><h3>{u.orders.length}</h3></div></div>
            <div className="card stat stat--plain"><div><p className="muted small">Total Spent</p><h3>{money(u.total_spent)}</h3></div></div>
          </div>
          <h4 className="modal__section">Order History</h4>
          {!u.orders.length && <p className="muted">No orders yet.</p>}
          {u.orders.map((o) => (
            <div key={o.id} className="rank-row">
              <b>#{o.order_number}</b><span className="muted small rank-row__name">{o.created_at.slice(0, 10)}</span>
              <StatusBadge status={o.status} /><b className="gold">{money(o.total)}</b>
            </div>
          ))}
          <div className="row modal__actions">
            <button className="btn btn--ghost" onClick={() => update({ is_blocked: !u.is_blocked }, u.is_blocked ? 'User unblocked' : 'User blocked')}>
              <FiSlash /> {u.is_blocked ? 'Unblock' : 'Block'} user
            </button>
            <button className="btn btn--ghost" onClick={() => update({ role: u.role === 'admin' ? 'customer' : 'admin' }, 'Role updated')}>
              <FiShield /> {u.role === 'admin' ? 'Remove admin access' : 'Make admin'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function Customers() {
  const [rows, setRows] = useState([]);
  const [role, setRole] = useState('customer');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const load = () => api.get(`/admin/customers?role=${role}&q=${encodeURIComponent(q)}`).then(setRows).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [role, q]);
  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">{role === 'admin' ? 'Admins & Staff' : 'Customers'}</h1>
        <div className="search-input"><FiSearch /><input placeholder="Name, email, phone..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips chips--flat">
          <button className={`chip ${role === 'customer' ? 'is-active' : ''}`} onClick={() => setRole('customer')}>Customers</button>
          <button className={`chip ${role === 'admin' ? 'is-active' : ''}`} onClick={() => setRole('admin')}>Admins</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Spent</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="clickable" onClick={() => setOpen(u.id)}>
                <td><b>{u.name}</b></td><td>{u.email}</td><td>{u.phone}</td><td>{u.order_count}</td>
                <td className="gold">{money(u.total_spent)}</td>
                <td>{u.is_blocked ? <span className="status status--cancelled">blocked</span> : <span className="status status--delivered">active</span>}</td>
                <td>{u.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted center">No {role === 'admin' ? 'admins' : 'customers'} found</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <UserModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

/* ---------------- Messages ---------------- */
export function Messages() {
  const [rows, setRows] = useState([]);
  const load = () => api.get('/admin/messages').then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  const markRead = async (id) => { await api.put(`/admin/messages/${id}/read`); load(); };
  return (
    <>
      <h1 className="admin__title">Messages</h1>
      {!rows.length && <p className="muted">No messages yet.</p>}
      {rows.map((m) => (
        <div key={m.id} className={`card msg ${m.is_read ? '' : 'msg--new'}`}>
          <div className="msg__head">
            <b>{m.name}</b><span className="muted small">{m.phone} {m.email} · {m.created_at.slice(0, 16)}</span>
            {!m.is_read && <button className="btn btn--ghost btn--sm msg__actions" onClick={() => markRead(m.id)}>Mark read</button>}
          </div>
          {m.subject && <p className="gold">{m.subject}</p>}
          <p className="pre">{m.message}</p>
        </div>
      ))}
    </>
  );
}

/* ---------------- Settings ---------------- */
const SETTING_GROUPS = [
  ['Store Information', [['site_name', 'Store Name'], ['site_url', 'Website URL (used in product feeds)'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']]],
  ['Marketing & Tracking', [
    ['fb_pixel_id', 'Facebook (Meta) Pixel ID — e.g. 123456789012345'],
    ['tiktok_pixel_id', 'TikTok Pixel ID — e.g. C1A2B3C4D5E6F7G8H9I0'],
    ['gtm_id', 'Google Tag Manager ID — e.g. GTM-XXXXXXX'],
    ['ga4_id', 'Google Analytics 4 ID — e.g. G-XXXXXXXXXX'],
  ]],
  ['Social Links', [['facebook', 'Facebook URL'], ['whatsapp', 'WhatsApp URL'], ['messenger', 'Messenger URL']]],
  ['Delivery Charges', [['delivery_inside_dhaka', 'Inside Dhaka (৳)'], ['delivery_outside_dhaka', 'Outside Dhaka (৳)']]],
];

const FEEDS = [
  ['Facebook / Instagram / Google (XML)', 'products.xml'],
  ['TikTok Catalog (XML)', 'products.xml'],
  ['TikTok Catalog (CSV)', 'tiktok.csv'],
];

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function Settings() {
  const { settings, setSettings } = useStore();
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/settings', form);
      setSettings(form);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <h1 className="admin__title">Settings</h1>
      <form className="card form-card" onSubmit={save}>
        {SETTING_GROUPS.map(([title, fields]) => (
          <div key={title}>
            <h3>{title}</h3>
            <div className="form-grid">
              {fields.map(([k, label]) => (
                <label key={k}>{label}<input className="input" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
              ))}
            </div>
          </div>
        ))}
        <h3>Product Catalog Feeds</h3>
        <p className="muted small">Paste these links in Facebook Commerce Manager, TikTok Catalog Manager or Google Merchant Center as a scheduled data feed. They update automatically from your products.</p>
        <div className="feed-list">
          {FEEDS.map(([label, path]) => {
            const url = `${import.meta.env.VITE_API_URL || window.location.origin}/api/feed/${path}`;
            return (
              <div key={path} className="feed-row">
                <span>{label}</span>
                <code>{url}</code>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Copied'))}>Copy</button>
                <a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noreferrer">Open</a>
              </div>
            );
          })}
        </div>
        <p className="muted small">Pixel events sent: PageView, ViewContent, AddToCart, AddToWishlist, InitiateCheckout, Search, Purchase (TikTok: CompletePayment), CompleteRegistration. GA4/GTM get the matching ecommerce events in the dataLayer. Leave an ID empty to turn that platform off; changes apply on the next page load.</p>

        <h3>Flash Sale</h3>
        <div className="form-grid">
          <label>Flash Sale Ends At
            <input className="input" type="datetime-local" value={toLocalInput(form.flash_sale_end)}
              onChange={(e) => setForm({ ...form, flash_sale_end: new Date(e.target.value).toISOString() })} />
          </label>
          <p className="muted small">Mark products as "Flash Sale" from Products or Inventory.</p>
        </div>
        <button className="btn btn--gold">Save Settings</button>
      </form>
    </>
  );
}

