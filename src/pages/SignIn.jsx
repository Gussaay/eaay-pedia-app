import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, WifiOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useData';
import { Button, Confirm, Modal, useToast } from '../components/ui';
import {
  authMessage,
  completeGoogleRedirect,
  resetPassword,
  signInEmail,
  signInWithGoogle,
  signUpEmail,
} from '../lib/authActions';

const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export default function SignIn() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [askCreate, setAskCreate] = useState(false);

  useEffect(() => {
    completeGoogleRedirect().catch(() => {});
  }, []);

  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const createAccount = async () => {
    setAskCreate(false);
    setBusy('Creating new user... please wait');
    setError('');
    try {
      await signUpEmail(email.trim(), password);
      toast('Account created successfully', 'success');
      navigate('/setup', { replace: true });
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy('');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Enter email address');
    if (!password.trim()) return setError('Enter password');
    setBusy('Signing in... please wait');
    try {
      await signInEmail(email.trim(), password);
    } catch (err) {
      // Firebase projects with email-enumeration protection return
      // invalid-credential for unknown users too, so offer sign-up for both.
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        setAskCreate(true);
        if (err?.code === 'auth/invalid-credential') setError(authMessage(err));
      } else setError(authMessage(err));
    } finally {
      setBusy('');
    }
  };

  const google = async () => {
    setError('');
    setBusy('Signing in with Google... please wait');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy('');
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Enter your email address first, then tap "Forgot password".');
    try {
      await resetPassword(email.trim());
      toast('Password reset email sent', 'success');
    } catch (err) {
      setError(authMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-700 via-brand-500 to-brand-50 flex flex-col pt-safe">
      <div className="flex flex-col items-center text-white pt-10 pb-6 px-6 text-center">
        <div className="h-24 w-24 rounded-3xl bg-white p-2 shadow-lg">
          <img src="/img/logo.png" alt="" className="h-full w-full" />
        </div>
        <h1 className="font-display text-3xl mt-3">Easy Pedia MCQs</h1>
        <p className="text-white/85 text-sm mt-1">Made By a Pediatrician for Pediatricians</p>
      </div>

      <div className="flex-1 bg-white rounded-t-[2rem] shadow-xl px-6 pt-8 pb-10 max-w-md w-full mx-auto">
        {!online && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">
            <WifiOff size={18} /> Your device is not connected to the internet.
          </div>
        )}
        <h2 className="font-display text-xl text-slate-900 mb-4">Sign In / Sign Up</h2>
        <form onSubmit={submit} className="space-y-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-brand-400">
            <Mail size={18} className="text-slate-400" />
            <input
              type="email"
              autoComplete="email"
              placeholder="Email"
              className="flex-1 py-3 outline-none bg-transparent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-brand-400">
            <Lock size={18} className="text-slate-400" />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password (at least 6 characters)"
              className="flex-1 py-3 outline-none bg-transparent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full !py-3" loading={busy.startsWith('Signing in...')}>
            Sign In with Email
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-brand-700" onClick={forgot}>
              Forgot password?
            </button>
            <button type="button" className="text-brand-700" onClick={() => (email && password.length >= 6 ? setAskCreate(true) : setError('Enter email and a password of at least 6 characters to create an account.'))}>
              Create account
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3 my-6 text-xs text-slate-400">
          <div className="flex-1 h-px bg-slate-200" /> Or use your Google account <div className="flex-1 h-px bg-slate-200" />
        </div>
        <Button variant="outline" className="w-full !py-3" onClick={google}>
          <GoogleG /> Continue with Google
        </Button>

        <p className="text-xs text-slate-500 text-center mt-6">
          By signing in you agree with our{' '}
          <Link to="/privacy" className="text-brand-600 underline">
            privacy policy
          </Link>
        </p>
        <p className="text-xs text-slate-400 text-center mt-4">Made with ♥️ by Dr. Qusay Mohamed</p>
      </div>

      <Confirm
        open={askCreate}
        title="Create new account?"
        message={`No account was found for this email and password.\n\nDo you want to create a new account with ${email}?`}
        confirmText="Create account"
        cancelText="Cancel"
        onConfirm={createAccount}
        onCancel={() => setAskCreate(false)}
      />
      <Modal open={!!busy && !busy.startsWith('Signing in...')} dismissable={false}>
        <div className="flex items-center gap-3 py-4">
          <div className="h-6 w-6 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
          <p className="text-slate-700">{busy}</p>
        </div>
      </Modal>
    </div>
  );
}
