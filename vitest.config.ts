import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/**/*.ts',
        'src/infrastructure/gateways/RealGatewayRuntime.js',
        'src/infrastructure/gateways/runtime/*.js',
        'src/presentation/pages/javascript/logique-interface.js',
        'src/main/securite.js',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        'src/infrastructure/gateways/AuthGateway.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
