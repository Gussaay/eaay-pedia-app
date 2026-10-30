// Main page: greeting and stats, then the sections the app is made of.
//
// The question banks used to live here. They moved to /mcqs when the app grew
// past being only an MCQ app — this page's job is now to get you into the
// right section in one tap, not to list everything.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, CloudUpload, Mail, Menu, MessageCircle, PlayCircle, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { getLatest, num } from '../lib/rtdb';
import { isNative, openUrl } from '../lib/native';
import { listPausedSessions } from '../lib/quizSource';
import { usePendingSync, useSyncPendingResults } from '../lib/sync';
import { SECTIONS } from '../lib/sections';
import { LINKS } from '../config';
import Drawer from '../components/Drawer';
import BottomNav from '../components/BottomNav';
import DailyQuiz, { useDailyQuiz } from '../components/DailyQuiz';
import { AppBar, Button, Modal, Page } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function Ring({ value }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 -rotate-90 shrink-0" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} />
    </svg>
  );
}

/** One line: the last paused quiz, tap to resume, ↻ to start it again. */
function ContinueRow({ quiz, onResume, onRestart }) {
  const { title, played, tq } = quiz;
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-100 shadow-sm pl-3 pr-1.5 py-1.5">
      <button onClick={onResume} className="flex-1 min-w-0 flex items-center gap-3 py-1 text-left">
        <PlayCircle size={22} className="text-brand-600 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-sm">
          <span className="font-semibold text-slate-900">Continue</span>
          <span className="text-slate-500"> · {title}</span>
        </span>
        {tq > 0 && (
          <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0">
            {played}/{tq}
          </span>
        )}
      </button>
      <button
        onClick={onRestart}
        className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50"
        aria-label="Start this quiz again"
        title="Start again"
      >
        <RotateCcw size={17} />
      </button>
    </div>
  );
}

function SectionTile({ section, onClick }) {
  const { icon: Icon, title, tagline, live, tint, ring } = section;
  return (
    <button
      onClick={onClick}
      className={`group relative text-left rounded-2xl border p-4 ring-2 ring-transparent transition active:scale-[0.98] ${
        live ? `bg-white border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 ${ring}` : 'bg-white/60 border-slate-100'
      }`}
    >
      {!live && (
        <span className="absolute top-3 right-3 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border border-slate-200">
          Soon
        </span>
      )}
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${live ? tint : 'bg-slate-100 text-slate-400'}`}>
        <Icon size={24} />
      </div>
      <p className={`font-display text-base mt-3 leading-snug ${live ? 'text-slate-900' : 'text-slate-500'}`}>{title}</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{tagline}</p>
    </button>
  );
}

/** A plain white row card: icon, title, one line, chevron. */
function LinkCard({ icon: Icon, img, tint, title, text, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl bg-white border border-slate-100 shadow-sm p-3 text-left transition hover:shadow-md active:scale-[0.99]"
    >
      {img ? (
        <img src={img} alt="" className="h-11 w-11 rounded-xl shrink-0" />
      ) : (
        <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${tint}`}>
          <Icon size={22} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 truncate">{text}</p>
      </div>
      <ChevronRight size={20} className="text-slate-300 shrink-0" />
    </button>
  );
}

// Live sections first; announced ones after them.
const ORDERED_SECTIONS = [...SECTIONS.filter((s) => s.live), ...SECTIONS.filter((s) => !s.live)];

