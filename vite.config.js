import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (same as the IMCI app): the user decides when to reload, so a
      // quiz in progress is never interrupted by an automatic update.
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'img/logo.png', 'fonts/bold.ttf'],
      manifest: {
        name: 'Easy Pedia MCQs',
        short_name: 'Easy Pedia',
        description: 'Pediatric MCQs made by a pediatrician for pediatricians',
        theme_color: '#1976D2',
        background_color: '#E3F2FD',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // PAGES COME FROM THE SERVER FIRST, like an ordinary website.
        // navigateFallback used to answer every page load with the index.html
        // saved at install time, so opening a link after a release showed the
        // previous version until a second refresh. Now the page is fetched from
        // the network; the saved copy is used only offline or when the network
        // takes longer than a few seconds (runtimeCaching below).
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        // firebase-messaging-sw.js is a service worker of its own, registered
        // by Firebase for background push. Precaching it would make this
        // worker serve a frozen copy from the cache, so changes to it would
        // only reach browsers when the PWA worker itself happens to update.
        globIgnores: ['firebase-messaging-sw.js'],
        runtimeCaching: [
          {
            // Page loads. The APK download, the update manifest and Firebase's
            // own /__/ paths always go straight to the network.
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              ![/\.apk$/, /\.json$/, /^\/__\//].some((re) => re.test(url.pathname)),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 40 },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  // Offline and never opened before: the app shell saved at install.
                  handlerDidError: async () =>
                    (await caches.match('/index.html', { ignoreSearch: true })) || Response.error(),
                },
              ],
            },
          },
          {
            // Explanation pictures served by the site (/explain/...): download
            // once, then always from the device.
            urlPattern: ({ url }) => url.pathname.startsWith('/explain/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'explain-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Quiz covers / explanation images from Firebase Storage.
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'storage-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    // The version number users SEE. CI gives every build its own version
    // (above), which the update system needs; showing that number made it
    // change after every small over-the-air update. This one changes only when
    // "releaseVersion" in package.json is raised by hand for a big release.
    'import.meta.env.VITE_RELEASE_VERSION': JSON.stringify(pkg.releaseVersion || pkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/database', 'firebase/storage'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
