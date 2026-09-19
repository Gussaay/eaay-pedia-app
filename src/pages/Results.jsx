// ResultsActivity: score card that can be shared as an image.
import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Home as HomeIcon, RotateCcw, Share2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useList } from '../hooks/useData';
import { rating } from '../lib/quiz';
import { shareImage } from '../lib/native';
import { AppBar, Avatar, Button, Page, useToast } from '../components/ui';

const RATINGS = {
  excellent: { text: 'Excellent performance, well done', img: '/img/trophy_1.png', color: 'text-emerald-600', head: 'Congratulations' },
  good: { text: 'Fair performance, keep working', img: '/img/trophy_2.png', color: 'text-amber-600', head: 'Congratulations' },
  poor: { text: 'Poor performance, work hard.', img: '/img/cancel.png', color: 'text-red-600', head: 'Hard luck' },
};

export default function Results() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const categories = useList('main_category');

  if (!state) return <Navigate to="/" replace />;

  const r = RATINGS[rating(state.percentage)];
  const sourceTitle = categories.data.find((c) => c.source && String(state.source).includes(c.source))?.title;

  const share = async () => {
    setSharing(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      await shareImage(dataUrl, `easypedia-${Date.now()}.png`, `I scored ${state.percentage}% in "${state.title}" on Easy Pedia MCQs!`);
    } catch (e) {
      if (e?.name !== 'AbortError') toast(`Could not share: ${e.message || e}`, 'error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Result" onBack={() => navigate(-1)} />
      <Page className="space-y-4">
        <div ref={cardRef} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 text-center">
          <p className={`font-display text-2xl ${r.color}`}>{r.head}</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Avatar src={profile?.img} size={56} />
            <p className="font-semibold text-slate-800 text-left">{profile?.name}</p>
          </div>
          <img src={r.img} alt="" className="h-28 mx-auto my-5" crossOrigin="anonymous" />
          <p className="text-slate-500 text-sm">You scored</p>
          <p className="text-5xl font-bold text-brand-700 mt-1">{state.percentage}%</p>
          <p className="text-slate-600 mt-2">
            {state.points} points · {state.correct} correct of {state.played}
          </p>
          <p className={`mt-3 font-semibold ${r.color}`}>{r.text}</p>
          <div className="mt-5 pt-4 border-t border-slate-100 text-sm text-slate-500">
            <p className="font-semibold text-slate-700">{state.title}</p>
            {sourceTitle && <p>{sourceTitle}</p>}
            <p className="mt-2 flex items-center justify-center gap-2">
              <img src="/img/logo.png" alt="" className="h-5 w-5" /> Easy Pedia MCQs App
            </p>
          </div>
        </div>
        <Button className="w-full !py-3" onClick={share} loading={sharing}>
          <Share2 size={18} /> Share your result
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <RotateCcw size={18} /> Back to quiz
          </Button>
          <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
            <HomeIcon size={18} /> Home
          </Button>
        </div>
      </Page>
    </div>
  );
}
