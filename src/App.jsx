import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from './hooks/useAuth';
import { isNative } from './lib/native';
import { runBackHandlers } from './lib/back';
import { Spinner } from './components/ui';
import UpdatePrompt from './components/UpdatePrompt';
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
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
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

export default function App() {
  const { authLoading } = useAuth();
  useNativeBackButton();

  if (authLoading) return <Splash />;

  const guard = (el) => <RequireAuth>{el}</RequireAuth>;

  return (
    <>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={<SignIn />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/" element={guard(<Home />)} />
          <Route path="/setup" element={guard(<ProfileSetup />)} />
          <Route path="/cat/:source" element={guard(<Books />)} />
          <Route path="/book/:source" element={guard(<Exams />)} />
          <Route path="/quiz/:kind/:id" element={guard(<QuizDetail />)} />
          <Route path="/play/:kind/:id" element={guard(<QuizPlay />)} />
          <Route path="/results" element={guard(<Results />)} />
          <Route path="/performance" element={guard(<Performance />)} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="/notifications" element={guard(<Notifications />)} />
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
