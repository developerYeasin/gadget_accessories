import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiHeart, FiShoppingCart, FiArrowRight, FiChevronLeft, FiChevronRight, FiClock, FiRefreshCw, FiBox } from 'react-icons/fi';
import { FaHeart, FaStar, FaRegStar, FaStarHalfAlt, FaTruck } from 'react-icons/fa';
import { HiShieldCheck } from 'react-icons/hi';
import { BsLightningChargeFill } from 'react-icons/bs';
import { RiCustomerService2Line, RiPriceTag3Line } from 'react-icons/ri';
import { imageUrl, money } from '../api/client';
import { useStore } from '../context/StoreContext';

export function Stars({ rating = 0, count }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="stars">
      <span className="stars__icons">
        {[0, 1, 2, 3, 4].map((i) =>
          i < full ? <FaStar key={i} /> : i === full && half ? <FaStarHalfAlt key={i} /> : <FaRegStar key={i} className="stars__empty" />
        )}
      </span>
      <span className="stars__text">{Number(rating).toFixed(1)}{count != null && <span className="muted"> ({count})</span>}</span>
    </div>
  );
}

export function ProductCard({ product }) {
  const { addToCart, toggleWishlist, inWishlist } = useStore();
  const liked = inWishlist(product.id);
  const hoverImage = (product.images || []).find((img) => img && img !== product.image);
  return (
    <div className="pcard">
      <Link to={`/product/${product.slug}`} className="pcard__media">
        <img src={imageUrl(product.image)} alt={product.name} loading="lazy" className="pcard__img" />
        {hoverImage && <img src={imageUrl(hoverImage)} alt="" loading="lazy" className="pcard__img pcard__img--hover" aria-hidden="true" />}
        {product.discount > 0 && <span className="pcard__badge">-{product.discount}%</span>}
        {product.stock <= 0 && <span className="pcard__soldout">Sold Out</span>}
      </Link>
      <button className={`pcard__like ${liked ? 'is-liked' : ''}`} onClick={() => toggleWishlist(product)} aria-label="Wishlist">
        {liked ? <FaHeart /> : <FiHeart />}
      </button>
      <div className="pcard__body">
        <Link to={`/product/${product.slug}`} className="pcard__name">{product.name}</Link>
        <Stars rating={product.rating} count={product.review_count} />
        <div className="pcard__price">
          {product.old_price > product.price && <del>{money(product.old_price)}</del>}
          <strong>{money(product.price)}</strong>
        </div>
        <button className="btn btn--gold btn--block" onClick={() => addToCart(product)} disabled={product.stock <= 0}>
          <FiShoppingCart /> Add to Cart
        </button>
      </div>
    </div>
  );
}

export function ProductGrid({ products, loading, cols = 4 }) {
  if (loading) {
    return <div className={`pgrid pgrid--${cols}`}>{Array.from({ length: cols * 2 }).map((_, i) => <div key={i} className="pcard skeleton" />)}</div>;
  }
  if (!products.length) return <div className="empty">No products found.</div>;
  return <div className={`pgrid pgrid--${cols}`}>{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}

export function SectionTitle({ white, gold, link, linkText = 'View All', children }) {
  return (
    <div className="section-title">
      <h2>{children}{white} <span className="gold">{gold}</span></h2>
      {link && <Link to={link} className="section-title__link">{linkText} <FiArrowRight /></Link>}
    </div>
  );
}

export function HeroSlider({ banners }) {
  const [i, setI] = useState(0);
  const n = banners.length;
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n]);
  if (!n) return <div className="hero hero--empty" />;
  const b = banners[i];
  return (
    <section className="hero">
      <div className="hero__stripes" />
      <img key={b.id} className="hero__img" src={imageUrl(b.image)} alt="" />
      <div className="hero__content container" key={`c${b.id}`}>
        <h1>
          <span className="hero__l1">{b.line1}</span>
          <span className="hero__hl">{b.highlight}</span>
          <span className="hero__l2">{b.line2}</span>
        </h1>
        <div className="hero__perks">
          <span><HiShieldCheck /> 100% Original <br className="hide-sm" />Product</span>
          <span><FaTruck /> Cash on <br className="hide-sm" />Delivery</span>
          <span><BsLightningChargeFill /> Fast &amp; Safe <br className="hide-sm" />Delivery</span>
          <span><RiCustomerService2Line /> Dedicated <br className="hide-sm" />Customer Support</span>
        </div>
        <Link to={b.link || '/shop'} className="btn btn--gold btn--lg">Shop Now <FiArrowRight /></Link>
      </div>
      {n > 1 && (
        <>
          <button className="hero__arrow hero__arrow--l" onClick={() => setI((i - 1 + n) % n)} aria-label="Previous"><FiChevronLeft /></button>
          <button className="hero__arrow hero__arrow--r" onClick={() => setI((i + 1) % n)} aria-label="Next"><FiChevronRight /></button>
          <div className="hero__dots">
            {banners.map((_, k) => <button key={k} className={k === i ? 'is-active' : ''} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />)}
          </div>
        </>
      )}
    </section>
  );
}

