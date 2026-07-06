import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
    // Expose both Vite-native vars and the NEXT_PUBLIC_* vars created by the
    // PostHog/Vercel integration (it assumes Next.js naming) to the client bundle.
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            manifest: {
                name: 'MoneyWise Pro',
                short_name: 'MoneyWise',
                description: 'Smart requisition & finance management',
                theme_color: '#006AFF',
                background_color: '#EEF5FF',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                icons: [
                    {
                        src: 'icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'icons/icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                maximumFileSizeToCacheInBytes: 6000000
            }
        })
    ],
    resolve: {
        alias: {
            // Resolve the shared workspace package to its TS source so Vite compiles
            // it as ESM (named exports work). The CJS dist/ build is what the API
            // (CommonJS) consumes; the web app (ESM) needs the source.
            shared: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
        },
    },
    server: {
        port: Number(process.env.PORT) || 5173,
        strictPort: true,
        hmr: {
            protocol: 'ws',
            host: 'localhost',
            port: Number(process.env.PORT) || 5173,
        },
    },
})
