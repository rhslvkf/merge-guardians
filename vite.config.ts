import { defineConfig } from 'vite';

// Portal builds (Poki / CrazyGames) are uploaded as a zip and served from an
// arbitrary sub-path, so every asset URL must stay relative.
export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  define: {
    // Rule 9: DEBUG-wrapped logging must vanish from production builds.
    __DEBUG__: JSON.stringify(mode !== 'production'),
  },
}));
