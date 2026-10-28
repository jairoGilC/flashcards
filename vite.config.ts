/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the build works from any static host path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '言葉デッキ Kotoba Deck',
        short_name: 'Kotoba',
        description: 'Repaso espaciado de japonés, offline.',
        lang: 'es',
        theme_color: '#161129',
        background_color: '#161129',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // wasm: sql.js for offline .apkg import.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            // The stylesheet comes back opaque (no CORS), so status 0 must be cacheable too.
            options: { cacheName: 'google-fonts', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
