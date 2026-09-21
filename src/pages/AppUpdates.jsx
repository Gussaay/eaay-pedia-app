// "App & updates": what version is running, a manual update check, the
// download manager, and the notification switch. Everything a user might want
// when they suspect they are on an old build.
import { useEffect, useState } from 'react';
import { ArrowUp, BellRing, CheckCircle2, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { useAuth } from '../hooks/useAuth';
import { pushPermission, registerForPush } from '../lib/push';
import { isNative } from '../lib/native';
import { APP_VERSION } from '../config';
import DownloadManager from '../components/DownloadManager';
import BottomNav from '../components/BottomNav';
import { AppBar, Button, Card, Page } from '../components/ui';

const LOOK = {
  downloading: { tone: 'bg-sky-50 text-sky-700', icon: RefreshCw, spin: true, text: 'Downloading the update…' },
  checking: { tone: 'bg-slate-50 text-slate-600', icon: RefreshCw, spin: true, text: 'Checking…' },
  ready: { tone: 'bg-red-50 text-red-700', icon: ArrowUp, text: 'An update is ready to install' },
  'up-to-date': { tone: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, text: 'You are on the latest version' },
  offline: { tone: 'bg-slate-50 text-slate-500', icon: WifiOff, text: 'No internet, so updates cannot be checked' },
  web: { tone: 'bg-sky-50 text-sky-700', icon: RefreshCw, text: 'The website updates when you reload the page' },
  unknown: { tone: 'bg-slate-50 text-slate-600', icon: ArrowUp, text: 'Tap to check for updates' },
};

function NotificationSwitch() {
  const { user } = useAuth();
  const [state, setState] = useState('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushPermission().then(setState);
  }, []);

  const enable = async () => {
    setBusy(true);
    // `ask: true` matters on the web: browsers ignore a permission prompt that
    // no click caused, and a refused prompt can never be asked again.
    await registerForPush(user?.uid, { ask: true });
    setState(await pushPermission());
    setBusy(false);
  };

  const granted = state === 'granted';
  const blocked = state === 'denied';

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
          <BellRing size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg">Notifications</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {granted
              ? 'On. You will be told about new MCQs and new app versions, even when the app is closed.'
              : blocked
                ? 'Blocked. Turn notifications back on for Easy Pedia MCQs in your phone or browser settings.'
                : 'Get told about new MCQs and new app versions, even when the app is closed.'}
          </p>
          {!granted && !blocked && (
            <Button className="mt-3" onClick={enable} loading={busy}>
              Turn on notifications
            </Button>
          )}
        </div>
        {granted && <CheckCircle2 size={22} className="shrink-0 text-emerald-600" />}
      </div>
    </Card>
  );
}

export default function AppUpdates() {
  const { ota, status, checkNow } = useAppUpdate();
  const look = LOOK[status] || LOOK.unknown;
  const Icon = look.icon;
  const busy = status === 'checking' || status === 'downloading';

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="App & updates" />
      <Page className="space-y-4">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Smartphone size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg">Easy Pedia MCQs</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Version {ota.bundleVersion && ota.bundleVersion !== 'builtin' ? ota.bundleVersion : APP_VERSION}
                {isNative && ota.nativeBuild ? ` · install ${ota.nativeBuild}` : ''}
              </p>
            </div>
          </div>

          <div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${look.tone}`}>
            <Icon size={18} className={look.spin ? 'animate-spin' : ''} />
            <span className="flex-1">
              {status === 'downloading' && ota.progress ? `Downloading the update… ${Math.round(ota.progress)}%` : look.text}
            </span>
          </div>

          {ota.error && <p className="mt-2 text-sm text-red-600">{ota.error}</p>}

          <Button className="mt-4 w-full justify-center" onClick={checkNow} loading={busy} variant="outline">
            <RefreshCw size={18} /> Check for updates
          </Button>

          {isNative && (
            <p className="mt-3 text-xs text-slate-400">
              Most updates arrive on their own and are only a few hundred KB — a full reinstall is
              needed only when the app itself changes.
            </p>
          )}
        </Card>

        <NotificationSwitch />
        <DownloadManager />
      </Page>
      <BottomNav />
    </div>
  );
}
