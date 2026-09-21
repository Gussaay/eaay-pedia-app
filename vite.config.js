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
        navigateFallback: '/index.html',
        // Let the APK download and the update manifest reach the network.
        navigateFallbackDenylist: [/\.apk$/, /\.json$/, /^\/__\//],
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
