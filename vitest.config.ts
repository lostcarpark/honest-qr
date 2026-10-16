import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // On GitHub, failures also appear as annotations on the changed lines.
      reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
        reporter: ['text', 'html'],
        reportsDirectory: './reports/coverage',
        thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  }),
)
