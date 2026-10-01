import { Link } from 'react-router-dom';
import { FiHeart } from 'react-icons/fi';
import { useStore } from '../context/StoreContext';
import { Breadcrumb, ProductGrid } from '../components/Shared';

export default function Wishlist() {
  const { wishlist } = useStore();
  if (!wishlist.length) {
    return (
      <div className="container page empty-state">
        <FiHeart className="empty-state__icon" />
        <h2>Your wishlist is empty</h2>
        <Link to="/shop" className="btn btn--gold">Browse Products</Link>
      </div>
    );
  }
  return (
    <div className="container page">
      <Breadcrumb items={[['Wishlist']]} />
      <h1 className="page-title">My <span className="gold">Wishlist</span></h1>
      <ProductGrid products={wishlist} />
    </div>
  );
}
