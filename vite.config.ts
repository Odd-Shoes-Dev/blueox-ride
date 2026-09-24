import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BlueOx Rides',
        short_name: 'BlueOx',
        description: 'Share rides, save money, travel together across Uganda',
        theme_color: '#193153', // brand navy — same as the theme-color meta tag in index.html
        background_color: '#f9fafc', // matches the app's light background (splash screen colour)
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/assets/favicon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // vite-plugin-pwa separately, always precaches every file in manifest.icons above (with
        // no revision — it treats the web-app-manifest reference as already stable), and
        // globPatterns matches those same two .png files again on its own (with a real content
        // hash) since nothing tells it they're already covered. Workbox refuses to precache a
        // URL registered twice with two different revisions ("add-to-cache-list-conflicting-
        // entries"), which broke the service worker outright. Excluding them from the glob here
        // doesn't drop them from the precache — the manifest.icons path already guarantees that —
        // it just stops the second, redundant registration.
        globIgnores: ['assets/favicon.png', 'assets/logo.png'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/zwuoewhxqndmutbfyzka\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Optimize for low-end devices
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
})
