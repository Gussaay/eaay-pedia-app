// Tells the user when there is no internet, instead of leaving them with a
// blank screen and a spinner that never stops.
//
// Two layers, on purpose:
//   - a dialog the first time a connection problem appears, because silence
//     was the actual complaint;
//   - a bar that stays while the problem lasts, so dismissing the dialog does
//     not hide the fact.
//
// Both offer Retry, and both make clear that saved work is not lost — the app
// keeps showing what it already downloaded and queues results to send later.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import {
  checkConnectionNow,
  connectivityStore,
  describe,
  getConnectionType,
} from '../lib/connectivity';
import { Button, Modal } from './ui';

export function useConnectivity() {
  return useSyncExternalStore(
    connectivityStore.subscribe,
    connectivityStore.getSnapshot,
    () => ({ status: 'online', checking: false }),
  );
}

export default function ConnectionNotice() {
  const { status, checking } = useConnectivity();
  const [dismissed, setDismissed] = useState(false);

  const broken = status === 'offline' || status === 'no-internet';
  const info = describe(status, getConnectionType());

  // Each new episode gets its own dialog: dismissing it should not silence the
  // next time the connection drops.
  useEffect(() => {
    if (!broken) setDismissed(false);
  }, [broken]);

  if (!broken) return null;

  const retry = () => checkConnectionNow('user-retry', { force: true });

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2 px-4 py-2 text-sm ${
          status === 'offline' ? 'bg-slate-800 text-white' : 'bg-amber-100 text-amber-900'
        }`}
      >
        <WifiOff size={16} className="shrink-0" />
        <span className="flex-1 min-w-0">
          {status === 'offline' ? 'No connection' : 'No internet'} — showing saved data.
        </span>
        <button
          type="button"
          onClick={retry}
          disabled={checking}
          className="shrink-0 rounded-md border border-current px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Retry'}
        </button>
      </div>

      <Modal
        open={!dismissed}
        onClose={() => setDismissed(true)}
        title={info?.title}
        footer={
          <>
            <Button variant="outline" onClick={() => setDismissed(true)}>
              Continue offline
            </Button>
            <Button onClick={retry} loading={checking}>
              <RefreshCw size={18} /> Try again
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <WifiOff size={22} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-slate-700">{info?.text}</p>
            <p className="mt-3 text-sm text-slate-500">
              You can carry on with anything already downloaded. Quizzes you finish are saved on
              this phone and sent automatically once you are back online.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
