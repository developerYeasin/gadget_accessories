import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { FiGrid, FiBox, FiTag, FiShoppingBag, FiImage, FiUsers, FiMail, FiSettings, FiLogOut, FiExternalLink, FiMenu, FiBarChart2, FiLayers, FiPercent, FiStar, FiFileText } from 'react-icons/fi';
import { useStore } from '../../context/StoreContext';
import Logo from '../../components/Logo';
import { Dashboard, Orders, Customers, Messages, Settings } from './AdminPages';
import { Products, Categories, Banners } from './AdminCatalog';
import { Reports, Inventory, Coupons, Reviews, Pages, Invoice } from './AdminExtra';

const LINKS = [
  ['Main'],
  ['Dashboard', '', <FiGrid key="1" />],
  ['Orders', 'orders', <FiShoppingBag key="2" />],
  ['Reports', 'reports', <FiBarChart2 key="3" />],
  ['Catalog'],
  ['Products', 'products', <FiBox key="4" />],
  ['Inventory', 'inventory', <FiLayers key="5" />],
  ['Categories', 'categories', <FiTag key="6" />],
  ['Reviews', 'reviews', <FiStar key="7" />],
  ['Marketing'],
  ['Coupons', 'coupons', <FiPercent key="8" />],
  ['Banners', 'banners', <FiImage key="9" />],
  ['Customers'],
  ['Customers', 'customers', <FiUsers key="10" />],
  ['Messages', 'messages', <FiMail key="11" />],
  ['Store'],
  ['Pages', 'pages', <FiFileText key="12" />],
  ['Settings', 'settings', <FiSettings key="13" />],
];

export default function AdminApp() {
  const { user, logout } = useStore();
  const [open, setOpen] = useState(false);
  useEffect(() => { document.title = 'Admin — Gadget Accessories Home'; }, []);

  if (!user) return <Navigate to="/login" state={{ from: '/admin' }} replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="admin">
      <aside className={`no-print admin__side ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)}>
        <Logo />
        <nav>
          {LINKS.map(([label, to, icon], i) => (to === undefined
            ? <span key={`h${i}`} className="admin__group">{label}</span>
            : <NavLink key={label} to={`/admin${to ? '/' + to : ''}`} end className={({ isActive }) => (isActive ? 'is-active' : '')}>{icon} {label}</NavLink>
          ))}
        </nav>
        <Link to="/" className="admin__ext"><FiExternalLink /> View Store</Link>
        <button className="admin__ext" onClick={logout}><FiLogOut /> Logout</button>
      </aside>
      <div className="admin__main">
        <div className="admin__top no-print">
          <button className="icon-btn admin__burger" onClick={() => setOpen(true)} aria-label="Menu"><FiMenu /></button>
          <span className="muted">Logged in as <b className="gold">{user.name}</b></span>
        </div>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="products" element={<Products />} />
          <Route path="categories" element={<Categories />} />
          <Route path="banners" element={<Banners />} />
          <Route path="customers" element={<Customers />} />
          <Route path="messages" element={<Messages />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="pages" element={<Pages />} />
          <Route path="invoice/:id" element={<Invoice />} />
        </Routes>
      </div>
    </div>
  );
}
