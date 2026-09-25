import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            // Silently handle offline backend without logging ECONNREFUSED spam
            if (!res.headersSent && res.writeHead) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'offline_fallback', data: [] }));
            }
          });
        }
      },
      '/public': {
        target: 'https://cloudwatch.greymatter.greyorange.com',
        changeOrigin: true,
        secure: false
      },
      '/avatar': {
        target: 'https://cloudwatch.greymatter.greyorange.com',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
