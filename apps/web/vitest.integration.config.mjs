import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Live integration suites: real HTTP against the API on :4000 with the dev seed applied.
 *   docker compose up -d && (seed) && npm run test:integration --workspace @hifzoon/web
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Suites share seeded records and the login rate limiter, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
