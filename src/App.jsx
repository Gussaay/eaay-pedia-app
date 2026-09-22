import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Ban } from 'lucide-react';
import { logout, useAuth } from './hooks/useAuth';
import { isNative } from './lib/native';
import { runBackHandlers } from './lib/back';
import { registerForPush, usePushEvents } from './lib/push';
import { Spinner, useToast } from './components/ui';
import UpdatePrompt from './components/UpdatePrompt';
import ConnectionNotice from './components/ConnectionNotice';
import SignIn from './pages/SignIn';
import Home from './pages/Home';

const ProfileSetup = lazy(() => import('./pages/ProfileSetup'));
const Books = lazy(() => import('./pages/Books'));
const Exams = lazy(() => import('./pages/Exams'));
const QuizDetail = lazy(() => import('./pages/QuizDetail'));
const QuizPlay = lazy(() => import('./pages/QuizPlay'));
const Results = lazy(() => import('./pages/Results'));
const Performance = lazy(() => import('./pages/Performance'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Contact = lazy(() => import('./pages/Contact'));
const About = lazy(() => import('./pages/About'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Admin = lazy(() => import('./pages/admin/AdminRoutes'));
const Download = lazy(() => import('./pages/Download'));
const AppUpdates = lazy(() => import('./pages/AppUpdates'));
const Mcqs = lazy(() => import('./pages/Mcqs'));
const ComingSoon = lazy(() => import('./pages/ComingSoon'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const FlashCategoryBooks = lazy(() =>
  import('./pages/FlashBooks').then((m) => ({ default: m.FlashCategoryBooks })),
);
const FlashBookDecks = lazy(() =>
  import('./pages/FlashBooks').then((m) => ({ default: m.FlashBookDecks })),
);
const FlashDeck = lazy(() => import('./pages/FlashDeck'));
const FlashStudy = lazy(() => import('./pages/FlashStudy'));
const FlashGaps = lazy(() => import('./pages/FlashGaps'));

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-500 text-white">
      <div className="h-28 w-28 mb-4 rounded-3xl bg-white p-2 shadow-lg">
        <img src="/img/logo.png" alt="" className="h-full w-full" />
      </div>
      <h1 className="font-display text-3xl">Easy Pedia MCQs</h1>
      <p className="text-white/80 mt-1 text-sm">Made By a Pediatrician for Pediatricians</p>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin, profileLoading } = useAuth();
  // Admin can come from the user record, which arrives a moment after sign-in.
  // Redirecting before it has loaded would bounce a real admin back home.
  if (profileLoading) return <Spinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/** Shown instead of the app when an admin has blocked this account. */
function Blocked() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <Ban size={44} className="text-red-500" />
      <h1 className="font-display text-2xl text-slate-900">This account is blocked</h1>
      <p className="text-slate-600 max-w-sm">
        Your account cannot be used at the moment. If you think this is a mistake, contact us and we
        will look into it.
      </p>
      <button
        onClick={() => logout()}
        className="rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white"
      >
        Sign out
      </button>
    </div>
  );
}

/** Android hardware back: page handlers first, then history, then exit. */
function useNativeBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isNative) return undefined;
    const sub = CapApp.addListener('backButton', () => {
      if (runBackHandlers()) return;
      if (location.pathname === '/' || location.pathname === '/login') CapApp.exitApp();
      else navigate(-1);
    });
    return () => {
      sub.then((h) => h.remove());
    };
  }, [navigate, location.pathname]);
}

/**
 * Registers the device for push once someone is signed in, and decides what a
 * message does when it arrives.
 *
 * Android draws its own tray notification while the app is closed, so the
 * handler below only ever runs for messages that land while the user is
 * looking at the app — hence a toast rather than another notification. A tap
 * on a tray notification arrives here too, with `tapped` set, and should take
 * the user where the message points.
 */
function usePushBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!user?.uid) return;
    // No `ask` here: on the web this only re-uses a permission already given.
    // The prompt itself has to come from a click, on the App & updates screen.
    registerForPush(user.uid);
  }, [user?.uid]);

  usePushEvents((event) => {
    if (event.tapped) {
      navigate(event.data?.url || event.data?.link || '/notifications');
      return;
    }
    toast(event.title ? `${event.title} — ${event.body}`.trim() : event.body);
  });
}

export default function App() {
  const { authLoading, blocked } = useAuth();
  const location = useLocation();
  useNativeBackButton();
  usePushBridge();

  // The public download page must not wait for (or require) sign-in.
  if (authLoading && location.pathname !== '/download') return <Splash />;
  if (blocked) return <Blocked />;

  const guard = (el) => <RequireAuth>{el}</RequireAuth>;

  return (
    <>
      {/* Above the routes so the bar sits at the top of the page rather than
          below it, and never fights the sticky AppBar for the same spot. */}
      <ConnectionNotice />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={<SignIn />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/download" element={<Download />} />
          <Route path="/" element={guard(<Home />)} />
          <Route path="/setup" element={guard(<ProfileSetup />)} />
          <Route path="/mcqs" element={guard(<Mcqs />)} />
          <Route path="/soon/:key" element={guard(<ComingSoon />)} />
          <Route path="/flashcards" element={guard(<Flashcards />)} />
          <Route path="/flashcards/gaps" element={guard(<FlashGaps />)} />
          <Route path="/flashcards/cat/:source" element={guard(<FlashCategoryBooks />)} />
          <Route path="/flashcards/book/:source" element={guard(<FlashBookDecks />)} />
          <Route path="/flashcards/deck/:deckId" element={guard(<FlashDeck />)} />
          <Route path="/flashcards/study/:deckId" element={guard(<FlashStudy />)} />
          <Route path="/cat/:source" element={guard(<Books />)} />
          <Route path="/book/:source" element={guard(<Exams />)} />
          <Route path="/quiz/:kind/:id" element={guard(<QuizDetail />)} />
          <Route path="/play/:kind/:id" element={guard(<QuizPlay />)} />
          <Route path="/results" element={guard(<Results />)} />
          <Route path="/performance" element={guard(<Performance />)} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="/notifications" element={guard(<Notifications />)} />
          <Route path="/app-updates" element={guard(<AppUpdates />)} />
          <Route path="/contact" element={guard(<Contact />)} />
          <Route path="/about" element={guard(<About />)} />
          <Route path="/admin/*" element={guard(<RequireAdmin><Admin /></RequireAdmin>)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <UpdatePrompt />
    </>
  );
}
