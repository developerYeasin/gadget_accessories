import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFire } from 'react-icons/fa';
import { FiArrowRight } from 'react-icons/fi';
import api from '../api/client';
import { useStore } from '../context/StoreContext';
import { CategoryTiles, Countdown, FeatureStrip, HeroSlider, ProductGrid, SectionTitle } from '../components/Shared';

export default function Home() {
  const { categories, settings } = useStore();
  const [banners, setBanners] = useState([]);
  const [flash, setFlash] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [latest, setLatest] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/banners').then(setBanners),
      api.get('/products?flash=1&limit=10').then((d) => setFlash(d.products)),
      api.get('/products?featured=1&limit=8').then((d) => setFeatured(d.products)),
      api.get('/products?sort=newest&limit=8').then((d) => setLatest(d.products)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <HeroSlider banners={banners} />
      <FeatureStrip />

      <section className="container section">
        <SectionTitle white="Shop by" gold="Category" link="/categories" />
        <CategoryTiles categories={categories} />
      </section>

      <section className="container section flash">
        <div className="flash__head">
          <h2 className="flash__title">
            <FaFire className="flash__fire" /> Flash <span className="gold-grad">Sale</span>
            <span className="pill-red">Limited Time Offer</span>
          </h2>
          <div className="flash__right">
            {settings.flash_sale_end && <Countdown end={settings.flash_sale_end} />}
            <Link to="/shop?flash=1" className="section-title__link">View All <FiArrowRight /></Link>
          </div>
        </div>
        <ProductGrid products={flash} loading={loading} cols={5} />
      </section>

      <section className="container section">
        <SectionTitle white="Featured" gold="Products" link="/shop" />
        <ProductGrid products={featured} loading={loading} />
      </section>

      <section className="container section">
        <SectionTitle white="New" gold="Arrivals" link="/shop?sort=newest" />
        <ProductGrid products={latest} loading={loading} />
      </section>
    </>
  );
}
