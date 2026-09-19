// Two kinds of updates:
//  - web/PWA: a new service worker is waiting -> "Reload to update" banner.
//  - native:  the update/app node (same one the Android app read) announces a
//             newer version -> dialog with what's new + install link.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { subscribe } from '../lib/rtdb';
import { isNative, openUrl } from '../lib/native';
import { APP_VERSION_NUMBER } from '../config';
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

export default function UpdatePrompt() {
  const webUpdate = useWebUpdate();
  const [nativeInfo, setNativeInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isNative) return undefined;
    return subscribe('update/app', (info) => {
      if (info && String(info.update) === 'true' && parseFloat(info.ver) > APP_VERSION_NUMBER) {
        setNativeInfo(info);
      } else setNativeInfo(null);
    });
  }, []);

  return (
    <>
      {webUpdate && (
        <div className="fixed bottom-4 inset-x-4 z-[60] sm:left-auto sm:w-96 bg-slate-900 text-white rounded-2xl shadow-xl p-4 flex items-center gap-3">
          <RefreshCw size={20} className="shrink-0" />
          <p className="flex-1 text-sm">A new version of Easy Pedia MCQs is ready.</p>
          <Button className="!py-1.5" onClick={() => webUpdate()}>
            Update
          </Button>
        </div>
      )}
      <Modal
        open={!!nativeInfo && !dismissed}
        onClose={() => setDismissed(true)}
        title={nativeInfo?.title || 'New update available'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDismissed(true)}>
              Later
            </Button>
            <Button onClick={() => openUrl(nativeInfo?.url)} disabled={!nativeInfo?.url}>
              <Download size={18} /> Install
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