const FEATURES = [
  [<HiShieldCheck key="1" />, '100% Original', 'Product'],
  [<FaTruck key="2" />, 'Cash on', 'Delivery'],
  [<FiRefreshCw key="3" />, 'Easy', 'Return Policy'],
  [<RiCustomerService2Line key="4" />, 'Customer', 'Support'],
  [<FiBox key="5" />, 'Quality', 'Checked'],
  [<RiPriceTag3Line key="6" />, 'Best Price', 'Guaranteed'],
];
const MOBILE_FEATURES = [
  [<HiShieldCheck key="1" />, '100%', 'Original Product'],
  [<FaTruck key="2" />, 'Cash on', 'Delivery'],
  [<BsLightningChargeFill key="3" />, 'Fast', 'Delivery'],
  [<RiCustomerService2Line key="4" />, 'Customer', 'Support'],
];

export function FeatureStrip() {
  return (
    <>
      <div className="features features--desktop container">
        {FEATURES.map(([icon, a, b]) => <div key={a} className="feature"><span className="feature__icon">{icon}</span><span>{a}<br />{b}</span></div>)}
      </div>
      <div className="features features--mobile">
        {MOBILE_FEATURES.map(([icon, a, b]) => <div key={a} className="feature"><span className="feature__icon">{icon}</span><span>{a}<br />{b}</span></div>)}
      </div>
    </>
  );
}

export function CategoryTiles({ categories, showAll = true }) {
  return (
    <div className="cat-grid">
      {categories.map((c) => (
        <Link key={c.id} to={`/category/${c.slug}`} className="cat-tile">
          <img src={imageUrl(c.image)} alt={c.name} loading="lazy" />
          <span>{c.name}</span>
        </Link>
      ))}
      {showAll && (
        <Link to="/shop" className="cat-tile cat-tile--all">
          <span className="cat-tile__all-icon"><i /><i /><i /><i /></span>
          <span>All Products</span>
        </Link>
      )}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, '0');

export function Countdown({ end }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(end).getTime() - now || 0);
  const parts = [
    [Math.floor(diff / 864e5), 'Days'],
    [Math.floor(diff / 36e5) % 24, 'Hours'],
    [Math.floor(diff / 6e4) % 60, 'Minutes'],
    [Math.floor(diff / 1e3) % 60, 'Seconds'],
  ];
  return (
    <div className="countdown">
      <span className="countdown__label"><FiClock /> Ends In</span>
      {parts.map(([v, l]) => <span key={l} className="countdown__part"><b>{pad(v)}</b>{l}</span>)}
    </div>
  );
}

export function Breadcrumb({ items }) {
  return (
    <div className="breadcrumb">
      <Link to="/">Home</Link>
      {items.map(([label, to]) => (
        <span key={label}><FiChevronRight />{to ? <Link to={to}>{label}</Link> : label}</span>
      ))}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}
