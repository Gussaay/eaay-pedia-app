// Main page (MainPageActivity): categories, daily quiz, notifications, drawer.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BookOpen, Mail, Menu, MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAsync, useList } from '../hooks/useData';
import { getLatest, num } from '../lib/rtdb';
import { openUrl } from '../lib/native';
import { LINKS } from '../config';
import Drawer from '../components/Drawer';
import DailyQuiz, { useDailyQuiz } from '../components/DailyQuiz';
import { AppBar, Button, Empty, ErrorBox, ListCard, Modal, OfflineBanner, Page, SkeletonList } from '../components/ui';

export default function Home() {
  const { user, isAdmin, profileIncomplete } = useAuth();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [contact, setContact] = useState(false);
  const [skipProfile, setSkipProfile] = useState(() => sessionStorage.getItem('skipProfile') === '1');

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

  return (
    <div className="min-h-screen">
      <AppBar
        title="Easy Pedia MCQs"
        subtitle={totalQuestions ? `Total of ${totalQuestions.toLocaleString()} questions are available` : undefined}
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
      <Page className="space-y-4">
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

        <h2 className="font-display text-slate-700 text-lg pt-2">Question banks</h2>
        <ErrorBox error={!categories.data.length && categories.error} onRetry={categories.reload} />
        {categories.loading ? (
          <SkeletonList rows={4} />
        ) : categories.data.length === 0 && !categories.error ? (
          <Empty icon={<BookOpen size={40} />} title="No question banks yet" />
        ) : (
          <div className="space-y-3">
            {categories.data.map((c) => (
              <ListCard
                key={c._key}
                img={c.img}
                title={c.title}
                subtitle={isAdmin && String(c.publish) !== 'true' ? 'Not published' : undefined}
                onClick={() => navigate(`/cat/${encodeURIComponent(c.source)}?title=${encodeURIComponent(c.title || '')}`)}
              />
            ))}
          </div>
        )}
      </Page>

      <button
        onClick={() => setContact(true)}
        className="fixed bottom-6 right-5 h-14 w-14 rounded-full bg-white shadow-lg flex items-center justify-center text-brand-700 border border-slate-100 pb-safe"
        aria-label="Contact us"
      >
        <MessageCircle size={26} />
      </button>

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
        onClose={() => {
          sessionStorage.setItem('skipProfile', '1');
          setSkipProfile(true);
        }}
        title="Complete your profile"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                sessionStorage.setItem('skipProfile', '1');
                setSkipProfile(true);
              }}
            >
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
