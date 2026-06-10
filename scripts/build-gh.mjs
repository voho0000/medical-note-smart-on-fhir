#!/usr/bin/env node
// Build for GitHub Pages (static export).
//
// Why this script vs a plain `next build`?
//   next.config.ts pins `output: "export"` when GITHUB_PAGES=true, which is
//   fundamentally incompatible with API routes (server-side handlers don't
//   exist on a static file host). Next.js 16 errors out on the first
//   /app/api/* route it sees during the build.
//
// What we do:
//   Temporarily move /app/api/ out of the tree, run `next build`, then
//   restore. The API routes still live in source control and ship to Vercel
//   from the same repo — they just don't get baked into the GH Pages
//   artifact, where they couldn't run anyway.
//
// Idempotent + safe on Ctrl-C: the restore step lives in `finally`, and
// re-running after a stuck stash will detect and recover.
import { execSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()
const API_DIR = join(repoRoot, 'app', 'api')
const STASH_DIR = join(repoRoot, '.api-stash-gh-build')

// Recovery from an interrupted previous run: if the stash dir exists from
// last time, put it back before doing anything else.
if (existsSync(STASH_DIR) && !existsSync(API_DIR)) {
  console.log('• found leftover stash from a previous interrupted build — restoring first')
  renameSync(STASH_DIR, API_DIR)
}

let stashed = false
if (existsSync(API_DIR)) {
  console.log('• stashing app/api/ for static export build')
  renameSync(API_DIR, STASH_DIR)
  stashed = true
}

try {
  execSync('next build', {
    stdio: 'inherit',
    env: { ...process.env, GITHUB_PAGES: 'true' },
  })
} finally {
  if (stashed) {
    console.log('• restoring app/api/')
    renameSync(STASH_DIR, API_DIR)
  }
}
