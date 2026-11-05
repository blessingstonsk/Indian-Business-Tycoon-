import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.VITE_APP_BASE_PATH || '/',
    plugins: [react()],
    resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            motion: ['framer-motion'],
          },
        },
      },
    },
  };
});