export default function Home() {
  const { user, profile, isAdmin, profileIncomplete } = useAuth();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [contact, setContact] = useState(false);
  const [skipProfile, setSkipProfile] = useState(() => sessionStorage.getItem('skipProfile') === '1');
  useSyncPendingResults(user);
  const pendingResults = usePendingSync();

  const quizzes = useList('allquiz');
  const daily = useDailyQuiz();
  const recentNotifications = useAsync(() => getLatest('all_notification', 10), []);
  const pausedQuizzes = useAsync(() => listPausedSessions(user.uid), [user.uid]);
  const lastPaused = (pausedQuizzes.data || [])[0];
  const latestNotification = (recentNotifications.data || []).find((n) => n.title || n.message);
  const hasNewNotification = !!latestNotification && latestNotification[user.uid] !== 'seen';

  const totalQuestions = useMemo(
    () =>
      quizzes.data
        .filter((q) => String(q.preview) !== 'true')
        .reduce((sum, q) => sum + num(q.number), 0),
    [quizzes.data],
  );
  const overall = num(profile?.over_all);
  const answered = num(profile?.total_play);
  const firstName = String(profile?.name || user.displayName || '').trim().split(/\s+/)[0];

  const skip = () => {
    sessionStorage.setItem('skipProfile', '1');
    setSkipProfile(true);
  };

  return (
    <div className="min-h-screen pb-28">
      <AppBar
        title="Easy Pedia"
        left={
          <button className="p-2 rounded-full hover:bg-white/10" aria-label="Menu" onClick={() => setDrawer(true)}>
            <Menu size={22} />
          </button>
        }
        actions={
          <button
            className="relative p-2 rounded-full hover:bg-white/10"
            aria-label="Notifications"
            onClick={() => navigate('/notifications')}
          >
            <Bell size={22} className={hasNewNotification ? 'animate-wiggle' : ''} />
            {hasNewNotification && <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-brand-700" />}
          </button>
        }
      />
      <Page className="space-y-3">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-sky-500 text-white p-4 shadow-lg shadow-brand-700/20">
          <span className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-3">
            <img src="/img/logo.png" alt="" className="h-12 w-12 rounded-xl shrink-0 shadow-md" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-base leading-tight truncate">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </p>
              <p className="text-white/80 text-sm leading-snug">Ready for today’s practice?</p>
              <p className="text-white/90 text-xs mt-0.5 tabular-nums">
                <b>{answered.toLocaleString()}</b> answered · <b>{totalQuestions ? totalQuestions.toLocaleString() : '—'}</b> questions
              </p>
            </div>
            <button onClick={() => navigate('/performance')} className="relative shrink-0" aria-label="Overall score">
              <Ring value={overall} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{Math.round(overall)}%</span>
            </button>
          </div>
        </section>

        <DailyQuiz daily={daily} />

        {/* A quiz left half-finished is the most likely thing to be wanted
            next, so it is offered here rather than only inside the quiz. Only the
            most recent one is shown; the rest stay reachable from their quiz. */}
        {lastPaused && (
          <ContinueRow quiz={lastPaused} onResume={() => navigate(lastPaused.path)} onRestart={() => navigate(lastPaused.newPath)} />
        )}

        {pendingResults > 0 && (
          <div className="w-full rounded-2xl bg-amber-50 text-amber-900 text-sm font-semibold p-3 flex items-center gap-2">
            <CloudUpload size={18} />
            {pendingResults === 1
              ? '1 result saved offline — sending when you are online'
              : `${pendingResults} results saved offline — sending when you are online`}
          </div>
        )}
        {hasNewNotification && (
          <button
            onClick={() => navigate('/notifications')}
            className="w-full rounded-2xl bg-red-50 text-red-700 text-sm font-semibold p-3 flex items-center gap-2"
          >
            <Bell size={18} /> New notification available
          </button>
        )}

        <div>
          <h2 className="font-display text-slate-800 text-lg mb-2">What would you like to do?</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ORDERED_SECTIONS.map((section) => (
              <SectionTile key={section.key} section={section} onClick={() => navigate(section.to)} />
            ))}
          </div>
        </div>

        {isAdmin && (
          <Button variant="secondary" className="w-full" onClick={() => navigate('/admin')}>
            <ShieldCheck size={18} /> Admin panel
          </Button>
        )}

        <LinkCard
          icon={Sparkles}
          tint="bg-violet-50 text-violet-700"
          title="AI Study"
          text="Ask anything, get explanations, make a quiz"
          onClick={() => navigate('/ai')}
        />

        {!isNative && (
          <LinkCard
            img="/img/logo.png"
            title="Get the Android app"
            text="Same account and scores on your phone"
            onClick={() => navigate('/download')}
          />
        )}
      </Page>

      <button
        onClick={() => setContact(true)}
        className="fixed bottom-24 right-5 z-20 h-14 w-14 rounded-full bg-white shadow-lg flex items-center justify-center text-brand-700 border border-slate-100"
        aria-label="Contact us"
      >
        <MessageCircle size={26} />
      </button>

      <BottomNav alertDot={hasNewNotification} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} />

      <Modal open={contact} onClose={() => setContact(false)} title="Contact us">
        <div className="space-y-2">
          {[
            { label: 'WhatsApp', img: '/img/whatsapp.png', url: LINKS.whatsappDev },
            { label: 'Telegram', img: '/img/telegram.png', url: LINKS.telegramDev },
          ].map((x) => (
            <button key={x.label} onClick={() => openUrl(x.url)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100">
              <img src={x.img} alt="" className="h-8 w-8" /> {x.label}
            </button>
          ))}
          <button onClick={() => openUrl(LINKS.emailDev)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100">
            <Mail className="h-8 w-8 text-red-500" /> Email
          </button>
        </div>
      </Modal>

      <Modal
        open={profileIncomplete && !skipProfile}
        onClose={skip}
        title="Complete your profile"
        footer={
          <>
            <Button variant="outline" onClick={skip}>
              Later
            </Button>
            <Button onClick={() => navigate('/setup')}>
              <Send size={16} /> Update
            </Button>
          </>
        }
      >
        <p className="text-slate-600">Your information is not complete. Please update your name, photo, education level and country.</p>
      </Modal>
    </div>
  );
}
