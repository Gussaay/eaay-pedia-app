// /ospe/system/:chapter — the topics of one system, a button to study the
// whole system, and a grid of every picture in it.
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Images, Play } from 'lucide-react';
import { useAsync } from '../hooks/useData';
import { CHAPTERS } from '../lib/questionBrowse';
import { filterOspe, groupBySystem, loadOspeCards } from '../lib/ospeData';
import { OspeTile } from '../components/OspeCard';
import { OspeViewer } from './OspeStudy';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Empty, ErrorBox, Page, SkeletonList } from '../components/ui';

export default function OspeSystem() {
  const { chapter } = useParams();
  const [params] = useSearchParams();
  const kind = params.get('kind') || '';
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const data = useAsync(loadOspeCards, []);
  const cards = useMemo(() => filterOspe(data.data || [], { chapter, kind }, CHAPTERS), [data.data, chapter, kind]);
  const topics = useMemo(() => groupBySystem(cards, CHAPTERS)[0]?.topics || [], [cards]);
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={chapter} subtitle={cards.length ? `${cards.length} picture cards` : undefined} />
      <Page className="space-y-4">
        <ErrorBox error={data.error} onRetry={data.reload} />
        {data.loading ? (
          <SkeletonList />
        ) : cards.length === 0 ? (
          <Empty icon={<Images size={40} />} title="No picture cards here yet" />
        ) : (
          <>
            <Button className="w-full justify-center" onClick={() => navigate(`/ospe/study?${q({ chapter, kind })}`)}>
              <Play size={18} /> Study this system
            </Button>
            <div className="space-y-2">
              {topics.map((t) => (
                <button
                  key={t.topic}
                  onClick={() => navigate(`/ospe/study?${q({ chapter, topic: t.topic, kind, mode: 'browse' })}`)}
                  className="w-full text-left flex items-center gap-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md active:scale-[0.98] transition"
                >
                  <p className="flex-1 min-w-0 font-semibold text-slate-800 leading-snug">{t.label}</p>
                  <span className="text-xs font-semibold bg-sky-50 text-sky-700 rounded-full px-2 py-1">{t.n}</span>
                  <ChevronRight className="text-slate-300 shrink-0" size={20} />
                </button>
              ))}
            </div>
            <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-sky-700">All pictures</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {cards.map((c, i) => (
                <OspeTile key={c._key} card={c} onClick={() => setOpen(i)} />
              ))}
            </div>
          </>
        )}
      </Page>
      {open !== null && cards[open] && <OspeViewer cards={cards} at={open} setAt={setOpen} onClose={() => setOpen(null)} />}
      <BottomNav />
    </div>
  );
}
