import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Polyfill Node built-ins for the Circle Web SDK (which pulls in
    // jsonwebtoken → jws → safe-buffer / util / stream). Without this,
    // util.inherits / Buffer.from / etc. are undefined in the browser and
    // the whole bundle crashes before React mounts.
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'crypto', 'events'],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  server: {
    allowedHosts: [
      "0651-192-157-93-74.ngrok-free.app",
      "localhost",
      "127.0.0.1"
    ]
  }
})
