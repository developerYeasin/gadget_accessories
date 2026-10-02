import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiEdit2, FiPlus, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import api, { imageUrl, money } from '../../api/client';
import { useStore } from '../../context/StoreContext';
import { Modal } from './AdminPages';

function ImageInput({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.upload(file);
      onChange(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <label>{label}
      <div className="img-input">
        {value && <img src={imageUrl(value)} alt="" />}
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Upload an image or paste a URL" />
        <span className="btn btn--ghost btn--sm upload-btn"><FiUpload /> {busy ? '...' : 'Upload'}<input type="file" accept="image/*" onChange={upload} /></span>
      </div>
    </label>
  );
}

const confirmDelete = (what) => window.confirm(`Delete this ${what}? This cannot be undone.`);

/* ---------------- Products ---------------- */
/* ---------------- Variants editor ---------------- */
const MAX_OPTION_GROUPS = 3;
const toRows = (options) => (options || []).map((o) => ({ name: o.name, valuesText: (o.values || []).join(', ') }));
const fromRows = (rows) => rows
  .map((r) => ({ name: r.name.trim(), values: [...new Set(r.valuesText.split(',').map((v) => v.trim()).filter(Boolean))] }))
  .filter((o) => o.name && o.values.length);
const cartesian = (groups) => groups.reduce(
  (acc, g) => acc.flatMap((combo) => g.values.map((v) => ({ ...combo, [g.name]: v }))),
  [{}],
);
const sameOptions = (a, b) => {
  const ka = Object.keys(a || {}); const kb = Object.keys(b || {});
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

function VariantImage({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      onChange((await api.upload(file)).url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <span className="vedit__img">
      {value && <img src={imageUrl(value)} alt="" />}
      <span className="btn btn--ghost btn--sm upload-btn" title="Upload variant image"><FiUpload />{busy ? '…' : ''}<input type="file" accept="image/*" onChange={upload} /></span>
      {value && <button type="button" className="icon-btn" onClick={() => onChange('')} aria-label="Remove image"><FiX /></button>}
    </span>
  );
}

function VariantEditor({ optionRows, setOptionRows, variants, setVariants, basePrice, baseOld }) {
  const setRow = (i, patch) => setOptionRows(optionRows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setVariant = (i, patch) => setVariants(variants.map((v, k) => (k === i ? { ...v, ...patch } : v)));

  const generate = () => {
    const groups = fromRows(optionRows);
    if (!groups.length) return toast.error('Add at least one option with values, e.g. Color: Black, White');
    const next = cartesian(groups).map((options) => {
      const existing = variants.find((v) => sameOptions(v.options, options));
      return existing || {
        options, name: Object.values(options).join(' / '), price: basePrice || '', old_price: baseOld || '',
        stock: 0, sku: '', image: '', is_active: true,
      };
    });
    const dropped = variants.filter((v) => !next.includes(v)).length;
    setVariants(next);
    toast.success(`${next.length} variants${dropped ? `, ${dropped} removed` : ''}`);
  };

  return (
    <div className="vedit">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>Variants</b>
        <span className="muted small">e.g. Color: Black, White · Capacity: 10000mAh, 20000mAh</span>
      </div>
      {optionRows.map((r, i) => (
        <div key={i} className="vedit__opt">
          <input className="input" placeholder="Option name (Color)" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
          <input className="input" placeholder="Values, comma separated (Black, White)" value={r.valuesText} onChange={(e) => setRow(i, { valuesText: e.target.value })} />
          <button type="button" className="icon-btn danger" onClick={() => setOptionRows(optionRows.filter((_, k) => k !== i))} aria-label="Remove option"><FiTrash2 /></button>
        </div>
      ))}
      <div className="row">
        {optionRows.length < MAX_OPTION_GROUPS && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOptionRows([...optionRows, { name: '', valuesText: '' }])}><FiPlus /> Add option</button>
        )}
        {optionRows.length > 0 && <button type="button" className="btn btn--outline btn--sm" onClick={generate}>Generate variants</button>}
        {variants.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm danger" onClick={() => { setVariants([]); setOptionRows([]); }}>Remove all variants</button>
        )}
      </div>
      {variants.length > 0 && (
        <div className="table-wrap">
          <table className="vedit__table">
            <thead><tr><th>Variant</th><th>Price ৳ *</th><th>Old ৳</th><th>Stock</th><th>SKU</th><th>Image</th><th>On</th><th></th></tr></thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.id || v.name}>
                  <td>{v.name}</td>
                  <td><input className="input" type="number" min="1" required value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} style={{ width: 90 }} /></td>
                  <td><input className="input" type="number" min="0" value={v.old_price || ''} onChange={(e) => setVariant(i, { old_price: e.target.value })} style={{ width: 90 }} /></td>
                  <td><input className="input" type="number" min="0" value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} style={{ width: 72 }} /></td>
                  <td><input className="input" value={v.sku || ''} onChange={(e) => setVariant(i, { sku: e.target.value })} style={{ width: 100 }} /></td>
                  <td><VariantImage value={v.image} onChange={(url) => setVariant(i, { image: url })} /></td>
                  <td><input type="checkbox" className="switch" checked={v.is_active !== false} onChange={(e) => setVariant(i, { is_active: e.target.checked })} /></td>
                  <td><button type="button" className="icon-btn danger" onClick={() => setVariants(variants.filter((_, k) => k !== i))} aria-label="Remove variant"><FiTrash2 /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {variants.length > 0 && <p className="muted small">Product price shows the lowest variant price; total stock is the sum of all variants.</p>}
    </div>
  );
}

