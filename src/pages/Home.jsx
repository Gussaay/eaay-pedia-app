// Main page (MainPageActivity): greeting + stats, daily quiz, question banks.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BookOpen, ChevronRight, CloudUpload, Mail, Menu, MessageCircle, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { getLatest, num } from '../lib/rtdb';
import { isNative, openUrl } from '../lib/native';
import { usePendingSync, useSyncPendingResults } from '../lib/sync';
import { LINKS } from '../config';
import Drawer from '../components/Drawer';
import BottomNav from '../components/BottomNav';
import DailyQuiz, { useDailyQuiz } from '../components/DailyQuiz';
import { AppBar, Button, Empty, ErrorBox, Modal, OfflineBanner, Page, Thumb } from '../components/ui';

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
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90 shrink-0" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} />
    </svg>
  );
}

function CategoryCard({ c, onClick, hidden }) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition overflow-hidden flex sm:flex-col"
    >
      <Thumb src={c.img} label={c.title} className="h-24 w-24 sm:h-32 sm:w-full rounded-none text-3xl" />
      <div className="flex-1 p-4 flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="font-display text-slate-900 leading-snug line-clamp-2">{c.title}</p>
          <p className="text-xs text-slate-500 mt-1">{hidden ? 'Not published' : 'Tap to open'}</p>
        </div>
        <ChevronRight className="text-slate-300 group-hover:text-brand-500 shrink-0" size={20} />
      </div>
    </button>
  );
}

export default function Home() {
  const { user, profile, isAdmin, profileIncomplete } = useAuth();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [contact, setContact] = useState(false);
  const [skipProfile, setSkipProfile] = useState(() => sessionStorage.getItem('skipProfile') === '1');
  useSyncPendingResults(user);
  const pendingResults = usePendingSync();

  // Admins also see unpublished categories (same as Android).
  const categories = useList('main_category', {
    filter: (c) => isAdmin || String(c.publish) === 'true',
  });
  const quizzes = useList('allquiz');
  const daily = useDailyQuiz();
  const recentNotifications = useAsync(() => getLatest('all_notification', 10), []);
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
        title="Easy Pedia MCQs"
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
      <OfflineBanner />
      <Page className="space-y-5">
        {/* Greeting + stats */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-sky-500 text-white p-5 shadow-lg shadow-brand-700/20">
          <span className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <span className="absolute right-16 -bottom-12 h-28 w-28 rounded-full bg-white/10" />
          <div className="relative">
            <p className="text-white/80 text-sm">{greeting()}{firstName ? ',' : ''}</p>
            <h2 className="font-display text-2xl leading-tight">{firstName || 'Welcome'} 👋</h2>
            <p className="text-white/80 text-sm mt-1">Ready for today’s practice?</p>
            <div className="mt-4 flex items-center gap-4">
              <button onClick={() => navigate('/performance')} className="flex items-center gap-3 text-left">
                <div className="relative">
                  <Ring value={overall} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{Math.round(overall)}%</span>
                </div>
                <span className="text-xs text-white/80 leading-tight">
                  Overall
                  <br />
                  score
                </span>
              </button>
              <div className="h-10 w-px bg-white/25" />
              <div>
                <p className="text-xl font-bold">{answered.toLocaleString()}</p>
                <p className="text-xs text-white/80">answered</p>
              </div>
              <div className="h-10 w-px bg-white/25" />
              <div>
                <p className="text-xl font-bold">{totalQuestions ? totalQuestions.toLocaleString() : '—'}</p>
                <p className="text-xs text-white/80">questions</p>
              </div>
            </div>
          </div>
        </section>

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
        <DailyQuiz daily={daily} />

        {isAdmin && (
          <Button variant="secondary" className="w-full" onClick={() => navigate('/admin')}>
            <ShieldCheck size={18} /> Admin panel
          </Button>
        )}

        <div>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-slate-800 text-xl">Question banks</h2>
            {categories.data.length > 0 && <span className="text-xs text-slate-400">{categories.data.length} banks</span>}
          </div>
          <ErrorBox error={!categories.data.length && categories.error} onRetry={categories.reload} />
          {categories.loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 sm:h-48 rounded-2xl bg-slate-200/70 animate-pulse" />
              ))}
            </div>
          ) : categories.data.length === 0 && !categories.error ? (
            <Empty icon={<BookOpen size={40} />} title="No question banks yet" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.data.map((c) => (
                <CategoryCard
                  key={c._key}
                  c={c}
                  hidden={isAdmin && String(c.publish) !== 'true'}
                  onClick={() => navigate(`/cat/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`)}
                />
              ))}
            </div>
          )}
        </div>

        {!isNative && (
          <Link
            to="/download"
            className="flex items-center gap-4 rounded-2xl bg-slate-900 text-white p-4 hover:bg-slate-800 transition"
          >
            <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Smartphone size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Get the Android app</p>
              <p className="text-xs text-white/70">Same account and scores on your phone</p>
            </div>
            <ChevronRight size={20} className="text-white/60" />
          </Link>
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
