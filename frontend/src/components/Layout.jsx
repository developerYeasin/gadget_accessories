import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiHeart, FiShoppingCart, FiMenu, FiHome, FiGrid, FiUser, FiX, FiPhone, FiMail, FiMapPin } from 'react-icons/fi';
import { FaFacebookF, FaWhatsapp, FaFacebookMessenger, FaPhoneAlt, FaTruck } from 'react-icons/fa';
import { HiShieldCheck } from 'react-icons/hi';
import { RiCustomerService2Line, RiTruckLine } from 'react-icons/ri';
import Logo from './Logo';
import CartDrawer from './CartDrawer';
import BackToTop from './BackToTop';
import PushPrompt from './PushPrompt';
import { initTracking, track } from '../api/tracking';
import { useStore } from '../context/StoreContext';
import { waLink } from '../api/client';

// Full header menu: fixed pages around the first categories (managed in Admin → Categories, by sort order)
const NAV_CATEGORY_COUNT = 5;
const useNav = () => {
  const { categories } = useStore();
  return [
    ['Home', '/'],
    ['Shop', '/shop'],
    ...categories.slice(0, NAV_CATEGORY_COUNT).map((c) => [c.name, `/category/${c.slug}`]),
    ['Offers', '/offers'],
    ['Contact', '/contact'],
  ];
};

const SHORT_NAV = [
  ['Home', '/'],
  ['Shop', '/shop'],
  ['Offers', '/offers'],
  ['About', '/about'],
  ['Contact', '/contact'],
];

