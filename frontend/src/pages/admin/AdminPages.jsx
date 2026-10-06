import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiShoppingBag, FiDollarSign, FiUsers, FiBox, FiClock, FiAlertTriangle, FiX, FiPrinter, FiTrash2,
  FiTrendingUp, FiMail, FiSlash, FiShield, FiSearch, FiTruck, FiRefreshCw, FiExternalLink,
  FiSettings, FiCreditCard, FiPackage, FiKey, FiLogOut, FiPlus,
} from 'react-icons/fi';
import api, { imageUrl, money } from '../../api/client';
import { useStore } from '../../context/StoreContext';
import OrderView, { StatusBadge } from '../../components/OrderView';
import { BarChart } from './AdminExtra';
import { Avatar, PasswordForm, PasswordInput, ProfileForm, StrengthMeter } from '../../components/AccountForms';

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

// Orders that can still be handed to the courier
const COURIER_NAMES = { steadfast: 'Steadfast', pathao: 'Pathao' };
const trackUrl = (o) => (o.courier === 'pathao'
  ? `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(o.courier_tracking_code)}&phone=${encodeURIComponent(o.phone || '')}`
  : `https://steadfast.com.bd/t/${encodeURIComponent(o.courier_tracking_code)}`);
const canShip = (o) => !o.courier_tracking_code && o.status !== 'cancelled' && o.status !== 'delivered';

// Delivery success rate for one order's phone: cached result shows at once, otherwise a Check button
function FraudCell({ phone, cached }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = d || cached;
  const check = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      setD((await api.get(`/admin/courier/check?phone=${encodeURIComponent(phone)}`)).summary);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (!s) return <button className="btn btn--ghost btn--sm" onClick={check} disabled={busy}>{busy ? '…' : 'Check'}</button>;
  if (!s.total) return <span className="muted small">New</span>;
  const level = s.ratio >= 80 ? 'good' : s.ratio >= 50 ? 'mid' : 'bad';
  return (
    <span className="small nowrap" title={`${s.success} delivered · ${s.cancelled} cancelled of ${s.total}`}>
      <b className={`ratio--${level}`}>{s.ratio}%</b> <span className="muted">{s.success}/{s.total}</span>
    </span>
  );
}

