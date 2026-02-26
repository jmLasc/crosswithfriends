import {defineConfig} from 'vitest/config';
import {transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    // Transform JSX in .js files before Vite's parser sees them
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
  define: {
    'process.env.PUBLIC_URL': JSON.stringify(''),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'server', 'e2e'],
  },
});
