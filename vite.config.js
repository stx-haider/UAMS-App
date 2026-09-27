import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

const universityLogo = readFileSync(new URL('./src/assets/logo.png', import.meta.url))

const offlineLogoAsset = {
  name: 'offline-university-logo',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'uams-logo.png', source: universityLogo })
  },
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/release/**', '**/release-win/**', '**/build/**'],
    },
  },
  plugins: [
    react(),
    offlineLogoAsset,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'University Attendance System',
        short_name: 'UAS',
        description: 'Offline university attendance management for CR accounts.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f5f8fc',
        theme_color: '#347ff0',
        icons: [
          { src: 'uams-logo.png', sizes: '192x192 512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
})
