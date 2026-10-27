import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `@/` = src/ (también en tsconfig.json y vite.config.ts)
  resolve: { alias: { '@': '/src' } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    globals: false,
  },
});
