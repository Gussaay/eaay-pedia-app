// Main page: greeting and stats, then the sections the app is made of.
//
// The question banks used to live here. They moved to /mcqs when the app grew
// past being only an MCQ app — this page's job is now to get you into the
// right section in one tap, not to list everything.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, CloudUpload, Mail, Menu, MessageCircle, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { getLatest, num } from '../lib/rtdb';
import { isNative, openUrl } from '../lib/native';
import { usePendingSync, useSyncPendingResults } from '../lib/sync';
import { SECTIONS } from '../lib/sections';
import { LINKS } from '../config';
import Drawer from '../components/Drawer';
import BottomNav from '../components/BottomNav';
import DailyQuiz, { useDailyQuiz } from '../components/DailyQuiz';
import { AppBar, Button, Modal, OfflineBanner, Page } from '../components/ui';

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

function SectionTile({ section, onClick }) {
  const { icon: Icon, title, tagline, live, tint, ring } = section;
  return (
    <button
      onClick={onClick}
      className={`group relative text-left bg-white rounded-2xl border border-slate-100 p-4 shadow-sm ring-2 ring-transparent transition hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] ${ring}`}
    >
      {!live && (
        <span className="absolute top-3 right-3 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Soon
        </span>
      )}
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${tint}`}>
        <Icon size={24} />
      </div>
      <p className="font-display text-base text-slate-900 mt-3 leading-snug">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{tagline}</p>
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
      <OfflineBanner />
      <Page className="space-y-5">
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

        <div>
          <h2 className="font-display text-slate-800 text-xl mb-3">What would you like to do?</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SECTIONS.map((section) => (
              <SectionTile key={section.key} section={section} onClick={() => navigate(section.to)} />
            ))}
          </div>
        </div>

        <DailyQuiz daily={daily} />

        {isAdmin && (
          <Button variant="secondary" className="w-full" onClick={() => navigate('/admin')}>
            <ShieldCheck size={18} /> Admin panel
          </Button>
        )}

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
