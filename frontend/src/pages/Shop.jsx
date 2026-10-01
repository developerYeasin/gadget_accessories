import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FiFilter, FiChevronDown } from 'react-icons/fi';
import { BsLightningChargeFill } from 'react-icons/bs';
import { RiBattery2ChargeLine } from 'react-icons/ri';
import { TbPlugConnected } from 'react-icons/tb';
import api, { imageUrl } from '../api/client';
import { Breadcrumb, ProductGrid } from '../components/Shared';
import { track } from '../api/tracking';

const SORTS = [
  ['popularity', 'Popularity'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: Low to High'],
  ['price_desc', 'Price: High to Low'],
  ['rating', 'Top Rated'],
];

function CategoryBanner({ category }) {
  return (
    <div className="cat-banner">
      <div className="cat-banner__stripe" />
      <div className="cat-banner__text">
        <h1>{category.banner_title || category.name.toUpperCase()}</h1>
        <p>{category.banner_subtitle}</p>
        <div className="cat-banner__perks">
          <span><BsLightningChargeFill /> Fast Charging</span>
          <span><RiBattery2ChargeLine /> High Capacity</span>
          <span><TbPlugConnected /> Original Product</span>
        </div>
      </div>
      <img src={imageUrl(category.banner_image || category.image)} alt={category.name} />
    </div>
  );
}

export default function Shop({ offers = false }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState(null);
  const [data, setData] = useState({ products: [], total: 0, pages: 1, brands: [] });
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [min, setMin] = useState(params.get('min') || '');
  const [max, setMax] = useState(params.get('max') || '');

  const sort = params.get('sort') || 'popularity';
  const page = Number(params.get('page')) || 1;
  const q = params.get('q') || '';
  const brand = params.get('brand') || '';
  const inStock = params.get('in_stock') === '1';

  useEffect(() => { if (q) track.search(q); }, [q]);

  useEffect(() => {
    setCategory(null);
    if (slug) api.get(`/categories/${slug}`).then(setCategory).catch(() => {});
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ sort, page, limit: 12 });
    if (slug) qs.set('category', slug);
    if (offers) qs.set('offers', '1');
    ['q', 'min', 'max', 'brand', 'in_stock'].forEach((k) => params.get(k) && qs.set(k, params.get(k)));
    api.get(`/products?${qs}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [slug, offers, params, sort, page]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const title = category?.name || (offers ? 'Special Offers' : q ? `Search: "${q}"` : 'All Products');
  const brands = brand ? brand.split(',') : [];
  const toggleBrand = (b) => update({ brand: (brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b]).join(',') });

  return (
    <div className="container page">
      {category && <CategoryBanner category={category} />}
      <Breadcrumb items={[[title]]} />
      <div className="shop-head">
        <h1>{title}</h1>
        <span className="muted">{data.total} Products</span>
      </div>

      <div className="shop-tools">
        <button className="select-btn" onClick={() => setShowFilter((s) => !s)}>
          <FiFilter /> Filter <FiChevronDown className={showFilter ? 'rot' : ''} />
        </button>
        <label className="select-btn">
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>Sort by: {l}</option>)}
          </select>
          <FiChevronDown />
        </label>
      </div>

      {showFilter && (
        <div className="filter-panel">
          <div>
            <h4>Price Range (৳)</h4>
            <div className="row">
              <input className="input" type="number" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} />
              <input className="input" type="number" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} />
              <button className="btn btn--gold" onClick={() => update({ min, max })}>Apply</button>
            </div>
          </div>
          {data.brands.length > 0 && (
            <div>
              <h4>Brand</h4>
              <div className="chips">
                {data.brands.map((b) => (
                  <button key={b} className={`chip ${brands.includes(b) ? 'is-active' : ''}`} onClick={() => toggleBrand(b)}>{b}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4>Availability</h4>
            <label className="check"><input type="checkbox" checked={inStock} onChange={(e) => update({ in_stock: e.target.checked ? '1' : '' })} /> In stock only</label>
          </div>
          <button className="btn btn--ghost" onClick={() => { setMin(''); setMax(''); setParams(q ? { q } : {}); }}>Clear filters</button>
        </div>
      )}

      <ProductGrid products={data.products} loading={loading} />

      {data.pages > 1 && (
        <div className="pagination">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((n) => (
            <button key={n} className={n === page ? 'is-active' : ''} onClick={() => update({ page: String(n) })}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}
