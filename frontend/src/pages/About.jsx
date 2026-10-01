import { Link } from 'react-router-dom';
import { FaTruck } from 'react-icons/fa';
import { HiShieldCheck } from 'react-icons/hi';
import { RiCustomerService2Line, RiPriceTag3Line } from 'react-icons/ri';
import { LogoMark } from '../components/Logo';
import { Breadcrumb } from '../components/Shared';

const POINTS = [
  [<HiShieldCheck key="1" />, '100% Original Product', 'Every gadget is sourced from trusted brands and quality checked before delivery.'],
  [<FaTruck key="2" />, 'Cash on Delivery', 'Pay when you receive your product — fast & safe delivery all over Bangladesh.'],
  [<RiPriceTag3Line key="3" />, 'Best Price Guaranteed', 'Premium accessories at fair prices, with regular flash sales and offers.'],
  [<RiCustomerService2Line key="4" />, 'Dedicated Support', 'Our team is ready to help you before and after your purchase.'],
];

export default function About() {
  return (
    <div className="container page">
      <Breadcrumb items={[['About']]} />
      <div className="card about-hero">
        <LogoMark className="auth__logo" />
        <h1 className="page-title">About <span className="gold">Gadget Accessories Home</span></h1>
        <p className="muted">
          Gadget Accessories Home is your trusted destination for the latest gadgets and mobile accessories in Bangladesh —
          power banks, earbuds, smart watches, headphones, chargers, cables and car accessories. We believe everyone deserves
          original, reliable products at the best price, delivered right to their door.
        </p>
        <Link to="/shop" className="btn btn--gold">Shop Now</Link>
      </div>
      <div className="about-grid">
        {POINTS.map(([icon, title, text]) => (
          <div key={title} className="card">{icon}<h3>{title}</h3><p className="muted">{text}</p></div>
        ))}
      </div>
    </div>
  );
}
