import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FiHeart, FiShoppingCart, FiMinus, FiPlus, FiCheckCircle, FiChevronLeft, FiChevronRight, FiX,
  FiMaximize2, FiTruck, FiRefreshCw, FiLink, FiMapPin,
} from 'react-icons/fi';
import { FaHeart, FaWhatsapp, FaFacebookF, FaStar } from 'react-icons/fa';
import { HiShieldCheck } from 'react-icons/hi';
import { RiSecurePaymentLine } from 'react-icons/ri';
import toast from 'react-hot-toast';
import api, { imageUrl, money } from '../api/client';
import { useStore } from '../context/StoreContext';
import { track } from '../api/tracking';
import { Breadcrumb, ProductGrid, Spinner, Stars } from '../components/Shared';

/* ---------- Gallery with hover zoom, arrows, swipe and fullscreen lightbox ---------- */
function Gallery({ images, name, discount }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const touchX = useRef(null);
  const n = images.length;
  const go = useCallback((d) => setActive((i) => (i + d + n) % n), [n]);

  useEffect(() => setActive(0), [images]);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
    };
  }, [lightbox, go]);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  const swipe = {
    onTouchStart: (e) => { touchX.current = e.touches[0].clientX; },
    onTouchEnd: (e) => {
      if (touchX.current == null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      touchX.current = null;
    },
  };
  const src = imageUrl(images[active]);

  return (
    <div className="gal">
      {n > 1 && (
        <div className="gal__thumbs">
          {images.map((img, i) => (
            <button key={img + i} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} aria-label={`Image ${i + 1}`}>
              <img src={imageUrl(img)} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="gal__main" onMouseMove={onMove} onMouseLeave={() => setZoom(null)} onClick={() => setLightbox(true)} {...swipe}>
        <img key={src} src={src} alt={name} className="gal__img" />
        {zoom && <div className="gal__zoom" style={{ backgroundImage: `url(${src})`, backgroundPosition: `${zoom.x}% ${zoom.y}%` }} />}
        {discount > 0 && <span className="pcard__badge">-{discount}%</span>}
        <span className="gal__expand"><FiMaximize2 /></span>
        {n > 1 && (
          <>
            <button className="gal__arrow gal__arrow--l" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous image"><FiChevronLeft /></button>
            <button className="gal__arrow gal__arrow--r" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next image"><FiChevronRight /></button>
            <span className="gal__count">{active + 1} / {n}</span>
          </>
        )}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)} {...swipe}>
          <button className="lightbox__close" aria-label="Close"><FiX /></button>
          <img src={src} alt={name} onClick={(e) => e.stopPropagation()} />
          {n > 1 && (
            <>
              <button className="gal__arrow gal__arrow--l" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous image"><FiChevronLeft /></button>
              <button className="gal__arrow gal__arrow--r" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next image"><FiChevronRight /></button>
              <div className="lightbox__dots" onClick={(e) => e.stopPropagation()}>
                {images.map((img, i) => <button key={img + i} className={i === active ? 'is-active' : ''} onClick={() => setActive(i)} aria-label={`Image ${i + 1}`} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewSummary({ rating, count, reviews }) {
  const dist = [5, 4, 3, 2, 1].map((s) => [s, reviews.filter((r) => r.rating === s).length]);
  const total = reviews.length || 1;
  return (
    <div className="rsum">
      <div className="rsum__score">
        <b>{Number(rating).toFixed(1)}</b>
        <Stars rating={rating} />
        <span className="muted small">{count} ratings</span>
      </div>
      <div className="rsum__bars">
        {dist.map(([s, c]) => (
          <div key={s} className="rsum__row">
            <span>{s} <FaStar /></span>
            <div className="hbar__track"><i style={{ width: `${(c / total) * 100}%` }} /></div>
            <span className="muted">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, toggleWishlist, inWishlist, user, settings } = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState('description');
  const [review, setReview] = useState({ rating: 5, comment: '' });

  const load = () => api.get(`/products/${slug}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { if (data?.product) track.viewItem(data.product); }, [data?.product?.id]);
  useEffect(() => {
    setData(null); setError(''); setQty(1); setTab('description');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) return <div className="container page empty">{error} <button className="btn btn--ghost btn--sm" onClick={() => { setError(''); load(); }}>Retry</button></div>;
  if (!data) return <div className="container page"><Spinner /></div>;
  const { product: p, related, reviews } = data;
  const images = p.images?.length ? p.images : [p.image];
  const liked = inWishlist(p.id);
  const pageUrl = window.location.href;
  const lowStock = p.stock > 0 && p.stock <= 10;

  const submitReview = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/products/${p.id}/reviews`, review);
      toast.success('Thanks for your review!');
      setReview({ rating: 5, comment: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const buyNow = () => { addToCart(p, qty, true); navigate('/checkout'); };
  const copyLink = () => navigator.clipboard.writeText(pageUrl).then(() => toast.success('Link copied'));

  const specs = [
    ['Brand', p.brand], ['Category', p.category_name], ['Model', p.name],
    ...p.features.map((f, i) => [`Feature ${i + 1}`, f]),
    ['Warranty', 'Official brand warranty'], ['Condition', 'Brand new, 100% original'],
    ['Availability', p.stock > 0 ? 'In stock' : 'Out of stock'],
  ].filter(([, v]) => v);

  return (
    <div className="container page">
      <Breadcrumb items={[[p.category_name || 'Shop', p.category_slug ? `/category/${p.category_slug}` : '/shop'], [p.name]]} />
      <div className="pd">
        <Gallery images={images} name={p.name} discount={p.discount} />

        <div className="pd__info">
          <div className="pd__meta">
            {p.brand && <span className="pd__brand">{p.brand}</span>}
            {p.category_name && <Link to={`/category/${p.category_slug}`} className="pd__cat">{p.category_name}</Link>}
          </div>
          <h1>{p.name}</h1>
          <div className="pd__rating">
            <Stars rating={p.rating} count={p.review_count} />
            <span className="muted small">· {p.sold_count}+ sold</span>
          </div>

          <div className="pd__pricebox">
            <div className="pd__price">
              <strong>{money(p.price)}</strong>
              {p.old_price > p.price && <del>{money(p.old_price)}</del>}
              {p.discount > 0 && <span className="pill-red">-{p.discount}%</span>}
            </div>
            {p.discount > 0 && <p className="pd__save">You save {money(p.old_price - p.price)}</p>}
          </div>

          <p className="muted">{p.short_description}</p>
          {p.features?.length > 0 && (
            <ul className="pd__features">{p.features.map((f) => <li key={f}><FiCheckCircle /> {f}</li>)}</ul>
          )}

          <div className={`pd__stock ${p.stock > 0 ? 'ok' : 'out'}`}>
            {p.stock <= 0 ? 'Out of Stock' : lowStock ? `Hurry! Only ${p.stock} left in stock` : `In Stock (${p.stock} available)`}
            {lowStock && <div className="pd__stockbar"><i style={{ width: `${(p.stock / 10) * 100}%` }} /></div>}
          </div>

          <div className="pd__actions">
            <div className="qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease"><FiMinus /></button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(Math.max(p.stock, 1), q + 1))} aria-label="Increase"><FiPlus /></button>
            </div>
            <button className="btn btn--gold pd__cart" disabled={p.stock <= 0} onClick={() => addToCart(p, qty)}><FiShoppingCart /> Add to Cart</button>
            <button className="btn btn--outline pd__buy" disabled={p.stock <= 0} onClick={buyNow}>Buy Now</button>
            <button className={`icon-btn icon-btn--box ${liked ? 'is-liked' : ''}`} onClick={() => toggleWishlist(p)} aria-label="Wishlist">{liked ? <FaHeart /> : <FiHeart />}</button>
          </div>
          <a className="btn btn--wa" href={`${settings.whatsapp || 'https://wa.me/8801650230541'}?text=${encodeURIComponent(`I want to order: ${p.name} (${money(p.price)}) — ${pageUrl}`)}`} target="_blank" rel="noreferrer">
            <FaWhatsapp /> Order on WhatsApp
          </a>

          <div className="pd__delivery">
            <div><FiMapPin /><span><b>Inside Dhaka</b> — {money(settings.delivery_inside_dhaka ?? 60)} · 1–2 days</span></div>
            <div><FiTruck /><span><b>Outside Dhaka</b> — {money(settings.delivery_outside_dhaka ?? 120)} · 2–4 days</span></div>
          </div>

          <div className="pd__trust">
            <span><HiShieldCheck /> 100% Original</span>
            <span><RiSecurePaymentLine /> Cash on Delivery</span>
            <span><FiRefreshCw /> Easy Return</span>
            <span><FiCheckCircle /> Brand Warranty</span>
          </div>

          <div className="pd__share">
            <span className="muted small">Share:</span>
            <a className="social social--fb" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer" aria-label="Share on Facebook"><FaFacebookF /></a>
            <a className="social social--wa" href={`https://wa.me/?text=${encodeURIComponent(`${p.name} ${pageUrl}`)}`} target="_blank" rel="noreferrer" aria-label="Share on WhatsApp"><FaWhatsapp /></a>
            <button className="social social--link" onClick={copyLink} aria-label="Copy link"><FiLink /></button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {[['description', 'Description'], ['specs', 'Specifications'], ['delivery', 'Delivery & Return'], ['reviews', `Reviews (${reviews.length})`]].map(([k, l]) => (
          <button key={k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card tab-body">
        {tab === 'description' && (
          <>
            <p className="pre">{p.description}</p>
            {p.features?.length > 0 && (
              <>
                <h4 className="tab-h">Key Features</h4>
                <ul className="pd__features">{p.features.map((f) => <li key={f}><FiCheckCircle /> {f}</li>)}</ul>
              </>
            )}
          </>
        )}
        {tab === 'specs' && (
          <table className="spec-table"><tbody>{specs.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
        )}
        {tab === 'delivery' && (
          <div className="pre">
            <h4 className="tab-h">Delivery</h4>
            {`• Inside Dhaka: ${money(settings.delivery_inside_dhaka ?? 60)}, delivered in 1–2 working days.\n• Outside Dhaka: ${money(settings.delivery_outside_dhaka ?? 120)}, delivered in 2–4 working days.\n• Cash on delivery available all over Bangladesh — check the product before you pay.`}
            <h4 className="tab-h">Return &amp; Refund</h4>
            {'• Report a damaged or wrong product within 3 days of delivery.\n• Product must be unused, in the original box with all accessories.\n• Replacement or refund within 7 working days after inspection.'}
            <p><Link to="/page/return-policy" className="gold">Read full return policy →</Link></p>
          </div>
        )}
        {tab === 'reviews' && (
          <>
            <ReviewSummary rating={p.rating} count={p.review_count} reviews={reviews} />
            {reviews.length === 0 && <p className="muted">No written reviews yet — be the first!</p>}
            {reviews.map((r) => (
              <div key={r.id} className="review">
                <div className="review__head"><strong>{r.user_name}</strong><Stars rating={r.rating} /></div>
                <span className="muted small">{r.created_at.slice(0, 10)}</span>
                {r.comment && <p>{r.comment}</p>}
              </div>
            ))}
            {user ? (
              <form className="review-form" onSubmit={submitReview}>
                <h4>Write a review</h4>
                <div className="star-pick">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button type="button" key={n} className={n <= review.rating ? 'on' : ''} onClick={() => setReview({ ...review, rating: n })} aria-label={`${n} stars`}><FaStar /></button>
                  ))}
                </div>
                <textarea className="input" rows={3} placeholder="Share your experience" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                <button className="btn btn--gold">Submit Review</button>
              </form>
            ) : (
              <p className="muted"><Link to="/login" state={{ from: `/product/${p.slug}` }} className="gold">Login</Link> to write a review.</p>
            )}
          </>
        )}
      </div>

      {related.length > 0 && (
        <section className="section">
          <div className="section-title"><h2>Related <span className="gold">Products</span></h2></div>
          <ProductGrid products={related} />
        </section>
      )}

      <div className="pd-sticky">
        <div className="pd-sticky__price">
          <strong>{money(p.price)}</strong>
          {p.old_price > p.price && <del>{money(p.old_price)}</del>}
        </div>
        <button className="btn btn--outline" disabled={p.stock <= 0} onClick={buyNow}>Buy Now</button>
        <button className="btn btn--gold" disabled={p.stock <= 0} onClick={() => addToCart(p, qty)}><FiShoppingCart /> Add</button>
      </div>
    </div>
  );
}
