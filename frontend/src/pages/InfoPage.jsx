import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { Breadcrumb, Spinner } from '../components/Shared';

export default function InfoPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(null);
    setError('');
    api.get(`/pages/${slug}`).then(setPage).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="container page empty">{error}</div>;
  if (!page) return <div className="container page"><Spinner /></div>;
  return (
    <div className="container page narrow">
      <Breadcrumb items={[[page.title]]} />
      <h1 className="page-title">{page.title}</h1>
      <div className="card form-card"><p className="pre">{page.content}</p></div>
    </div>
  );
}
