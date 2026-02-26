import {defineConfig, transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    // Transform JSX in .js files before Rollup's parser sees them.
    // CRA allowed JSX in .js files; Vite requires this workaround.
    {
      name: 'treat-js-as-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.match(/src\/.*\.js$/)) return null;
        return transformWithEsbuild(code, id, {
          loader: 'jsx',
          jsx: 'automatic',
        });
      },
    },
    react({
      include: /\.(jsx|js|tsx|ts)$/,
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 3020,
    proxy: {
      '/api': {
        target: 'https://downforacross-com.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
  },
  define: {
    // Bridge: partyParrot.js has 108 occurrences of process.env.PUBLIC_URL
    'process.env.PUBLIC_URL': JSON.stringify(''),
  },
});
