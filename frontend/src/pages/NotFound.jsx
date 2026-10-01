import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container page empty-state">
      <h1 className="gold-grad big">404</h1>
      <h2>Page not found</h2>
      <Link to="/" className="btn btn--gold">Back to Home</Link>
    </div>
  );
}
