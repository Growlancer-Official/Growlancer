import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/**/*.test.ts', 'src/test/**/*.test.tsx'],
    // `forks` (the default) hangs on some Windows setups — the worker never
    // responds and the whole run times out. `threads` is reliable everywhere.
    pool: 'threads',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/config.ts',
        'src/lib/sellerLevels.ts',
        'src/lib/subscriptionHelpers.ts',
        'src/lib/services/authService.ts',
        'src/lib/workflowService.ts',
        'src/lib/dataService.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@types': path.resolve(__dirname, './src/types'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
    },
  },
});
