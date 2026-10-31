import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/ui';
import { startLiveUpdates } from './lib/liveUpdate';
import { startConnectivityWatch } from './lib/connectivity';
import { applyWebUpdateQuietly } from './lib/quietWebUpdate';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#1976D2' }).catch(() => {});
  // A service worker must not run inside the native WebView (it would keep
  // serving the old bundle after an app update). Remove any left-overs.
  navigator.serviceWorker?.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister()));
  // Over-the-air updates. This also calls notifyAppReady(), which has to run
  // on every launch or the bundle currently running is rolled back.
  startLiveUpdates();
} else {
  // UPDATES ARE SILENT, like an ordinary website: no banner, no reload in
  // the middle of a quiz. A new release downloads in the background and waits;
  // it starts the next time the app is opened, or a minute after the app goes into
  // the background (lib/quietWebUpdate.js). The open page keeps every file of
  // its own release in the service-worker cache, and the deploy keeps them on
  // the server for two weeks as well.
  let switching = false;
  // Pages where a reload could lose an answer or unsaved text.
  const busy = () => /^\/(play|setup|profile|admin|ai)(\/|$)/.test(window.location.pathname);
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      applyWebUpdateQuietly(() => {
        switching = true;
        updateSW();
      }, { busy });
    },
    onNeedReload() {
      // The new release took control. Reload only when this page asked for it
      // (above); otherwise the plugin would reload on its own.
      if (switching) window.location.reload();
    },
  });

  // A screen whose code file cannot be loaded (an old release's file that is
  // gone) would otherwise stay blank. Start again on the current release, at
  // most once every two minutes and never offline.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      const last = Number(sessionStorage.getItem('stale_build_recovery_at') || 0);
      if (navigator.onLine === false || Date.now() - last < 2 * 60 * 1000) return;
      sessionStorage.setItem('stale_build_recovery_at', String(Date.now()));
    } catch { /* storage unavailable: still try once */ }
    window.location.reload();
  });
}

// Watches for the connection dropping, so the app can say so instead of
// failing silently behind a spinner.
startConnectivityWatch();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
