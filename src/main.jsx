import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/ui';
import { setWebUpdate } from './components/UpdatePrompt';
import { startLiveUpdates } from './lib/liveUpdate';
import { startConnectivityWatch } from './lib/connectivity';
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
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setWebUpdate(() => updateSW(true));
    },
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
