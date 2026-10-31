// Explanation images are downloaded once and kept on the device.
//
// Web: the service worker keeps them (vite.config.js, 'explain-images').
// Phone app: there is no service worker inside the app, so the image is
// fetched once, saved with the Cache API and shown from the saved copy on
// every later view, even offline. Only our own pictures
// (https://easy-pedia.web.app/explain/...) are kept this way; the site sends
// them with CORS and a long cache time (firebase.json).

const CACHE = 'explain-images-v1';
const MAX_ENTRIES = 600;
const shown = new Map(); // url -> object URL, for this session

export function isCacheableImage(url) {
  return typeof url === 'string' && /^https:\/\/easy-pedia\.web\.app\/explain\/[^?#]+$/.test(url);
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ENTRIES; i += 1) await cache.delete(keys[i]);
}

// Resolves to a URL to show: a saved local copy when possible, otherwise the
// original address (so a failure here never hides the image).
export async function cachedImageSrc(url) {
  if (!isCacheableImage(url) || typeof caches === 'undefined') return url;
  if (shown.has(url)) return shown.get(url);
  try {
    const cache = await caches.open(CACHE);
    let res = await cache.match(url);
    if (!res) {
      const net = await fetch(url, { mode: 'cors' });
      if (!net.ok || !(net.headers.get('content-type') || '').startsWith('image/')) return url;
      await cache.put(url, net.clone());
      trim(cache).catch(() => {});
      res = net;
    }
    const local = URL.createObjectURL(await res.blob());
    shown.set(url, local);
    return local;
  } catch {
    return url;
  }
}
