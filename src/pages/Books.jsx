// McqsMainActivity: the sub-books (mcqs) of one main category.
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Library } from 'lucide-react';
import { useList } from '../hooks/useData';
import { AppBar, Empty, ErrorBox, ListCard, OfflineBanner, Page, SkeletonList } from '../components/ui';

export default function Books() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const editMode = params.get('mode') === 'edit';

  const books = useList('mcqs', {
    filter: (b) => String(b.type) === 'quiz' && (source === '*' || b.main_category === source),
  });

  return (
    <div className="min-h-screen">
      <AppBar title={params.get('title') || 'Books'} subtitle={editMode ? 'Edit mode' : undefined} />
      <OfflineBanner />
      <Page>
        <ErrorBox error={!books.data.length && books.error} onRetry={books.reload} />
        {books.loading ? (
          <SkeletonList />
        ) : books.data.length === 0 ? (
          <Empty icon={<Library size={40} />} title="Nothing here yet">
            New books will appear here once they are published.
          </Empty>
        ) : (
          <div className="space-y-3">
            {books.data.map((b) => (
              <ListCard
                key={b._key}
                img={b.img}
                title={b.title}
                onClick={() => {
                  const qs = new URLSearchParams({ name: b.title || '', type: b.sub_category || '' });
                  if (editMode) qs.set('mode', 'edit');
                  navigate(`/book/${encodeURIComponent(b.source)}?${qs}`);
                }}
              />
            ))}
          </div>
        )}
      </Page>
    </div>
  );
}