function TopBar() {
  const { settings, user } = useStore();
  return (
    <div className="topbar">
      <div className="container topbar__inner">
        <div className="topbar__items">
          <span><FaTruck className="gold" /> Cash on Delivery Available</span>
          <span><RiTruckLine className="gold" /> Fast &amp; Safe Delivery</span>
          <span><HiShieldCheck className="gold" /> 100% Original Product</span>
          <span><RiCustomerService2Line className="gold" /> Customer Support</span>
        </div>
        <div className="topbar__right">
          <a href={`tel:${settings.phone || '01650230541'}`} className="topbar__phone">
            <FaPhoneAlt className="gold" /> {settings.phone || '01650230541'}
          </a>
          <a className="social social--fb" href={settings.facebook || '#'} target="_blank" rel="noreferrer" aria-label="Facebook"><FaFacebookF /></a>
          <a className="social social--wa" href={waLink(settings)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><FaWhatsapp /></a>
          <a className="social social--ms" href={settings.messenger || '#'} target="_blank" rel="noreferrer" aria-label="Messenger"><FaFacebookMessenger /></a>
          <span className="topbar__sep" />
          <Link to={user ? (user.role === 'admin' ? '/admin' : '/account') : '/login'} className="topbar__account">
            <FiUser className="gold" /> {user ? user.name.split(' ')[0] : 'My Account'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Header({ onMenu, onSearch, onCart }) {
  const { cartCount, wishlist } = useStore();
  const NAV = useNav();
  return (
    <header className="header">
      <div className="container header__inner">
        <button className="icon-btn header__menu" onClick={onMenu} aria-label="Menu"><FiMenu /></button>
        <Logo />
        <nav className="nav nav--compact">
          {SHORT_NAV.map(([label, to]) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}>{label}</NavLink>
          ))}
        </nav>
        <nav className="nav">
          {NAV.map(([label, to]) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}>{label}</NavLink>
          ))}
        </nav>
        <div className="header__icons">
          <button className="icon-btn" onClick={onSearch} aria-label="Search"><FiSearch /></button>
          <Link to="/wishlist" className="icon-btn" aria-label="Wishlist">
            <FiHeart /><span className="badge">{wishlist.length}</span>
          </Link>
          <button className="icon-btn" onClick={onCart} aria-label="Cart">
            <FiShoppingCart /><span className="badge">{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function SearchOverlay({ onClose }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e) => {
    e.preventDefault();
    navigate(`/shop?q=${encodeURIComponent(q.trim())}`);
    onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <form className="search-box" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <FiSearch className="gold" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search power bank, earbuds, watch..." />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><FiX /></button>
      </form>
    </div>
  );
}

function MobileMenu({ onClose }) {
  const { user, categories } = useStore();
  return (
    <div className="overlay overlay--left" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <Logo />
          <button className="icon-btn" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>
        <nav className="drawer__nav" onClick={onClose}>
          {SHORT_NAV.map(([label, to]) => <NavLink key={to} to={to} end>{label}</NavLink>)}
          <div className="drawer__label">Categories</div>
          {categories.map((c) => <NavLink key={c.id} to={`/category/${c.slug}`}>{c.name}</NavLink>)}
          <div className="drawer__label">Account</div>
          <NavLink to="/track-order">Track Order</NavLink>
          <NavLink to="/wishlist">Wishlist</NavLink>
          {user ? <NavLink to={user.role === 'admin' ? '/admin' : '/account'}>My Account</NavLink> : <NavLink to="/login">Login / Register</NavLink>}
        </nav>
      </aside>
    </div>
  );
}

function BottomNav() {
  const { cartCount, user } = useStore();
  const items = [
    ['Home', '/', <FiHome key="h" />],
    ['Shop', '/shop', <FiGrid key="s" />],
    ['Cart', '/cart', <FiShoppingCart key="c" />],
    ['Profile', user ? '/account' : '/login', <FiUser key="p" />],
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([label, to, icon]) => (
        <NavLink key={label} to={to} end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <span className="bottom-nav__icon">{icon}{label === 'Cart' && <span className="badge">{cartCount}</span>}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer() {
  const { settings, categories } = useStore();
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div>
          <Logo />
          <p className="muted footer__about">Your trusted shop for 100% original gadgets &amp; accessories in Bangladesh. Cash on delivery, fast &amp; safe delivery all over the country.</p>
          <div className="footer__social">
            <a className="social social--fb" href={settings.facebook || '#'} target="_blank" rel="noreferrer" aria-label="Facebook"><FaFacebookF /></a>
            <a className="social social--wa" href={waLink(settings)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><FaWhatsapp /></a>
            <a className="social social--ms" href={settings.messenger || '#'} target="_blank" rel="noreferrer" aria-label="Messenger"><FaFacebookMessenger /></a>
          </div>
        </div>
        <div>
          <h4>Categories</h4>
          {categories.slice(0, 7).map((c) => <Link key={c.id} to={`/category/${c.slug}`}>{c.name}</Link>)}
        </div>
        <div>
          <h4>Quick Links</h4>
          <Link to="/shop">Shop</Link>
          <Link to="/offers">Offers</Link>
          <Link to="/track-order">Track Order</Link>
          <Link to="/account">My Account</Link>
          <Link to="/about">About Us</Link>
          <Link to="/contact">Contact Us</Link>
        </div>
        <div>
          <h4>Policies</h4>
          <Link to="/page/privacy-policy">Privacy Policy</Link>
          <Link to="/page/terms-conditions">Terms &amp; Conditions</Link>
          <Link to="/page/return-policy">Return &amp; Refund</Link>
          <Link to="/page/shipping-policy">Shipping Policy</Link>
        </div>
        <div>
          <h4>Contact</h4>
          <p><FiPhone className="gold" /> {settings.phone || '01650230541'}</p>
          <p><FiMail className="gold" /> {settings.email || 'info@gadgetaccessorieshome.com'}</p>
          <p><FiMapPin className="gold" /> {settings.address || 'Dhaka, Bangladesh'}</p>
        </div>
      </div>
      <div className="footer__bottom">© {new Date().getFullYear()} Gadget Accessories Home. All rights reserved.</div>
    </footer>
  );
}

export default function Layout() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const { settings } = useStore();
  const { pathname } = useLocation();
  const ready = Object.keys(settings).length > 0;
  useEffect(() => {
    if (!ready) return;
    initTracking(settings);
    track.pageView(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, ready]);
  return (
    <div className="app">
      <TopBar />
      <Header onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} onCart={() => setCartOpen(true)} />
      <main className="main"><Outlet /></main>
      <Footer />
      <BottomNav />
      <BackToTop />
      <PushPrompt />
      {menu && <MobileMenu onClose={() => setMenu(false)} />}
      {cartOpen && <CartDrawer onClose={closeCart} />}
      {search && <SearchOverlay onClose={() => setSearch(false)} />}
    </div>
  );
}