function OrdersTable({ orders, onOpen, selected, onSelect }) {
  const [fraud, setFraud] = useState({});
  const phoneKey = orders.map((o) => o.phone).join(',');
  useEffect(() => {
    if (!orders.length) return;
    api.post('/admin/courier/check-cached', { phones: orders.map((o) => o.phone) }).then(setFraud).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneKey]);
  const localPhone = (p) => { let d = String(p).replace(/\D/g, ''); if (d.startsWith('880')) d = d.slice(2); return d; };
  const selectable = !!onSelect;
  const shippable = orders.filter(canShip);
  const allOn = selectable && shippable.length > 0 && shippable.every((o) => selected.has(o.id));
  const toggle = (id) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onSelect(n); };
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>
          {selectable && <th><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => onSelect(allOn ? new Set() : new Set(shippable.map((o) => o.id)))} /></th>}
          <th>Order</th><th>Customer</th><th>Phone</th><th>Total</th><th>Status</th><th>Payment</th><th>Courier Rate</th><th>Courier</th><th>Date</th>
        </tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} onClick={() => onOpen?.(o)} className={onOpen ? 'clickable' : ''}>
              {selectable && (
                <td onClick={(e) => e.stopPropagation()}>
                  {canShip(o) && <input type="checkbox" aria-label={`Select order ${o.order_number}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />}
                </td>
              )}
              <td><b>#{o.order_number}</b></td><td>{o.customer_name}</td><td>{o.phone}</td>
              <td className="gold">{money(o.total)}</td><td><StatusBadge status={o.status} /></td>
              <td><PayBadge status={o.payment_status || 'unpaid'} /></td>
              <td onClick={(e) => e.stopPropagation()}><FraudCell phone={o.phone} cached={fraud[localPhone(o.phone)]} /></td>
              <td>{o.courier_tracking_code ? <span className="small">{o.courier_tracking_code}<br /><span className="muted">{(o.courier_status || '').replace(/_/g, ' ')}</span></span> : <span className="muted">—</span>}</td>
              <td>{o.created_at.slice(0, 16)}</td>
            </tr>
          ))}
          {!orders.length && <tr><td colSpan={selectable ? 10 : 9} className="muted center">No orders</td></tr>}
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
// Customer's delivery record across all couriers — a low success rate means a risky COD order
function CourierHistory({ phone }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = (force) => {
    setBusy(true);
    setErr('');
    return api.get(`/admin/courier/check?phone=${encodeURIComponent(phone)}${force ? '&force=1' : ''}`)
      .then(setD).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [phone]);
  if (err) return <p className="muted small">{err}</p>;
  if (!d) return <div className="spinner" />;
  const { total, success, cancelled, ratio } = d.summary;
  const level = !total ? 'new' : ratio >= 80 ? 'good' : ratio >= 50 ? 'mid' : 'bad';
  return (
    <div className="courier-check">
      <div className="courier-check__stats">
        <div><span className="muted small">Total parcels</span><b>{total}</b></div>
        <div><span className="muted small">Delivered</span><b className="ratio--good">{success}</b></div>
        <div><span className="muted small">Cancelled</span><b className="ratio--bad">{cancelled}</b></div>
        <div><span className="muted small">Success rate</span><b className={`ratio--${level}`}>{total ? `${ratio}%` : 'New customer'}</b></div>
      </div>
      {total > 0 && <div className="ratio-bar" role="img" aria-label={`${ratio}% delivered`}><i className={`ratio-bar--${level}`} style={{ width: `${ratio}%` }} /></div>}
      {d.couriers.map((c) => (
        <div key={c.name} className="courier-check__row small">
          <span>{c.name}</span><span className="muted">{c.total} total</span><span className="ratio--good">{c.success} delivered</span><span className="ratio--bad">{c.cancelled} cancelled</span>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => load(true)} disabled={busy}><FiRefreshCw /> {busy ? 'Checking…' : 'Check again'}</button>
        <span className="muted small">Checked {new Date(d.checked_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

function CourierPanel({ o, onChanged }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (o.courier_tracking_code) {
    return (
      <div className="row">
        <span>{COURIER_NAMES[o.courier] || o.courier} · <b className="gold">{o.courier_tracking_code}</b></span>
        <span className="status status--shipped">{(o.courier_status || 'booked').replace(/_/g, ' ')}</span>
        <a className="btn btn--ghost btn--sm" href={trackUrl(o)} target="_blank" rel="noreferrer"><FiExternalLink /> Track</a>
        <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => api.post(`/admin/orders/${o.id}/courier/refresh`), 'Courier status updated')}><FiRefreshCw /> Refresh status</button>
      </div>
    );
  }
  if (!canShip(o)) return <p className="muted small">Not sent to a courier.</p>;
  const cod = o.payment_status === 'paid' ? 0 : o.total;
  return (
    <div className="row">
      {Object.entries(COURIER_NAMES).map(([key, name], i) => (
        <button key={key} className={`btn btn--sm ${i ? 'btn--outline' : 'btn--gold'}`} disabled={busy}
          onClick={() => window.confirm(`Send to ${name} with ${money(cod)} cash to collect?`) && run(() => api.post(`/admin/orders/${o.id}/courier`, { courier: key }), `Parcel booked with ${name}`)}>
          <FiTruck /> {busy ? 'Sending…' : `Send to ${name}`}
        </button>
      ))}
      <span className="muted small">Cash to collect: {money(cod)}{o.payment_status === 'paid' ? ' (paid online)' : ''}</span>
    </div>
  );
}

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
      <p className="small muted">
        Area: {o.area === 'outside_dhaka' ? 'Outside Dhaka' : 'Inside Dhaka'} · Payment: {({ online: 'Online', bkash: 'bKash', sslcommerz: 'SSLCommerz' })[o.payment_method] || o.payment_method.toUpperCase()} <PayBadge status={o.payment_status} />
        {o.payment_ref && <> · Ref: {o.payment_ref}</>}
      </p>

      <h4 className="modal__section">Customer Delivery History</h4>
      <CourierHistory phone={o.phone} />

      <h4 className="modal__section">Courier</h4>
      <CourierPanel o={o} onChanged={() => { load(); onChanged(); }} />

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
          <label>Admin Note (private)<input className="input" value={form.admin_note} onChange={set('admin_note')} placeholder="Only admins can see this" /></label>
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
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
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
  const visibleSelected = orders.filter((o) => selected.has(o.id) && canShip(o)).map((o) => o.id);

  const [bulkCourier, setBulkCourier] = useState('steadfast');
  const sendBulk = async () => {
    if (!window.confirm(`Send ${visibleSelected.length} order(s) to ${COURIER_NAMES[bulkCourier]}?`)) return;
    setSending(true);
    try {
      const { results } = await api.post('/admin/courier/bulk', { ids: visibleSelected, courier: bulkCourier });
      const failed = results.filter((r) => !r.ok);
      if (results.length > failed.length) toast.success(`${results.length - failed.length} parcel(s) booked`);
      failed.forEach((r) => toast.error(`#${orders.find((o) => o.id === r.id)?.order_number}: ${r.message}`, { duration: 6000 }));
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

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
      {visibleSelected.length > 0 && (
        <div className="alert row">
          <span>{visibleSelected.length} order(s) selected</span>
          <select className="input input--auto" value={bulkCourier} onChange={(e) => setBulkCourier(e.target.value)}>
            {Object.entries(COURIER_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <button className="btn btn--gold btn--sm" onClick={sendBulk} disabled={sending}><FiTruck /> {sending ? 'Sending…' : `Send to ${COURIER_NAMES[bulkCourier]}`}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      <OrdersTable orders={orders} onOpen={(o) => setOpen(o.id)} selected={selected} onSelect={setSelected} />
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

/* ---------------- Customers & staff ---------------- */
const randomPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join('');
};

// New password field with a generator, shared by "Add user" and "Reset password"
function NewPasswordField({ value, onChange }) {
  return (
    <label>Password
      <PasswordInput required minLength={6} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="pw-tools">
        <StrengthMeter password={value} />
        <button type="button" className="link-btn" onClick={() => onChange(randomPassword())}>Generate</button>
        {value && <button type="button" className="link-btn" onClick={() => copy(value)}>Copy</button>}
      </span>
    </label>
  );
}

function UserForm({ initial, onSubmit, submitLabel, withPassword }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', city: '', address: '', role: 'customer', password: '', ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(f); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>Name<input className="input" required value={f.name} onChange={set('name')} /></label>
        <label>Email<input className="input" type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Phone<input className="input" value={f.phone || ''} onChange={set('phone')} /></label>
        <label>City<input className="input" value={f.city || ''} onChange={set('city')} /></label>
        <label className="span-2">Address<textarea className="input" rows={2} value={f.address || ''} onChange={set('address')} /></label>
        {withPassword && (
          <>
            <label>Role
              <select className="input" value={f.role} onChange={set('role')}>
                <option value="customer">Customer</option><option value="admin">Admin</option>
              </select>
            </label>
            <NewPasswordField value={f.password} onChange={(v) => setF({ ...f, password: v })} />
          </>
        )}
      </div>
      <button className="btn btn--gold" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}

function AddUserModal({ role, onClose, onCreated }) {
  const create = async (f) => {
    try {
      const { id } = await api.post('/admin/users', f);
      toast.success('User created');
      onCreated(id);
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <Modal title="Add User" onClose={onClose}>
      <p className="muted small">Share the password with the user — they can change it from their account.</p>
      <UserForm initial={{ role }} withPassword submitLabel="Create User" onSubmit={create} />
    </Modal>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

function UserModal({ id, onClose, onChanged }) {
  const { user: me } = useStore();
  const [u, setU] = useState(null);
  const [mode, setMode] = useState('view');
  const [pw, setPw] = useState('');
  const load = () => api.get(`/admin/users/${id}`).then(setU).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);
  const self = me?.id === Number(id);
  const run = async (fn, msg) => {
    try {
      await fn();
      toast.success(msg);
      load();
      onChanged();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  };
  const update = (body, msg) => run(() => api.put(`/admin/users/${id}`, body), msg);
  const saveEdit = async ({ name, email, phone, city, address }) => {
    if (await update({ name, email, phone, city, address }, 'User updated')) setMode('view');
  };
  const resetPw = async (e) => {
    e.preventDefault();
    if (await run(() => api.put(`/admin/users/${id}/password`, { password: pw }), 'Password changed — the user has been signed out')) {
      setPw('');
      setMode('view');
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the account of ${u.name}? Their orders are kept, but the account cannot be recovered.`)) return;
    try {
      await api.del(`/admin/users/${id}`);
      toast.success('User deleted');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const tabs = self ? [['view', 'Overview']] : [['view', 'Overview'], ['edit', 'Edit Details'], ['password', 'Reset Password']];
  return (
    <Modal title="User Details" onClose={onClose} wide>
      {!u ? <div className="spinner" /> : (
        <>
          <div className="user-head">
            <Avatar user={u} />
            <div>
              <h3>{u.name} {u.role === 'admin' && <span className="status status--shipped">admin</span>} {!!u.is_blocked && <span className="status status--cancelled">blocked</span>} {self && <span className="muted small">(you)</span>}</h3>
              <p className="muted small">{u.email} · {u.phone || 'No phone'} · Joined {u.created_at.slice(0, 10)}</p>
              {u.address && <p className="muted small">{u.address}{u.city ? `, ${u.city}` : ''}</p>}
              <p className="muted small">Last login: {fmtDate(u.last_login_at)} · Password changed: {fmtDate(u.password_changed_at)}</p>
            </div>
          </div>

          {tabs.length > 1 && (
            <div className="chips chips--flat user-tabs">
              {tabs.map(([k, l]) => (
                <button key={k} className={`chip ${mode === k ? 'is-active' : ''}`} onClick={() => setMode(k)}>{l}</button>
              ))}
            </div>
          )}

          {mode === 'edit' && <UserForm initial={u} submitLabel="Save Changes" onSubmit={saveEdit} />}

          {mode === 'password' && (
            <form onSubmit={resetPw}>
              <p className="muted small">Set a new password when the user forgets theirs. All their devices will be signed out.</p>
              <div className="form-grid"><NewPasswordField value={pw} onChange={setPw} /></div>
              <button className="btn btn--gold"><FiKey /> Set New Password</button>
            </form>
          )}

          {mode === 'view' && (
            <>
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
              {self ? (
                <p className="muted small modal__actions">To change your own details or password, go to <Link className="gold" to="/admin/account" onClick={onClose}>My Account</Link>.</p>
              ) : (
                <div className="row modal__actions">
                  <button className="btn btn--ghost" onClick={() => update({ is_blocked: !u.is_blocked }, u.is_blocked ? 'User unblocked' : 'User blocked')}>
                    <FiSlash /> {u.is_blocked ? 'Unblock' : 'Block'} user
                  </button>
                  <button className="btn btn--ghost" onClick={() => update({ role: u.role === 'admin' ? 'customer' : 'admin' }, 'Role updated')}>
                    <FiShield /> {u.role === 'admin' ? 'Remove admin access' : 'Make admin'}
                  </button>
                  <button className="btn btn--ghost" onClick={() => run(() => api.post(`/admin/users/${id}/logout`), 'User signed out from all devices')}>
                    <FiLogOut /> Sign out everywhere
                  </button>
                  <button className="btn btn--ghost btn--danger" onClick={remove}><FiTrash2 /> Delete</button>
                </div>
              )}
            </>
          )}
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
  const [adding, setAdding] = useState(false);
  const load = () => api.get(`/admin/customers?role=${role}&q=${encodeURIComponent(q)}`).then(setRows).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [role, q]);
  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Users</h1>
        <div className="search-input"><FiSearch /><input placeholder="Name, email, phone..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips chips--flat">
          <button className={`chip ${role === 'customer' ? 'is-active' : ''}`} onClick={() => setRole('customer')}>Customers</button>
          <button className={`chip ${role === 'admin' ? 'is-active' : ''}`} onClick={() => setRole('admin')}>Admins</button>
        </div>
        <button className="btn btn--gold btn--sm" onClick={() => setAdding(true)}><FiPlus /> Add User</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Spent</th><th>Status</th><th>Last Login</th><th>Joined</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="clickable" onClick={() => setOpen(u.id)}>
                <td><span className="user-cell"><Avatar user={u} size={30} /><b>{u.name}</b></span></td><td>{u.email}</td><td>{u.phone}</td><td>{u.order_count}</td>
                <td className="gold">{money(u.total_spent)}</td>
                <td>{u.is_blocked ? <span className="status status--cancelled">blocked</span> : <span className="status status--delivered">active</span>}</td>
                <td className="nowrap">{u.last_login_at ? String(u.last_login_at).slice(0, 10) : <span className="muted">—</span>}</td>
                <td>{u.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="muted center">No {role === 'admin' ? 'admins' : 'customers'} found</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <UserModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && <AddUserModal role={role} onClose={() => setAdding(false)} onCreated={(newId) => { setAdding(false); load(); setOpen(newId); }} />}
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
  ['general', 'Store Information', [['site_name', 'Store Name'], ['site_url', 'Website URL (used in product feeds)'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']]],
  ['marketing', 'Marketing & Tracking', [
    ['fb_pixel_id', 'Facebook (Meta) Pixel ID — e.g. 123456789012345'],
    ['fb_capi_token', 'Meta Conversions API Access Token (server-side tracking)', 'secret'],
    ['fb_test_event_code', 'Meta Test Event Code — only while testing, e.g. TEST12345', 'secret'],
    ['tiktok_pixel_id', 'TikTok Pixel ID — e.g. C1A2B3C4D5E6F7G8H9I0'],
    ['tiktok_access_token', 'TikTok Events API Access Token (server-side tracking)', 'secret'],
    ['gtm_id', 'Google Tag Manager ID — e.g. GTM-XXXXXXX'],
    ['ga4_id', 'Google Analytics 4 ID — e.g. G-XXXXXXXXXX'],
  ]],
  ['courier', 'Courier — Steadfast', [
    ['steadfast_api_key', 'Steadfast API Key', 'secret'],
    ['steadfast_secret_key', 'Steadfast Secret Key', 'secret'],
    ['steadfast_webhook_token', 'Webhook Auth Token — any long random text, same as in the Steadfast portal', 'secret'],
    ['bdcourier_api_key', 'BD Courier API Key — customer delivery history (bdcourier.com)', 'secret'],
  ], [['Steadfast webhook URL (Steadfast portal → API → Webhook)', 'courier/steadfast/webhook']]],
  ['courier', 'Courier — Pathao', [
    ['pathao_client_id', 'Pathao Client ID (merchant.pathao.com → Developers API)', 'secret'],
    ['pathao_client_secret', 'Pathao Client Secret', 'secret'],
    ['pathao_username', 'Pathao merchant login email', 'secret'],
    ['pathao_password', 'Pathao merchant login password', 'secret'],
    ['pathao_webhook_secret', 'Webhook Secret — any long random text, same as in the Pathao panel', 'secret'],
    ['pathao_store_id', 'Store ID — leave empty to use your first Pathao store'],
    ['pathao_default_weight', 'Parcel weight sent to Pathao (kg), default 0.5'],
    ['pathao_sandbox', 'Sandbox (test) mode', 'toggle'],
  ], [['Pathao webhook URL (Pathao panel → Developers API → Webhook)', 'courier/pathao/webhook']]],
  ['payment', 'Online Payment — BizscalPay', [
    ['bizscalpay_enabled', 'Show "Pay Online" at checkout', 'toggle'],
    ['bizscalpay_api_key', 'BizscalPay API Key', 'secret'],
    ['bizscalpay_webhook_secret', 'BizscalPay Webhook Secret', 'secret'],
    ['bizscalpay_api_base', 'API Base URL — leave empty for https://bizscalpaybackend.bizscal.com'],
  ], [['BizscalPay webhook URL (BizscalPay dashboard → Webhooks)', 'payment/bizscalpay/webhook']]],
  ['payment', 'Online Payment — bKash (merchant tokenized checkout)', [
    ['bkash_enabled', 'Show "bKash" at checkout', 'toggle'],
    ['bkash_sandbox', 'Sandbox (test) mode', 'toggle'],
    ['bkash_app_key', 'bKash App Key', 'secret'],
    ['bkash_app_secret', 'bKash App Secret', 'secret'],
    ['bkash_username', 'bKash API Username', 'secret'],
    ['bkash_password', 'bKash API Password', 'secret'],
  ]],
  ['payment', 'Online Payment — SSLCommerz (card, bKash, Nagad, Rocket, bank)', [
    ['sslcommerz_enabled', 'Show "Card / Mobile Banking" at checkout', 'toggle'],
    ['sslcommerz_sandbox', 'Sandbox (test) mode', 'toggle'],
    ['sslcommerz_store_id', 'SSLCommerz Store ID', 'secret'],
    ['sslcommerz_store_password', 'SSLCommerz Store Password', 'secret'],
  ], [['SSLCommerz IPN URL (SSLCommerz merchant panel → IPN settings)', 'payment/sslcommerz/ipn']]],
  ['general', 'Social & WhatsApp', [['whatsapp', 'WhatsApp Number — e.g. 01411612350'], ['facebook', 'Facebook URL'], ['messenger', 'Messenger URL']]],
  ['delivery', 'Delivery Charges (by weight)', [
    ['delivery_inside_dhaka', 'Inside Dhaka — base charge (৳), default 70'],
    ['delivery_outside_dhaka', 'Outside Dhaka — base charge (৳), default 130'],
    ['delivery_base_weight', 'Base charge covers up to (grams), default 1000'],
    ['delivery_extra_kg_inside', 'Inside Dhaka — each extra kg (৳), default 15'],
    ['delivery_extra_kg_outside', 'Outside Dhaka — each extra kg (৳), default 25'],
    ['delivery_default_weight', 'Weight for products with no weight set (grams), default 0'],
  ]],
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

const apiUrl = (path) => `${import.meta.env.VITE_API_URL || window.location.origin}/api/${path}`;
const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copied'));

function SettingField({ label, kind, value, onChange }) {
  const [show, setShow] = useState(false);
  if (kind === 'toggle') {
    return (
      <label>{label}
        <select className="input" value={value === '1' ? '1' : '0'} onChange={(e) => onChange(e.target.value)}>
          <option value="0">Off</option><option value="1">On</option>
        </select>
      </label>
    );
  }
  return (
    <label>{label}
      <span className="input-with-btn">
        <input className="input" type={kind === 'secret' && !show ? 'password' : 'text'} autoComplete="off" value={value || ''} onChange={(e) => onChange(e.target.value)} />
        {kind === 'secret' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>}
      </span>
    </label>
  );
}

export function MyAccount() {
  return (
    <>
      <h1 className="admin__title">My Account</h1>
      <div className="settings-account">
        <div className="card form-card"><ProfileForm /></div>
        <div className="card form-card"><PasswordForm /></div>
      </div>
    </>
  );
}

const SETTING_TABS = [
  ['general', 'General', <FiSettings key="g" />],
  ['delivery', 'Delivery', <FiTruck key="d" />],
  ['payment', 'Payment', <FiCreditCard key="p" />],
  ['courier', 'Courier', <FiPackage key="c" />],
  ['marketing', 'Marketing & Feeds', <FiTrendingUp key="m" />],
];

export function Settings() {
  const { setSettings } = useStore();
  // The admin endpoint includes API keys, which the public /settings never returns
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [balance, setBalance] = useState(null);
  const [tab, setTab] = useState(() => { const t = new URLSearchParams(window.location.search).get('tab'); return SETTING_TABS.some(([k]) => k === t) ? t : 'general'; });
  useEffect(() => { api.get('/admin/settings').then((s) => { setForm(s); setSaved(s); }).catch((e) => toast.error(e.message)); }, []);
  const checkBalance = () => api.get('/admin/courier/balance')
    .then((r) => setBalance(r.balance))
    .catch((e) => toast.error(e.message));
  const [pathaoStores, setPathaoStores] = useState(null);
  const checkPathao = () => api.get('/admin/courier/pathao/stores')
    .then(setPathaoStores)
    .catch((e) => toast.error(e.message));
  const pick = (t) => { setTab(t); window.history.replaceState(null, '', `?tab=${t}`); };
  if (!form) return <div className="spinner" />;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put('/admin/settings', form);
      setSaved(form);
      setSettings(await api.get('/settings'));
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    }
  };
  const linkRows = (links) => links.length > 0 && (
    <div className="feed-list">
      {links.map(([label, path]) => (
        <div key={path} className="feed-row">
          <span>{label}</span><code>{apiUrl(path)}</code>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => copy(apiUrl(path))}>Copy</button>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <h1 className="admin__title">Settings</h1>
      <div className="tabs settings-tabs">
        {SETTING_TABS.map(([key, label, icon]) => (
          <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => pick(key)}>{icon} {label}</button>
        ))}
      </div>
      {(
        <form className="card form-card settings-panel" onSubmit={save}>
          {SETTING_GROUPS.filter(([t]) => t === tab).map(([, title, fields, links = []]) => (
            <section key={title} className="settings-section">
              <h3>{title}</h3>
              <div className="form-grid">
                {fields.map(([k, label, kind]) => (
                  <SettingField key={k} label={label} kind={kind} value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
                ))}
              </div>
              {linkRows(links)}
              {title === 'Courier — Steadfast' && (
                <div className="row">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={checkBalance}>Check Steadfast balance</button>
                  {balance !== null && <span>Balance: <b className="gold">{money(balance)}</b></span>}
                  <span className="muted small">Save first if you just changed the keys.</span>
                </div>
              )}
              {title === 'Courier — Pathao' && (
                <div className="row">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={checkPathao}>Test Pathao login &amp; list stores</button>
                  {pathaoStores && <span className="small">{pathaoStores.length ? pathaoStores.map((st) => `${st.name} (ID ${st.id})`).join(' · ') : 'No stores found'}</span>}
                  <span className="muted small">Save first if you just changed the keys.</span>
                </div>
              )}
            </section>
          ))}
          {tab === 'general' && (
            <section className="settings-section">
              <h3>Flash Sale</h3>
              <div className="form-grid">
                <label>Flash Sale Ends At
                  <input className="input" type="datetime-local" value={toLocalInput(form.flash_sale_end)}
                    onChange={(e) => setForm({ ...form, flash_sale_end: new Date(e.target.value).toISOString() })} />
                </label>
                <p className="muted small">Mark products as "Flash Sale" from Products or Inventory.</p>
              </div>
            </section>
          )}
          {tab === 'marketing' && (
            <section className="settings-section">
              <h3>Product Catalog Feeds</h3>
              <p className="muted small">Paste these links in Facebook Commerce Manager, TikTok Catalog Manager or Google Merchant Center as a scheduled data feed. They update automatically from your products.</p>
              <div className="feed-list">
                {FEEDS.map(([label, path]) => {
                  const url = apiUrl(`feed/${path}`);
                  return (
                    <div key={label} className="feed-row">
                      <span>{label}</span>
                      <code>{url}</code>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => copy(url)}>Copy</button>
                      <a className="btn btn--ghost btn--sm" href={url} target="_blank" rel="noreferrer">Open</a>
                    </div>
                  );
                })}
              </div>
              <p className="muted small">Pixel events sent: PageView, ViewContent, AddToCart, AddToWishlist, InitiateCheckout, Search, Purchase (TikTok: CompletePayment), CompleteRegistration. GA4/GTM get the matching ecommerce events in the dataLayer. Leave an ID empty to turn that platform off; changes apply on the next page load.
                With a Conversions API / Events API token set, every Meta and TikTok event is also sent from the server with the same event ID, so ad blockers can't hide conversions and nothing is counted twice.</p>
            </section>
          )}
          <div className="settings-save">
            {dirty && <span className="muted small">You have unsaved changes</span>}
            <button className="btn btn--gold" disabled={!dirty}>Save Settings</button>
          </div>
        </form>
      )}
    </>
  );
}


/* ---------------- Fraud check (search one number) ---------------- */
export function FraudCheck() {
  const [input, setInput] = useState('');
  const [phone, setPhone] = useState('');
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(null);
  const search = (e) => {
    e.preventDefault();
    let d = input.replace(/\D/g, '');
    if (d.startsWith('880')) d = d.slice(2);
    if (!/^01\d{9}$/.test(d)) return toast.error('Enter an 11 digit phone number (01XXXXXXXXX)');
    setPhone(d);
    api.get(`/admin/orders?q=${d}`).then(setOrders).catch(() => setOrders([]));
  };
  return (
    <>
      <h1 className="admin__title">Fraud Check</h1>
      <form className="card form-card" onSubmit={search}>
        <p className="muted small">Check any customer's delivery record across all Bangladeshi couriers before confirming a cash-on-delivery order.</p>
        <div className="input-with-btn">
          <input className="input" inputMode="tel" placeholder="01XXXXXXXXX" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <button className="btn btn--gold"><FiSearch /> Check</button>
        </div>
        {phone && (
          <>
            <h4 className="modal__section">Delivery history — {phone}</h4>
            <CourierHistory key={phone} phone={phone} />
            <h4 className="modal__section">Orders in this store ({orders.length})</h4>
            {orders.length ? <OrdersTable orders={orders} onOpen={(o) => setOpen(o.id)} /> : <p className="muted small">No orders from this number yet.</p>}
          </>
        )}
      </form>
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={() => api.get(`/admin/orders?q=${phone}`).then(setOrders)} />}
    </>
  );
}
