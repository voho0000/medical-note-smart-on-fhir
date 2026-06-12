// Jest Configuration
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  // Without this, stale copies under .claude/worktrees/ get picked up and fail the run
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/out/', '/coverage/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'features/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!**/dist/**',
  ],
  // Ratchet: floors sit just below current coverage (~25% lines, 2026-06) so the
  // gate fails on regressions; raise them as coverage grows toward the 70% goal.
  coverageThreshold: {
    global: {
      branches: 18,
      functions: 21,
      lines: 23,
      statements: 23,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