const emptyProduct = {
  name: '', slug: '', brand: '', category_id: '', price: '', old_price: '', stock: 10, image: '', images: [],
  features: [], short_description: '', description: '', rating: 5, review_count: 0, is_featured: false, is_flash_sale: false, is_active: true,
};

function ProductForm({ initial, onClose, onSaved }) {
  const { categories } = useStore();
  const [f, setF] = useState({ ...emptyProduct, ...initial, category_id: initial?.category_id || '' });
  const [featureText, setFeatureText] = useState((initial?.features || []).join(', '));
  const [optionRows, setOptionRows] = useState(toRows(initial?.options));
  const [variants, setVariants] = useState([]);
  const [loaded, setLoaded] = useState(!initial?.id);
  const hasVariants = variants.length > 0;

  // Load the full product (with variants) when editing
  useEffect(() => {
    if (!initial?.id) return;
    api.get(`/admin/products/${initial.id}`).then((full) => {
      setF((cur) => ({ ...cur, ...full, category_id: full.category_id || '' }));
      setOptionRows(toRows(full.options));
      setVariants((full.variants || []).map((v) => ({ ...v, old_price: v.old_price || '' })));
      setLoaded(true);
    }).catch((e) => toast.error(e.message));
  }, [initial?.id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const extra = (f.images || []).filter((i) => i !== f.image);

  const save = async (e) => {
    e.preventDefault();
    if (!loaded) return;
    const body = {
      ...f,
      images: [f.image, ...extra].filter(Boolean),
      features: featureText.split(',').map((s) => s.trim()).filter(Boolean),
      options: hasVariants ? fromRows(optionRows) : [],
      variants,
    };
    try {
      initial?.id ? await api.put(`/admin/products/${initial.id}`, body) : await api.post('/admin/products', body);
      toast.success('Product saved');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal title={initial?.id ? 'Edit Product' : 'Add Product'} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="span-2">Name *<input className="input" required value={f.name} onChange={set('name')} /></label>
          <label>Slug (auto)<input className="input" value={f.slug} onChange={set('slug')} /></label>
          <label>Brand<input className="input" value={f.brand || ''} onChange={set('brand')} /></label>
          <label>Category
            <select className="input" value={f.category_id} onChange={set('category_id')}>
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Stock{hasVariants && ' (from variants)'}<input className="input" type="number" value={f.stock} onChange={set('stock')} disabled={hasVariants} /></label>
          <label>Price (৳) {hasVariants ? '(from variants)' : '*'}<input className="input" type="number" required={!hasVariants} value={f.price} onChange={set('price')} disabled={hasVariants} /></label>
          <label>Old Price (৳){hasVariants && ' (from variants)'}<input className="input" type="number" value={f.old_price || ''} onChange={set('old_price')} disabled={hasVariants} /></label>
          <label>Weight (grams)<input className="input" type="number" min="0" value={f.weight || ''} onChange={set('weight')} placeholder="e.g. 250" /></label>
          <label>Rating<input className="input" type="number" step="0.1" min="0" max="5" value={f.rating} onChange={set('rating')} /></label>
          <label>Review Count<input className="input" type="number" value={f.review_count} onChange={set('review_count')} /></label>
          <div className="span-2"><ImageInput label="Main Image" value={f.image} onChange={(v) => setF({ ...f, image: v })} /></div>
          <div className="span-2">
            <span className="small">Gallery Images</span>
            <div className="gallery-edit">
              {extra.map((img) => (
                <span key={img} className="gallery-edit__item"><img src={imageUrl(img)} alt="" />
                  <button type="button" onClick={() => setF({ ...f, images: f.images.filter((i) => i !== img) })} aria-label="Remove"><FiX /></button>
                </span>
              ))}
            </div>
            <ImageInput label="" value="" onChange={(v) => v && setF({ ...f, images: [...(f.images || []), v] })} />
          </div>
          <div className="span-2">
            <VariantEditor optionRows={optionRows} setOptionRows={setOptionRows} variants={variants} setVariants={setVariants} basePrice={f.price} baseOld={f.old_price} />
          </div>
          <label className="span-2">Features (comma separated)<input className="input" value={featureText} onChange={(e) => setFeatureText(e.target.value)} placeholder="Fast Charging, High Capacity" /></label>
          <label className="span-2">Short Description<input className="input" value={f.short_description || ''} onChange={set('short_description')} /></label>
          <label className="span-2">Description<textarea className="input" rows={4} value={f.description || ''} onChange={set('description')} /></label>
          <label className="check"><input type="checkbox" checked={!!f.is_featured} onChange={set('is_featured')} /> Featured</label>
          <label className="check"><input type="checkbox" checked={!!f.is_flash_sale} onChange={set('is_flash_sale')} /> Flash Sale</label>
          <label className="check"><input type="checkbox" checked={!!f.is_active} onChange={set('is_active')} /> Active (visible)</label>
        </div>
        <button className="btn btn--gold" disabled={!loaded}>{loaded ? 'Save Product' : 'Loading…'}</button>
      </form>
    </Modal>
  );
}

export function Products() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const load = () => api.get(`/admin/products?q=${encodeURIComponent(q)}`).then(setRows).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  const remove = async (p) => {
    if (!confirmDelete('product')) return;
    await api.del(`/admin/products/${p.id}`);
    toast.success('Deleted');
    load();
  };

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Products</h1>
        <input className="input input--auto" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn--gold" onClick={() => setEdit({})}><FiPlus /> Add Product</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><img className="thumb" src={imageUrl(p.image)} alt="" /></td>
                <td>{p.name}{p.variant_count > 0 && <span className="variant-tag">{p.variant_count} variants</span>}</td>
                <td>{p.category_name}</td>
                <td>{money(p.price)} {p.old_price > p.price && <del className="muted small">{money(p.old_price)}</del>}</td>
                <td className={p.stock <= 5 ? 'danger' : ''}>{p.stock}</td>
                <td className="small">{p.is_featured && 'Featured '}{p.is_flash_sale && 'Flash '}{!p.is_active && 'Hidden'}</td>
                <td className="nowrap">
                  <button className="icon-btn" onClick={() => setEdit(p)} aria-label="Edit"><FiEdit2 /></button>
                  <button className="icon-btn danger" onClick={() => remove(p)} aria-label="Delete"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ProductForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

/* ---------------- Categories ---------------- */
export function Categories() {
  const { categories, setCategories } = useStore();
  const [edit, setEdit] = useState(null);
  const reload = () => api.get('/categories').then(setCategories);

  const save = async (e) => {
    e.preventDefault();
    try {
      edit.id ? await api.put(`/admin/categories/${edit.id}`, edit) : await api.post('/admin/categories', edit);
      toast.success('Category saved');
      setEdit(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (c) => {
    if (!confirmDelete('category')) return;
    await api.del(`/admin/categories/${c.id}`);
    reload();
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Categories</h1>
        <button className="btn btn--gold" onClick={() => setEdit({ name: '', sort_order: categories.length + 1 })}><FiPlus /> Add Category</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Name</th><th>Slug</th><th>Products</th><th>Order</th><th></th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td><img className="thumb thumb--wide" src={imageUrl(c.image)} alt="" /></td>
                <td>{c.name}</td><td>{c.slug}</td><td>{c.product_count}</td><td>{c.sort_order}</td>
                <td className="nowrap">
                  <button className="icon-btn" onClick={() => setEdit(c)} aria-label="Edit"><FiEdit2 /></button>
                  <button className="icon-btn danger" onClick={() => remove(c)} aria-label="Delete"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit Category' : 'Add Category'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Name *<input className="input" required value={edit.name} onChange={set('name')} /></label>
              <label>Slug (auto)<input className="input" value={edit.slug || ''} onChange={set('slug')} /></label>
              <label>Banner Title<input className="input" value={edit.banner_title || ''} onChange={set('banner_title')} /></label>
              <label>Banner Subtitle<input className="input" value={edit.banner_subtitle || ''} onChange={set('banner_subtitle')} /></label>
              <label>Sort Order<input className="input" type="number" value={edit.sort_order || 0} onChange={set('sort_order')} /></label>
              <div className="span-2"><ImageInput label="Tile Image" value={edit.image} onChange={(v) => setEdit({ ...edit, image: v })} /></div>
              <div className="span-2"><ImageInput label="Banner Image" value={edit.banner_image} onChange={(v) => setEdit({ ...edit, banner_image: v })} /></div>
            </div>
            <button className="btn btn--gold">Save Category</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ---------------- Banners ---------------- */
export function Banners() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get('/admin/banners').then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      edit.id ? await api.put(`/admin/banners/${edit.id}`, edit) : await api.post('/admin/banners', edit);
      toast.success('Banner saved');
      setEdit(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (b) => {
    if (!confirmDelete('banner')) return;
    await api.del(`/admin/banners/${b.id}`);
    load();
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <div className="admin__bar">
        <h1 className="admin__title">Hero Banners</h1>
        <button className="btn btn--gold" onClick={() => setEdit({ line1: '', highlight: '', line2: '', link: '/shop', is_active: true, sort_order: rows.length + 1 })}><FiPlus /> Add Banner</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Text</th><th>Link</th><th>Order</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><img className="thumb thumb--wide" src={imageUrl(b.image)} alt="" /></td>
                <td>{b.line1} <b className="gold">{b.highlight}</b> {b.line2}</td>
                <td>{b.link}</td><td>{b.sort_order}</td><td>{b.is_active ? 'Yes' : 'No'}</td>
                <td className="nowrap">
                  <button className="icon-btn" onClick={() => setEdit({ ...b, is_active: !!b.is_active })} aria-label="Edit"><FiEdit2 /></button>
                  <button className="icon-btn danger" onClick={() => remove(b)} aria-label="Delete"><FiTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit Banner' : 'Add Banner'} onClose={() => setEdit(null)} wide>
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Line 1<input className="input" value={edit.line1 || ''} onChange={set('line1')} placeholder="Latest" /></label>
              <label>Highlight (gold)<input className="input" value={edit.highlight || ''} onChange={set('highlight')} placeholder="GADGETS" /></label>
              <label>Line 2<input className="input" value={edit.line2 || ''} onChange={set('line2')} placeholder="at Best Prices" /></label>
              <label>Button Link<input className="input" value={edit.link || ''} onChange={set('link')} /></label>
              <label>Sort Order<input className="input" type="number" value={edit.sort_order || 0} onChange={set('sort_order')} /></label>
              <label className="check"><input type="checkbox" checked={!!edit.is_active} onChange={set('is_active')} /> Active</label>
              <div className="span-2"><ImageInput label="Image (right side)" value={edit.image} onChange={(v) => setEdit({ ...edit, image: v })} /></div>
            </div>
            <button className="btn btn--gold">Save Banner</button>
          </form>
        </Modal>
      )}
    </>
  );
}
