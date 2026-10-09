// /mnemonics/exam/:source — one exam (e.g. MRCPCH) and its papers.
//
// With a single paper (today: Theory and Science) the paper is shown straight
// away, so the chapters are one tap from the exam. When more papers are added
// (Foundation of Practice, Applied Knowledge…) this becomes a list of them.
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Lightbulb } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useList } from '../hooks/useData';
import BottomNav from '../components/BottomNav';
import { AppBar, Empty, ErrorBox, Page, SkeletonList, Thumb } from '../components/ui';
import { PaperView } from './MnemonicPaper';

export default function MnemonicExam() {
  const { source } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const examTitle = params.get('title') || source;

  const papers = useList('flashbooks', {
    filter: (b) => b.main_category === source && (isAdmin || String(b.publish) !== 'false'),
  });
  const only = papers.data.length === 1 ? papers.data[0] : null;

  return (
    <div className="min-h-screen pb-28">
      <AppBar title={examTitle} subtitle={only ? only.title : 'Choose a paper'} />
      <Page className="space-y-3">
        <ErrorBox error={!papers.data.length && papers.error} onRetry={papers.reload} />
        {papers.loading ? (
          <SkeletonList />
        ) : papers.data.length === 0 ? (
          <Empty icon={<Lightbulb size={40} />} title="No papers in this exam yet" />
        ) : only ? (
          <PaperView book={only} />
        ) : (
          papers.data.map((b) => (
            <button
              key={b._key}
              onClick={() =>
                navigate(
                  `/mnemonics/paper/${encodeURIComponent(b.source)}?title=${encodeURIComponent(b.title || '')}&exam=${encodeURIComponent(examTitle)}`,
                )
              }
              className="group w-full text-left flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:shadow-md active:scale-[0.99]"
            >
              <Thumb src={b.img} label={b.title} className="h-14 w-14 shrink-0 text-xl" />
              <p className="flex-1 min-w-0 font-semibold text-slate-800 truncate">{b.title}</p>
              <ChevronRight className="text-slate-300 group-hover:text-teal-500 shrink-0" size={20} />
            </button>
          ))
        )}
      </Page>
      <BottomNav />
    </div>
  );
}
