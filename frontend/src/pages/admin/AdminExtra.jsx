import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiEdit2, FiPlus, FiTrash2, FiPrinter, FiDownload, FiEye, FiEyeOff, FiSave } from 'react-icons/fi';
import api, { imageUrl, money } from '../../api/client';
import { useStore } from '../../context/StoreContext';
import { LogoMark } from '../../components/Logo';
import { StatusBadge } from '../../components/OrderView';
import { Modal } from './AdminPages';
import { currentSubscription, permission, pushSupported, subscribePush } from '../../api/push';

const confirmDelete = (what) => window.confirm(`Delete this ${what}? This cannot be undone.`);

/* ---------- Bar chart (revenue per day) ---------- */
export function BarChart({ series, height = 220 }) {
  const [hover, setHover] = useState(null);
  if (!series.length) return null;
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const w = 100 / series.length;
  const label = (day) => new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const every = Math.ceil(series.length / 10);
  return (
    <div className="chart">
      <div className="chart__plot" style={{ height }}>
        {[1, 0.75, 0.5, 0.25].map((g) => (
          <div key={g} className="chart__grid" style={{ bottom: `${g * 100}%` }}><span>{money(max * g)}</span></div>
        ))}
        {series.map((d, i) => (
          <div key={d.day} className="chart__col" style={{ left: `${i * w}%`, width: `${w}%` }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="chart__bar" style={{ height: `${(d.revenue / max) * 100}%` }} />
          </div>
        ))}
        {hover != null && (
          <div className="chart__tip" style={{ left: `${(hover + 0.5) * w}%` }}>
            <b>{label(series[hover].day)}</b>
            <span>{money(series[hover].revenue)}</span>
            <span className="muted">{series[hover].orders} orders</span>
          </div>
        )}
      </div>
      <div className="chart__axis">
        {series.map((d, i) => (
          <span key={d.day} style={{ left: `${(i + 0.5) * w}%` }}>{i % every === 0 ? label(d.day) : ''}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------- Reports ---------- */
export function Reports() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  useEffect(() => {
    setR(null);
    api.get(`/admin/reports?days=${days}`).then(setR).catch((e) => toast.error(e.message));
  }, [days]);

  const exportCsv = () => {
    const rows = [['Date', 'Orders', 'Revenue'], ...r.series.map((d) => [d.day, d.orders, d.revenue])];
    const blob = new Blob([rows.map((x) => x.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sales-report-${days}days.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Sales Reports</h1>
        <select className="input input--auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
        {r && <button className="btn btn--ghost" onClick={exportCsv}><FiDownload /> Export CSV</button>}
      </div>
      {!r ? <div className="spinner" /> : (
        <>
          <div className="stat-grid">
            {[['Revenue', money(r.summary.revenue)], ['Orders', r.summary.orders], ['Items Sold', r.summary.items],
              ['Avg. Order Value', money(r.summary.avg_order)], ['Coupon Discounts', money(r.summary.discounts)]].map(([l, v]) => (
              <div key={l} className="card stat stat--plain"><div><p className="muted small">{l}</p><h3>{v}</h3></div></div>
            ))}
          </div>
          <div className="card admin-card">
            <h3>Revenue by day</h3>
            <BarChart series={r.series} />
          </div>
          <div className="admin-cols">
            <div className="card admin-card">
              <h3>Top Selling Products</h3>
              {!r.topProducts.length && <p className="muted">No sales in this period.</p>}
              {r.topProducts.map((p, i) => (
                <div key={i} className="rank-row">
                  <span className="rank-row__n">{i + 1}</span>
                  <img src={imageUrl(p.product_image)} alt="" />
                  <span className="rank-row__name">{p.product_name}</span>
                  <span className="muted small">{p.qty} sold</span>
                  <b className="gold">{money(p.revenue)}</b>
                </div>
              ))}
            </div>
            <div className="card admin-card">
              <h3>Sales by Category</h3>
              {!r.byCategory.length && <p className="muted">No sales in this period.</p>}
              {r.byCategory.map((c) => {
                const max = Math.max(...r.byCategory.map((x) => Number(x.revenue)));
                return (
                  <div key={c.category} className="hbar">
                    <div className="hbar__head"><span>{c.category}</span><b>{money(c.revenue)}</b></div>
                    <div className="hbar__track"><i style={{ width: `${(c.revenue / max) * 100}%` }} /></div>
                  </div>
                );
              })}
              <h3 className="admin__sub">Orders by Status</h3>
              <div className="chips">
                {r.statuses.map((s) => <span key={s.status} className="chip-stat"><StatusBadge status={s.status} /> {s.count}</span>)}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- Inventory ---------- */
export function Inventory() {
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [filter, setFilter] = useState('low');
  const load = () => api.get('/admin/products').then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const shown = rows
    .filter((p) => (filter === 'low' ? p.stock <= 5 : filter === 'out' ? p.stock <= 0 : true))
    .sort((a, b) => a.stock - b.stock);

  const save = async (p) => {
    try {
      await api.put(`/admin/products/${p.id}/stock`, { stock: edits[p.id] });
      toast.success('Stock updated');
      setEdits(({ [p.id]: _, ...rest }) => rest);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggle = async (p, field) => {
    await api.put(`/admin/products/${p.id}/toggle`, { field });
    load();
  };

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Inventory</h1>
        <div className="chips chips--flat">
          {[['low', 'Low stock (≤5)'], ['out', 'Out of stock'], ['all', 'All products']].map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'is-active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Product</th><th>Price</th><th>Sold</th><th>Stock</th><th>Visible</th><th>Featured</th><th>Flash</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td><img className="thumb" src={imageUrl(p.image)} alt="" /></td>
                <td>{p.name}<div className="muted small">{p.category_name}</div></td>
                <td>{money(p.price)}</td>
                <td>{p.sold_count}</td>
                <td className="nowrap">
                  <input className={`input input--stock ${p.stock <= 5 ? 'is-low' : ''}`} type="number" min="0"
                    value={edits[p.id] ?? p.stock} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
                  {edits[p.id] !== undefined && <button className="icon-btn" onClick={() => save(p)} aria-label="Save"><FiSave /></button>}
                </td>
                <td><input type="checkbox" className="switch" checked={p.is_active} onChange={() => toggle(p, 'active')} /></td>
                <td><input type="checkbox" className="switch" checked={p.is_featured} onChange={() => toggle(p, 'featured')} /></td>
                <td><input type="checkbox" className="switch" checked={p.is_flash_sale} onChange={() => toggle(p, 'flash')} /></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={8} className="muted center">Nothing here 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- Coupons ---------- */
const emptyCoupon = { code: '', type: 'percent', value: '', min_order: 0, max_discount: '', usage_limit: '', expires_at: '', is_active: true };

export function Coupons() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get('/admin/coupons').then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    try {
      edit.id ? await api.put(`/admin/coupons/${edit.id}`, edit) : await api.post('/admin/coupons', edit);
      toast.success('Coupon saved');
      setEdit(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (c) => {
    if (!confirmDelete('coupon')) return;
    await api.del(`/admin/coupons/${c.id}`);
    load();
  };
  const status = (c) => {
    if (!c.is_active) return ['Disabled', 'cancelled'];
    if (c.expires_at && new Date(c.expires_at.replace(' ', 'T')) < new Date()) return ['Expired', 'cancelled'];
    if (c.usage_limit != null && c.used_count >= c.usage_limit) return ['Used up', 'pending'];
    return ['Active', 'delivered'];
  };

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Coupons</h1>
        <button className="btn btn--gold" onClick={() => setEdit(emptyCoupon)}><FiPlus /> Add Coupon</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const [label, cls] = status(c);
              return (
                <tr key={c.id}>
                  <td><b className="gold">{c.code}</b></td>
                  <td>{c.type === 'percent' ? `${Number(c.value)}%` : money(c.value)}{c.max_discount ? <span className="muted small"> (max {money(c.max_discount)})</span> : ''}</td>
                  <td>{money(c.min_order)}</td>
                  <td>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
                  <td>{c.expires_at ? c.expires_at.slice(0, 16) : '—'}</td>
                  <td><span className={`status status--${cls}`}>{label}</span></td>
                  <td className="nowrap">
                    <button className="icon-btn" onClick={() => setEdit({ ...c, is_active: !!c.is_active, expires_at: c.expires_at ? c.expires_at.slice(0, 16).replace(' ', 'T') : '' })} aria-label="Edit"><FiEdit2 /></button>
                    <button className="icon-btn danger" onClick={() => remove(c)} aria-label="Delete"><FiTrash2 /></button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted center">No coupons yet</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit Coupon' : 'Add Coupon'} onClose={() => setEdit(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Code *<input className="input" required value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} placeholder="EID2026" /></label>
              <label>Type
                <select className="input" value={edit.type} onChange={set('type')}>
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed amount (৳)</option>
                </select>
              </label>
              <label>Value *<input className="input" type="number" required min="1" value={edit.value} onChange={set('value')} /></label>
              <label>Minimum Order (৳)<input className="input" type="number" min="0" value={edit.min_order} onChange={set('min_order')} /></label>
              <label>Max Discount (৳)<input className="input" type="number" min="0" value={edit.max_discount || ''} onChange={set('max_discount')} placeholder="No limit" /></label>
              <label>Usage Limit<input className="input" type="number" min="1" value={edit.usage_limit || ''} onChange={set('usage_limit')} placeholder="Unlimited" /></label>
              <label>Expires At<input className="input" type="datetime-local" value={edit.expires_at || ''} onChange={set('expires_at')} /></label>
              <label className="check"><input type="checkbox" checked={!!edit.is_active} onChange={set('is_active')} /> Active</label>
            </div>
            <button className="btn btn--gold">Save Coupon</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ---------- Reviews ---------- */
export function Reviews() {
  const [rows, setRows] = useState([]);
  const load = () => api.get('/admin/reviews').then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  const toggle = async (r) => { await api.put(`/admin/reviews/${r.id}`, { is_approved: !r.is_approved }); load(); };
  const remove = async (r) => {
    if (!confirmDelete('review')) return;
    await api.del(`/admin/reviews/${r.id}`);
    load();
  };
  return (
    <>
      <h1 className="admin__title">Product Reviews</h1>
      {!rows.length && <p className="muted">No reviews yet. Customers can review products from the product page after logging in.</p>}
      {rows.map((r) => (
        <div key={r.id} className={`card msg ${r.is_approved ? '' : 'msg--hidden'}`}>
          <div className="msg__head">
            <b>{r.user_name}</b>
            <span className="gold">{'★'.repeat(r.rating)}<span className="muted">{'★'.repeat(5 - r.rating)}</span></span>
            <span className="muted small">on <Link to={`/product/${r.product_slug}`} className="gold">{r.product_name}</Link> · {r.created_at.slice(0, 16)}</span>
            <span className="msg__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => toggle(r)}>{r.is_approved ? <><FiEyeOff /> Hide</> : <><FiEye /> Show</>}</button>
              <button className="icon-btn danger" onClick={() => remove(r)} aria-label="Delete"><FiTrash2 /></button>
            </span>
          </div>
          {r.comment && <p>{r.comment}</p>}
          {!r.is_approved && <p className="small muted">Hidden from the store</p>}
        </div>
      ))}
    </>
  );
}

/* ---------- Pages (CMS) ---------- */
export function Pages() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get('/admin/pages').then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      edit.id ? await api.put(`/admin/pages/${edit.id}`, edit) : await api.post('/admin/pages', edit);
      toast.success('Page saved');
      setEdit(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (p) => {
    if (!confirmDelete('page')) return;
    await api.del(`/admin/pages/${p.id}`);
    load();
  };
  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Pages</h1>
        <button className="btn btn--gold" onClick={() => setEdit({ title: '', slug: '', content: '', is_active: true })}><FiPlus /> Add Page</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Title</th><th>URL</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td><Link to={`/page/${p.slug}`} className="gold" target="_blank">/page/{p.slug}</Link></td>
                <td>{p.is_active ? 'Published' : 'Hidden'}</td>
                <td>{String(p.updated_at).slice(0, 16)}</td>
                <td className="nowrap">
                  <button className="icon-btn" onClick={() => setEdit({ ...p, is_active: !!p.is_active })} aria-label="Edit"><FiEdit2 /></button>
                  <button className="icon-btn danger" onClick={() => remove(p)} aria-label="Delete"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit Page' : 'Add Page'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Title *<input className="input" required value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label>Slug (auto)<input className="input" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></label>
              <label className="span-2">Content<textarea className="input" rows={12} value={edit.content || ''} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></label>
              <label className="check"><input type="checkbox" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Published</label>
            </div>
            <button className="btn btn--gold">Save Page</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ---------- Printable invoice ---------- */
export function Invoice() {
  const { id } = useParams();
  const { settings } = useStore();
  const [o, setO] = useState(null);
  useEffect(() => { api.get(`/admin/orders/${id}`).then(setO).catch((e) => toast.error(e.message)); }, [id]);
  if (!o) return <div className="spinner" />;
  return (
    <>
      <div className="admin__bar no-print">
        <h1 className="admin__title">Invoice #{o.order_number}</h1>
        <button className="btn btn--gold" onClick={() => window.print()}><FiPrinter /> Print</button>
      </div>
      <div className="invoice">
        <div className="invoice__head">
          <div className="invoice__brand">
            <LogoMark className="invoice__logo" />
            <div>
              <h2>Gadget <span className="gold">Accessories</span> Home</h2>
              <p>{settings.address} · {settings.phone}<br />{settings.email}</p>
            </div>
          </div>
          <div className="invoice__meta">
            <h2>INVOICE</h2>
            <p>#{o.order_number}<br />{o.created_at.slice(0, 16)}<br />Status: {o.status} · {o.payment_status}</p>
          </div>
        </div>
        <div className="invoice__to">
          <b>Bill To</b>
          <p>{o.customer_name}<br />{o.phone}{o.email ? ` · ${o.email}` : ''}<br />{o.address}{o.city ? `, ${o.city}` : ''}</p>
        </div>
        <table className="invoice__table">
          <thead><tr><th>#</th><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>
            {o.items.map((it, i) => (
              <tr key={it.id}><td>{i + 1}</td><td>{it.product_name}</td><td>{money(it.price)}</td><td>{it.quantity}</td><td>{money(it.price * it.quantity)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="invoice__totals">
          <div><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
          <div><span>Delivery</span><span>{money(o.delivery_charge)}</span></div>
          {o.discount > 0 && <div><span>Discount {o.coupon_code ? `(${o.coupon_code})` : ''}</span><span>−{money(o.discount)}</span></div>}
          <div className="invoice__grand"><span>Total</span><span>{money(o.total)}</span></div>
          <div><span>Payment</span><span>{({ cod: 'Cash on Delivery', online: 'Online', bkash: 'bKash', nagad: 'Nagad', sslcommerz: 'SSLCommerz', mfs_bkash: 'bKash (Send Money)', mfs_nagad: 'Nagad (Send Money)', mfs_rocket: 'Rocket (Send Money)' })[o.payment_method] || o.payment_method}</span></div>
        </div>
        <p className="invoice__thanks">Thank you for shopping with Gadget Accessories Home!</p>
      </div>
    </>
  );
}

/* ---------- Push notifications ---------- */
export function Notifications() {
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', url: '/offers', image: '' });
  const [busy, setBusy] = useState('');
  const [deviceOn, setDeviceOn] = useState(false);
  const load = () => api.get('/push/admin/stats').then(setStats).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
    currentSubscription().then((s) => setDeviceOn(Boolean(s) && permission() === 'granted'));
  }, []);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const enableDevice = () => run('device', async () => {
    await subscribePush({ audience: 'admin' });
    setDeviceOn(true);
    toast.success('This device will get new-order alerts');
    load();
  });
  const sendTest = () => run('test', async () => {
    await api.post('/push/admin/test');
    toast.success('Test sent — check this device');
  });
  const send = (e) => {
    e.preventDefault();
    if (!window.confirm(`Send "${form.title}" to ${stats?.customers ?? 0} subscriber(s)?`)) return;
    run('send', async () => {
      const r = await api.post('/push/admin/send', form);
      toast.success(`Sent to ${r.sent}${r.failed ? `, ${r.failed} failed` : ''}`);
      setForm({ title: '', body: '', url: '/offers', image: '' });
      load();
    });
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (!stats) return <div className="spinner" />;
  return (
    <>
      <h1 className="admin__title">Push Notifications</h1>
      {!stats.enabled && <div className="alert">Push is not configured — add VAPID keys to backend/.env.</div>}
      {!pushSupported() && <div className="alert">This browser does not support push notifications.</div>}
      <div className="stat-grid">
        <div className="card stat stat--plain"><div><p className="muted small">Customer subscribers</p><h3>{stats.customers}</h3></div></div>
        <div className="card stat stat--plain"><div><p className="muted small">Admin devices</p><h3>{stats.admins}</h3></div></div>
        <div className="card stat stat--plain">
          <div>
            <p className="muted small">New-order alerts on this device</p>
            <div className="row" style={{ marginTop: 6 }}>
              {deviceOn
                ? <><span className="status status--delivered">On</span><button className="btn btn--ghost btn--sm" onClick={sendTest} disabled={busy === 'test'}>Send test</button></>
                : <button className="btn btn--gold btn--sm" onClick={enableDevice} disabled={busy === 'device' || !pushSupported()}>Enable on this device</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-cols">
        <form className="card admin-card" onSubmit={send}>
          <h3>Send to all subscribers</h3>
          <div className="form-grid">
            <label className="span-2">Title *<input className="input" required maxLength={80} value={form.title} onChange={set('title')} placeholder="⚡ Flash Sale is live — up to 20% off" /></label>
            <label className="span-2">Message<textarea className="input" rows={3} maxLength={200} value={form.body} onChange={set('body')} placeholder="Power banks, earbuds & more. Limited stock!" /></label>
            <label>Open link<input className="input" value={form.url} onChange={set('url')} placeholder="/offers" /></label>
            <label>Image (optional)<input className="input" value={form.image} onChange={set('image')} placeholder="https://..." /></label>
          </div>
          <button className="btn btn--gold" disabled={busy === 'send' || !stats.customers}>{busy === 'send' ? 'Sending…' : `Send to ${stats.customers} subscriber(s)`}</button>
          <p className="muted small">Goes to every customer who allowed notifications. Use it for real offers only — too many messages make people unsubscribe.</p>
        </form>
        <div className="card admin-card">
          <h3>Sent history</h3>
          {!stats.campaigns.length && <p className="muted">Nothing sent yet.</p>}
          {stats.campaigns.map((c) => (
            <div key={c.id} className="rank-row">
              <span className="rank-row__name"><b>{c.title}</b><br /><span className="muted small">{c.body}</span></span>
              <span className="small nowrap">{c.sent} sent{c.failed ? ` · ${c.failed} failed` : ''}<br /><span className="muted">{String(c.created_at).slice(0, 16)}</span></span>
            </div>
          ))}
        </div>
      </div>
      <p className="muted small">Automatic: admins get a notification for every new order; customers get one when their order is confirmed, packed, shipped, delivered or cancelled.</p>
    </>
  );
}
