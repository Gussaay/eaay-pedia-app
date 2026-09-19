// Two kinds of updates:
//  - web/PWA: a new service worker is waiting -> "Update" banner.
//  - native:  native-version.json (published by CI next to the APK) has a newer
//             versionCode than the installed app -> dialog with a download link.
//             The update/app database node (read by the old Android app) is
//             still honoured as a manual announcement.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Download, RefreshCw } from 'lucide-react';
import { subscribe } from '../lib/rtdb';
import { isNative, openUrl } from '../lib/native';
import { fetchNativeVersion, isNewerBuild } from '../lib/nativeVersion';
import { APK_URL, APP_VERSION_NUMBER } from '../config';
import { Button, Modal } from './ui';

let applyWebUpdate = null;
const listeners = new Set();
export function setWebUpdate(fn) {
  applyWebUpdate = fn;
  listeners.forEach((l) => l());
}
const useWebUpdate = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => applyWebUpdate,
  );

const DISMISS_KEY = 'update:dismissed';

export default function UpdatePrompt() {
  const webUpdate = useWebUpdate();
  const [nativeInfo, setNativeInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  // Published build (CI) vs installed build.
  useEffect(() => {
    if (!isNative) return;
    (async () => {
      try {
        const [published, installed] = await Promise.all([fetchNativeVersion(), CapApp.getInfo()]);
        if (!isNewerBuild(published, installed.build)) return;
        if (sessionStorage.getItem(DISMISS_KEY) === String(published.versionCode)) return;
        setNativeInfo({
          title: `Version ${published.version} is available`,
          whatsnew: published.notes,
          size: published.size,
          url: published.apkUrl || APK_URL,
          key: String(published.versionCode),
        });
      } catch {
        /* offline or file not published yet */
      }
    })();
  }, []);

  // Manual announcement from the database (same node the old Android app read).
  useEffect(() => {
    if (!isNative) return undefined;
    return subscribe('update/app', (info) => {
      if (info && String(info.update) === 'true' && parseFloat(info.ver) > APP_VERSION_NUMBER) {
        setNativeInfo((cur) => cur || { ...info, url: info.url || APK_URL, key: `db:${info.ver}` });
      }
    });
  }, []);

  const dismiss = () => {
    if (nativeInfo?.key) sessionStorage.setItem(DISMISS_KEY, nativeInfo.key);
    setDismissed(true);
  };

  return (
    <>
      {webUpdate && (
        <div className="fixed bottom-24 inset-x-4 z-[60] sm:left-auto sm:w-96 bg-slate-900 text-white rounded-2xl shadow-xl p-4 flex items-center gap-3">
          <RefreshCw size={20} className="shrink-0" />
          <p className="flex-1 text-sm">A new version of Easy Pedia MCQs is ready.</p>
          <Button className="!py-1.5" onClick={() => webUpdate()}>
            Update
          </Button>
        </div>
      )}
      <Modal
        open={!!nativeInfo && !dismissed}
        onClose={dismiss}
        title={nativeInfo?.title || 'New update available'}
        footer={
          <>
            <Button variant="outline" onClick={dismiss}>
              Later
            </Button>
            <Button onClick={() => openUrl(nativeInfo?.url || APK_URL)}>
              <Download size={18} /> Download update
            </Button>
          </>
        }
      >
        <img src="/img/happy.png" alt="" className="h-28 mx-auto mb-3" />
        {nativeInfo?.whatsnew && <p className="text-slate-700 whitespace-pre-line">{nativeInfo.whatsnew}</p>}
        {nativeInfo?.size && <p className="text-sm text-slate-500 mt-2">Size: {nativeInfo.size}</p>}
      </Modal>
    </>
  );
}
