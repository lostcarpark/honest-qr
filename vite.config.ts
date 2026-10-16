import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so ddev-router can reach the dev server.
    host: '0.0.0.0',
    port: 5173,
    // Fail rather than silently moving to a port DDEV doesn't expose.
    strictPort: true,
    allowedHosts: ['.ddev.site'],
    origin: process.env.DDEV_PRIMARY_URL ? `${process.env.DDEV_PRIMARY_URL}:5173` : undefined,
  },
})
