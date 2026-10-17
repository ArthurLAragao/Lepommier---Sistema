import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
