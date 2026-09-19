// Platform helpers: one API for web and the Capacitor (Android/iOS) app.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const isNative = Capacitor.isNativePlatform();

/** Opens an external link (WhatsApp, Telegram, mailto, APK url...). */
export async function openUrl(url) {
  if (!url) return;
  if (isNative && /^https?:/i.test(url)) {
    await Browser.open({ url });
  } else if (/^(mailto|tel):/i.test(url)) {
    window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Shares a PNG data URL (result card / performance card). */
export async function shareImage(dataUrl, fileName, text) {
  if (isNative) {
    const base64 = dataUrl.split(',')[1];
    const saved = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ title: 'Easy Pedia MCQs', text, files: [saved.uri] });
    return;
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text, title: 'Easy Pedia MCQs' });
    return;
  }
  // Desktop fallback: download the image.
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

/** Shares the app itself (Android shared its own APK). */
export async function shareApp() {
  const url = isNative
    ? 'https://play.google.com/store/apps/details?id=com.easy.pediamcqs'
    : window.location.origin;
  const text = 'Easy Pedia MCQs - pediatric MCQs made by a pediatrician for pediatricians';
  try {
    if (isNative) await Share.share({ title: 'Easy Pedia MCQs', text, url });
    else if (navigator.share) await navigator.share({ title: 'Easy Pedia MCQs', text, url });
    else {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard');
    }
  } catch {
    /* user cancelled */
  }
}
