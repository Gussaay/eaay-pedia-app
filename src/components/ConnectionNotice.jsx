// A small "Offline" pill while there is no internet.
//
// It used to be a full-width bar plus a dialog, which interrupted whatever the
// reader was doing (often the middle of a quiz that works perfectly well
// offline). Now it is a quiet pill floating at the top of the screen:
//   - it never takes layout space, so nothing on the page moves;
//   - it lets taps pass through (pointer-events-none), so it never blocks a
//     button underneath it;
//   - it shows a word for a few seconds and then shrinks to an icon.
// Nothing asks the reader anything. The app keeps retrying in the background
// (lib/connectivity.js) and the pill disappears once the internet is back.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { connectivityStore } from '../lib/connectivity';

const LABEL_MS = 4000; // how long the word stays before the pill shrinks

export function useConnectivity() {
  return useSyncExternalStore(
    connectivityStore.subscribe,
    connectivityStore.getSnapshot,
    () => ({ status: 'online', checking: false }),
  );
}

export default function ConnectionNotice() {
  const { status } = useConnectivity();
  // The sign-in page says it in its own words; it has no AppBar to sit under.
  const { pathname } = useLocation();
  const broken = status === 'offline' || status === 'no-internet';
  const [showLabel, setShowLabel] = useState(true);

  // Each new episode shows the word again, then shrinks.
  useEffect(() => {
    if (!broken) return undefined;
    setShowLabel(true);
    const t = setTimeout(() => setShowLabel(false), LABEL_MS);
    return () => clearTimeout(t);
  }, [broken]);

  if (!broken || pathname === '/login') return null;

  const label = status === 'offline' ? 'Offline' : 'No internet';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${label} — showing saved data`}
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem + 6px)' }} // just under the AppBar, over the page's top padding
    >
      <span
        data-testid="offline-pill"
        className="flex items-center gap-1.5 rounded-full bg-slate-800/85 px-2 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur transition-all"
      >
        <WifiOff size={12} className="shrink-0" />
        {showLabel && <span>{label}</span>}
      </span>
    </div>
  );
}
