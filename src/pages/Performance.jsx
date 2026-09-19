// OverAllPerformanceActivity: correct vs wrong answers across all quizzes.
import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { RotateCcw, Share2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { num, updateAt } from '../lib/rtdb';
import { shareImage } from '../lib/native';
import { AppBar, Avatar, Button, Confirm, Page, useToast } from '../components/ui';

function Donut({ correct, wrong }) {
  const total = correct + wrong;
  const r = 70;
  const c = 2 * Math.PI * r;
  const frac = total ? correct / total : 0;
  return (
    <svg viewBox="0 0 180 180" className="w-48 h-48 mx-auto -rotate-90" role="img" aria-label="Correct vs wrong answers">
      <circle cx="90" cy="90" r={r} fill="none" stroke={total ? '#EF4444' : '#E2E8F0'} strokeWidth="22" />
      {total > 0 && (
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="#10B981"
          strokeWidth="22"
          strokeDasharray={`${c * frac} ${c}`}
          strokeLinecap={frac > 0 && frac < 1 ? 'round' : 'butt'}
        />
      )}
    </svg>
  );
}

export default function Performance() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const cardRef = useRef(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const totalPlay = num(profile?.total_play);
  const correct = num(profile?.total_correct);
  const wrong = Math.max(0, totalPlay - correct);
  const overall = profile?.over_all !== undefined ? `${profile.over_all} %` : 'N/A';

  const share = async () => {
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      await shareImage(dataUrl, 'easypedia-performance.png', `My overall performance on Easy Pedia MCQs is ${overall}`);
    } catch (e) {
      if (e?.name !== 'AbortError') toast(`Could not share: ${e.message || e}`, 'error');
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    await updateAt(`quizusers/${user.uid}`, { over_all: '0', total_correct: '0', total_play: '0' });
    toast('Statistics reset', 'success');
  };

  return (
    <div className="min-h-screen">
      <AppBar title="My performance" />
      <Page className="space-y-4">
        <div ref={cardRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <Avatar src={profile?.img} size={48} />
            <p className="font-semibold text-slate-800">{profile?.name}</p>
          </div>
          <p className="text-slate-500 text-sm mt-4">Overall performance is</p>
          <p className="text-4xl font-bold text-brand-700">{overall}</p>
          <div className="relative my-5">
            <Donut correct={correct} wrong={wrong} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Total correct</p>
              <p className="text-xl font-bold text-emerald-700">{correct} answers</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-xs text-red-700">Total wrong</p>
              <p className="text-xl font-bold text-red-700">{wrong} answers</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">Easy Pedia MCQs</p>
        </div>
        <Button className="w-full !py-3" onClick={share}>
          <Share2 size={18} /> Share your performance
        </Button>
        <Button variant="outline" className="w-full" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={18} /> Reset statistics
        </Button>
      </Page>
      <Confirm
        open={confirmReset}
        danger
        message="Do you want to reset all previous statistics?"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
