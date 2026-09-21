// One hook for the three ways this app can update itself:
//
//   web    the service worker has a new build waiting -> reload.
//   live   a new web bundle downloaded over the air -> restart the WebView.
//          This is the usual case and costs the user a few hundred KB.
//   apk    the native shell itself changed (new plugin, new permission), so a
//          real install is required. Only this one needs a full download.
//
// "apk" always wins over "live": an over-the-air bundle that expects a plugin
// the installed APK does not have would crash on launch, so when both are
// pending the user is asked for the APK first.
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
import { APK_URL } from '../config';

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
      const mandatory =
        nativeConfig?.mandatory === true || nativeConfig?.mandatory === 'true';
      if (nativeConfig?.hidden === true || nativeConfig?.hidden === 'true') {
        setApk(null);
        return null;
      }
      // "Not now" survives a restart, so the same build stops nagging. A
      // required update ignores it.
      if (!mandatory && localStorage.getItem(SKIPPED_BUILD_KEY) === String(published.versionCode)) {
        setApk(null);
        return null;
      }
      const info = {
        version: published.version,
        versionCode: published.versionCode,
        notes: nativeConfig?.message || published.notes,
        size: published.size,
        url: published.apkUrl || APK_URL,
        mandatory,
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
