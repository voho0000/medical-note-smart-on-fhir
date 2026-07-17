#!/usr/bin/env node
// Root-path, air-gapped static export for a hospital HTTPS gateway.
// Static exports cannot contain Next API routes, so temporarily stash app/api
// exactly like the existing GitHub Pages and mediprisma mirror builders.
import { execSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()
const API_DIR = join(repoRoot, 'app', 'api')
const STASH_DIR = join(repoRoot, '.api-stash-intranet-build')

if (existsSync(STASH_DIR) && !existsSync(API_DIR)) {
  console.log('• found leftover intranet-build stash — restoring first')
  renameSync(STASH_DIR, API_DIR)
}

let stashed = false
if (existsSync(API_DIR)) {
  console.log('• stashing app/api/ for intranet static export')
  renameSync(API_DIR, STASH_DIR)
  stashed = true
}

try {
  console.log('• building root-path static export in offline mode')
  execSync('next build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      INTRANET_STATIC_EXPORT: 'true',
      NEXT_PUBLIC_OFFLINE_MODE: '1',
      // Fail closed even if the invoking shell happens to contain cloud URLs.
      NEXT_PUBLIC_CHAT_URL: '',
      NEXT_PUBLIC_WHISPER_URL: '',
      NEXT_PUBLIC_GEMINI_URL: '',
      NEXT_PUBLIC_CLAUDE_URL: '',
      NEXT_PUBLIC_PERPLEXITY_PROXY_URL: '',
      NEXT_PUBLIC_FEEDBACK_URL: '',
      NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY: '',
    },
  })
} finally {
  if (stashed) {
    console.log('• restoring app/api/')
    renameSync(STASH_DIR, API_DIR)
  }
}
