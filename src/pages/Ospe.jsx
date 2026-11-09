// /ospe — OSPE picture cards: pick a system, or study everything that is due.
// Systems are the same chapters the quizzes use. A row of chips narrows
// everything to one kind of picture (skin, X-ray, ECG...), only for kinds that
// have cards.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Images, Play } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { CHAPTERS } from '../lib/questionBrowse';
import { OSPE_KINDS, filterOspe, groupBySystem, loadOspeCards, loadOspeProgress } from '../lib/ospeData';
import { isDue } from '../lib/flashcards';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Empty, ErrorBox, Page, SkeletonList } from '../components/ui';

export default function Ospe() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState('');
  const cards = useAsync(loadOspeCards, []);
  const progress = useAsync(() => loadOspeProgress(user?.uid), [user?.uid]);

  const all = cards.data || [];
  const kinds = OSPE_KINDS.filter((k) => all.some((c) => c.kind === k.key));
  const shown = useMemo(() => filterOspe(all, { kind }), [all, kind]);
  const systems = useMemo(() => groupBySystem(shown, CHAPTERS), [shown]);
  const due = shown.filter((c) => isDue(progress.data?.[c._key])).length;
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="OSPE" subtitle={all.length ? `${all.length} picture cards` : undefined} />
      <Page className="space-y-4">
        <ErrorBox error={cards.error} onRetry={cards.reload} />
        {cards.loading ? (
          <SkeletonList />
        ) : all.length === 0 ? (
          <Empty icon={<Images size={40} />} title="No picture cards yet">
            Check back soon.
          </Empty>
        ) : (
          <>
            {kinds.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[{ key: '', label: 'All' }, ...kinds].map((k) => (
                  <button
                    key={k.key}
                    onClick={() => setKind(k.key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                      kind === k.key ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            )}
            <Button className="w-full justify-center" onClick={() => navigate(`/ospe/study?${q({ kind })}`)}>
              <Play size={18} /> {due > 0 ? `Study all due (${due})` : 'Study all due'}
            </Button>
            <div className="space-y-2">
              {systems.map((s) => (
                <button
                  key={s.chapter}
                  onClick={() => navigate(`/ospe/system/${encodeURIComponent(s.chapter)}${kind ? `?${q({ kind })}` : ''}`)}
                  className="w-full text-left flex items-center gap-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md active:scale-[0.98] transition"
                >
                  <p className="flex-1 min-w-0 font-semibold text-slate-800 leading-snug">{s.chapter}</p>
                  <span className="text-xs font-semibold bg-sky-50 text-sky-700 rounded-full px-2 py-1">{s.n}</span>
                  <ChevronRight className="text-slate-300 shrink-0" size={20} />
                </button>
              ))}
            </div>
          </>
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
