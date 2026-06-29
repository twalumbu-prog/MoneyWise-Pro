import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate admin SPA (Financial Reconciliation Engine). Runs on its own port so it
// can be served alongside apps/web during local dev.
export default defineConfig({
    envPrefix: ['VITE_'],
    plugins: [react()],
    server: {
        port: 5174,
        strictPort: true,
    },
})
