// Announcement page for a section that is not built yet.
//
// It does one useful thing beyond saying "soon": it lets people say they want
// it. The counts across the three upcoming sections are what should decide
// which gets built first, and that is a better signal than guessing.
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing, Check, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useData';
import { getOne, updateAt } from '../lib/rtdb';
import { COMING_SOON, sectionByKey } from '../lib/sections';
import BottomNav from '../components/BottomNav';
import { Button, Card, Page, useToast } from '../components/ui';

export default function ComingSoon() {
  const { key } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [justAsked, setJustAsked] = useState(false);

  const section = sectionByKey(key);
  const detail = COMING_SOON[key];

  const interest = useAsync(() => (key ? getOne(`interest/${key}`) : null), [key]);

  // A section that has since gone live should open, not show this page.
  if (!section || !detail) return <Navigate to="/" replace />;
  if (section.live) return <Navigate to={section.to} replace />;

  const people = interest.data ? Object.keys(interest.data).length : 0;
  const alreadyAsked = justAsked || !!(user && interest.data?.[user.uid]);
  const Icon = section.icon;

  const tellMe = async () => {
    setBusy(true);
    try {
      await updateAt(`interest/${key}`, { [user.uid]: Date.now() });
      setJustAsked(true);
      toast('We will let you know as soon as it is ready.', 'success');
    } catch (e) {
      toast(e.message || 'Could not save that', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pb-28 bg-slate-50">
      <div className={`px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] ${section.tint}`}>
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-black/5"
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-16 w-16 rounded-3xl bg-white/70 flex items-center justify-center shrink-0">
            <Icon size={32} />
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
              <Sparkles size={12} /> Coming soon
            </span>
            <h1 className="font-display text-2xl mt-1.5 leading-tight">{section.title}</h1>
          </div>
        </div>
      </div>

      <Page className="space-y-4 -mt-4">
        <Card className="p-5">
          <p className="text-slate-700 leading-relaxed">{detail.blurb}</p>
          <ul className="mt-4 space-y-2.5">
            {detail.points.map((point) => (
              <li key={point} className="flex gap-3 text-slate-700">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-slate-100 flex items-center justify-center">
                  <Check size={13} className="text-slate-500" />
                </span>
                <span className="text-sm leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <p className="font-display text-lg">Want this one first?</p>
          <p className="text-sm text-slate-500 mt-1">
            {people > 0
              ? `${people} ${people === 1 ? 'person has' : 'people have'} asked for it so far. `
              : ''}
            Whichever section people ask for most is the one we build next.
          </p>
          {alreadyAsked ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <Check size={18} className="shrink-0" /> You are on the list — we will send you a
              notification when it opens.
            </p>
          ) : (
            <Button className="mt-4 w-full justify-center" onClick={tellMe} loading={busy}>
              <BellRing size={18} /> Tell me when it is ready
            </Button>
          )}
        </Card>

        <p className="text-center text-sm text-slate-500">
          In the meantime,{' '}
          <button onClick={() => navigate('/mcqs')} className="font-semibold text-brand-700 underline">
            MCQs
          </button>{' '}
          and{' '}
          <button onClick={() => navigate('/flashcards')} className="font-semibold text-brand-700 underline">
            Flash Cards
          </button>{' '}
          are ready to use.
        </p>
      </Page>
      <BottomNav />
    </div>
  );
}
