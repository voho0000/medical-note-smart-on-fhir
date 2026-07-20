/** @jest-environment node */

// Jest is used only as the repository's already-installed TS/TSX + path-alias
// runner. The experiment stays inert in the normal test suite; opt in with:
//
// RUN_MED_SCOPE_EVAL=1 MED_SCOPE_EVAL_ARGS='--dry-run' \
//   ./node_modules/.bin/jest --runInBand \
//   __tests__/experiments/medication-history-scope-eval.test.tsx

const runExperiment = process.env.RUN_MED_SCOPE_EVAL === '1' ? test : test.skip

runExperiment('runs the medication-history scope experiment', async () => {
  const previousArgv = process.argv
  const previousFetch = global.fetch
  process.argv = [
    previousArgv[0] ?? 'node',
    'medication-history-scope-eval',
    ...(process.env.MED_SCOPE_EVAL_ARGS?.trim().split(/\s+/).filter(Boolean) ?? []),
  ]
  try {
    // __tests__/setup.ts installs an empty fetch mock for ordinary unit tests.
    // This opt-in runner needs the real HTTP client for the explicitly allowed
    // external eval call.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    global.fetch = require('node-fetch') as typeof fetch
    const { main } = await import('../../scripts/experiments/medication-history-scope-eval/main')
    await main()
  } finally {
    process.argv = previousArgv
    global.fetch = previousFetch
  }
}, 20 * 60 * 1000)
