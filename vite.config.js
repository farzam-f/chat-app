import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'F.L.W Messenger',
        short_name: 'F.L.W',
        description: 'پیام‌رسان F.L.W',
        theme_color: '#17212b',
        background_color: '#0e1621',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png', // بدون اسلش اول
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png', // بدون اسلش اول
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  base: '/chat-app/'
})