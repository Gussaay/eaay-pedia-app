// Every update dialog the app shows. The decisions live in useAppUpdate();
// this file is only the screen for them.
import { useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Download, Info, RefreshCw, RotateCw } from 'lucide-react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { openDownload } from '../lib/downloads';
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
    () => null,
  );

function Progress({ percent, label }) {
  return (
    <div className="mt-4">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-brand-600 transition-all duration-300"
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function UpdatePrompt() {
  const webUpdate = useWebUpdate();
  const {
    ota,
    apk,
    apkDownload,
    apkProgress,
    notice,
    clearNotice,
    downloadApk,
    skipApk,
    installLiveUpdate,
    postponeLiveUpdate,
  } = useAppUpdate();

  const apkBusy = apkDownload?.status === 'downloading';
  const apkReady = apkDownload?.status === 'done';
  // The APK prompt hides the over-the-air one: installing the new APK replaces
  // the web bundle anyway, so showing both would ask for the same thing twice.
  const showOta = ota.ready && !ota.dismissed && !apk;

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

      {/* Full install: the native app itself changed. */}
      <Modal
        open={!!apk}
        onClose={apk?.mandatory ? undefined : skipApk}
        dismissable={!apk?.mandatory && !apkBusy}
        title={apk?.mandatory ? 'Update required' : `Version ${apk?.version} is available`}
        footer={
          <>
            {!apk?.mandatory && (
              <Button variant="outline" onClick={skipApk} disabled={apkBusy}>
                Not now
              </Button>
            )}
            {apkReady ? (
              <Button onClick={() => openDownload(apkDownload.id)}>
                <Download size={18} /> Install
              </Button>
            ) : (
              <Button onClick={downloadApk} loading={apkBusy}>
                <Download size={18} /> {apkBusy ? 'Downloading…' : 'Download and install'}
              </Button>
            )}
          </>
        }
      >
        <img src="/img/happy.png" alt="" className="h-24 mx-auto mb-3" />
        <p className="text-slate-700 whitespace-pre-line">
          {apk?.notes || 'A new version of the app is ready to install.'}
        </p>
        {apk?.size && !apkBusy && <p className="text-sm text-slate-500 mt-2">Download size: {apk.size}</p>}

        {apkBusy && <Progress percent={apkProgress} label={`Downloading… ${apkProgress}%`} />}
        {apkReady && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            Downloaded. Tap Install — Android may first ask you to allow installing from Easy Pedia
            MCQs.
          </p>
        )}
        {apkDownload?.status === 'error' && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {apkDownload.error} Tap Download to try again.
          </p>
        )}
      </Modal>

      {/* Over-the-air: only the web bundle changed. */}
      <Modal
        open={showOta}
        onClose={ota.mandatory ? undefined : postponeLiveUpdate}
        dismissable={!ota.mandatory && !ota.installing}
        title={`Update ready${ota.version ? ` (${ota.version})` : ''}`}
        footer={
          <>
            {!ota.mandatory && (
              <Button variant="outline" onClick={postponeLiveUpdate} disabled={ota.installing}>
                Later
              </Button>
            )}
            <Button onClick={installLiveUpdate} loading={ota.installing}>
              <RotateCw size={18} /> Restart now
            </Button>
          </>
        }
      >
        <p className="text-slate-700">
          {ota.mandatory
            ? 'A required update has been downloaded. The app needs to restart to apply it.'
            : 'A new version has been downloaded already. Restart now to use it, or choose Later and it will apply itself the next time you open the app.'}
        </p>
        {ota.notes && <p className="mt-2 text-sm text-slate-500 whitespace-pre-line">{ota.notes}</p>}
        <p className="mt-3 text-xs text-slate-400">
          Nothing else is downloaded — this update is already on your phone.
        </p>
      </Modal>

      {/* Result of a manual "Check for updates". */}
      <Modal
        open={!!notice}
        onClose={clearNotice}
        dismissable={notice?.tone !== 'busy'}
        title="Updates"
        footer={
          notice?.tone !== 'busy' ? (
            <Button variant="outline" onClick={clearNotice}>
              Close
            </Button>
          ) : null
        }
      >
        <div className="flex items-start gap-3">
          {notice?.tone === 'busy' && <RefreshCw size={20} className="mt-0.5 shrink-0 animate-spin text-brand-600" />}
          {notice?.tone === 'ok' && <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />}
          {notice?.tone === 'error' && <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />}
          {notice?.tone === 'info' && <Info size={20} className="mt-0.5 shrink-0 text-slate-500" />}
          <p className="text-slate-700">{notice?.text}</p>
        </div>
      </Modal>
    </>
  );
}
