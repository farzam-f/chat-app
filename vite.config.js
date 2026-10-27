import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'F.L.W Messenger',
        short_name: 'F.L.W',
        description: 'پیام‌رسان سریع، امن و بدون تحریم',
        theme_color: '#17212b',
        background_color: '#0e1621',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/chat-app/',
        icons: [
          {
            src: '/chat-app/pwa-192x192.png', // مسیر مطلق برای گیت‌هاب
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/chat-app/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: '/chat-app/'
})