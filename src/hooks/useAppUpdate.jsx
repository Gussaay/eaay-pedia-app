// One hook for the three ways this app can update itself:
//
//   web    the service worker has a new build waiting -> reload.
//   live   a new web bundle downloaded over the air -> restart the WebView.
//          This is the usual case and costs the user a few hundred KB.
//   apk    a full install. Every release also builds an APK, but most only
//          change the web code, which arrives over the air. So the APK prompt
//          appears only when an admin asks for it (Update manager, "Ask users
//          to install the latest APK" or "Required"), or when the installed
//          app is older than the over-the-air bundle allows (minNativeBuild).
//
// When it does appear, "apk" wins over "live": an over-the-air bundle that
// expects a plugin the installed APK does not have would crash on launch.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  checkForLiveUpdate,
  installLiveUpdate,
  liveUpdateStore,
  postponeLiveUpdate,
  reopenLiveUpdate,
} from '../lib/liveUpdate';
import { downloadStore, getDownload, startDownload } from '../lib/downloads';
import { fetchNativeVersion, isNewerBuild } from '../lib/nativeVersion';
import { subscribe } from '../lib/rtdb';
import { isNative } from '../lib/native';
import { APK_URL, LIVE_UPDATE_URL } from '../config';

const SKIPPED_BUILD_KEY = 'update:skipped-build';
const APK_DOWNLOAD_ID = 'easy-pedia-apk';

export function useAppUpdate() {
  const ota = useSyncExternalStore(liveUpdateStore.subscribe, liveUpdateStore.getSnapshot);
  const downloads = useSyncExternalStore(downloadStore.subscribe, downloadStore.getSnapshot);
  const [apk, setApk] = useState(null);
  const [nativeConfig, setNativeConfig] = useState(null);
  const [notice, setNotice] = useState(null); // { tone, text } for the manual check

  const apkDownload = downloads.find((d) => d.id === APK_DOWNLOAD_ID) || null;

  // Admin overrides for the APK prompt (force it, hide it, change the wording).
  useEffect(() => {
    if (!isNative) return undefined;
    return subscribe('update/native', setNativeConfig);
  }, []);

  const lookForApk = useCallback(async () => {
    if (!isNative) return null;
    try {
      const [published, installed] = await Promise.all([fetchNativeVersion(), CapApp.getInfo()]);
      if (!isNewerBuild(published, installed.build)) {
        setApk(null);
        return null;
      }
      const on = (v) => v === true || v === 'true';
      const mandatory = on(nativeConfig?.mandatory);
      // Too old for the over-the-air bundle: the APK is the only way forward.
      const live = await fetch(`${LIVE_UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const tooOld = Number(live?.minNativeBuild) > Number(installed.build);
      if (on(nativeConfig?.hidden) || !(mandatory || tooOld || on(nativeConfig?.prompt))) {
        setApk(null);
        return null;
      }
      // "Not now" survives a restart, so the same build stops nagging. A
      // required update ignores it.
      if (!mandatory && !tooOld && localStorage.getItem(SKIPPED_BUILD_KEY) === String(published.versionCode)) {
        setApk(null);
        return null;
      }
      const info = {
        version: published.version,
        versionCode: published.versionCode,
        notes: nativeConfig?.message || published.notes,
        size: published.size,
        url: published.apkUrl || APK_URL,
        mandatory: mandatory || tooOld,
      };
      setApk(info);
      return info;
    } catch {
      return null; // offline, or CI has not published yet
    }
  }, [nativeConfig]);

  useEffect(() => {
    lookForApk();
  }, [lookForApk]);

  const downloadApk = useCallback(() => {
    const url = apk?.url || APK_URL;
    return startDownload({
      id: APK_DOWNLOAD_ID,
      url,
      fileName: 'easy-pedia-mcqs.apk',
      title: `Easy Pedia MCQs ${apk?.version || ''}`.trim(),
    });
  }, [apk]);

  const skipApk = useCallback(() => {
    if (apk?.mandatory) return;
    if (apk?.versionCode) localStorage.setItem(SKIPPED_BUILD_KEY, String(apk.versionCode));
    setApk(null);
  }, [apk]);

  /** The "Check for updates" button. */
  const checkNow = useCallback(async () => {
    if (!isNative) {
      setNotice({ tone: 'info', text: 'The website updates itself when you reload the page.' });
      return;
    }
    if (!navigator.onLine) {
      setNotice({ tone: 'error', text: 'No internet connection, so updates cannot be checked.' });
      return;
    }
    setNotice({ tone: 'busy', text: 'Checking for updates…' });

    // A new APK has to come first — see the note at the top of this file.
    if (await lookForApk()) {
      setNotice(null);
      return;
    }

    const result = await checkForLiveUpdate('manual', { force: true });
    if (result.status === 'ready') setNotice(null); // the dialog takes over
    else if (result.status === 'up-to-date')
      setNotice({ tone: 'ok', text: `You are on the latest version (${result.version}).` });
    else if (result.status === 'needs-apk')
      setNotice({ tone: 'info', text: 'The next update needs a full install. Try again shortly.' });
    else if (result.status === 'paused')
      setNotice({ tone: 'ok', text: 'You are up to date.' });
    else if (result.status === 'offline')
      setNotice({ tone: 'error', text: 'No internet connection, so updates cannot be checked.' });
    else if (result.status === 'error') setNotice({ tone: 'error', text: result.message });
    else setNotice({ tone: 'info', text: 'A check is already running.' });
  }, [lookForApk]);

  const status = useMemo(() => {
    if (!isNative) return 'web';
    if (ota.downloading || apkDownload?.status === 'downloading') return 'downloading';
    if (ota.checking) return 'checking';
    // `dismissed` only hides the dialog; the update is still waiting, so the
    // button stays highlighted and tapping it brings the dialog back.
    if (apk || ota.ready) return 'ready';
    if (!navigator.onLine) return 'offline';
    if (ota.upToDate) return 'up-to-date';
    return 'unknown';
  }, [ota.downloading, ota.checking, ota.ready, ota.upToDate, apk, apkDownload?.status]);

  const onUpdateButton = useCallback(() => {
    if (ota.ready && ota.dismissed) reopenLiveUpdate();
    else checkNow();
  }, [ota.ready, ota.dismissed, checkNow]);

  return {
    ota,
    apk,
    apkDownload,
    apkProgress: apkDownload?.progress || 0,
    status,
    notice,
    clearNotice: () => setNotice(null),
    checkNow,
    onUpdateButton,
    downloadApk,
    skipApk,
    installLiveUpdate,
    postponeLiveUpdate,
    retryApkOpen: () => getDownload(APK_DOWNLOAD_ID),
  };
}
