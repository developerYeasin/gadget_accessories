import { useStore } from '../context/StoreContext';
import { Breadcrumb, CategoryTiles } from '../components/Shared';

export default function Categories() {
  const { categories } = useStore();
  return (
    <div className="container page">
      <Breadcrumb items={[['Categories']]} />
      <h1 className="page-title">Shop by <span className="gold">Category</span></h1>
      <CategoryTiles categories={categories} />
    </div>
  );
}
