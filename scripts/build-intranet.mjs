#!/usr/bin/env node
// Root-path, air-gapped static export for a hospital HTTPS gateway.
// Static exports cannot contain Next API routes, so temporarily stash app/api
// exactly like the existing GitHub Pages and mediprisma mirror builders.
import { execSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnvFile } from 'node:process'

const repoRoot = process.cwd()
const API_DIR = join(repoRoot, 'app', 'api')
const STASH_DIR = join(repoRoot, '.api-stash-intranet-build')
const ENV_FILE = join(repoRoot, '.env.intranet')

if (existsSync(ENV_FILE)) {
  console.log('• loading .env.intranet')
  loadEnvFile(ENV_FILE)
}

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
  console.log('• building root-path static export with onprem profile')
  execSync('next build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      INTRANET_STATIC_EXPORT: 'true',
      NEXT_PUBLIC_DEPLOYMENT_PROFILE: 'onprem',
      NEXT_PUBLIC_OFFLINE_MODE: '1',
      // Fail closed even if the invoking shell happens to contain cloud URLs.
      NEXT_PUBLIC_CHAT_URL: '',
      NEXT_PUBLIC_WHISPER_URL: '',
      NEXT_PUBLIC_GEMINI_URL: '',
      NEXT_PUBLIC_CLAUDE_URL: '',
      NEXT_PUBLIC_OPENAI_COMPATIBLE_GATEWAY_URL: '',
      NEXT_PUBLIC_PERPLEXITY_PROXY_URL: '',
      NEXT_PUBLIC_FEEDBACK_URL: '',
      NEXT_PUBLIC_PROXY_KEY: '',
      NEXT_PUBLIC_APPCHECK_RECAPTCHA_SITE_KEY: '',
      NEXT_PUBLIC_APPCHECK_DEBUG: '',
      NEXT_PUBLIC_FIREBASE_API_KEY: '',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: '',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: '',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '',
      NEXT_PUBLIC_FIREBASE_APP_ID: '',
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: '',
      NEXT_PUBLIC_FIREBASE_EMULATOR: '',
    },
  })
  execSync('node scripts/sanitize-onprem-artifact.mjs', { stdio: 'inherit' })
  execSync('node scripts/audit-onprem-artifact.mjs', { stdio: 'inherit' })
} finally {
  if (stashed) {
    console.log('• restoring app/api/')
    renameSync(STASH_DIR, API_DIR)
  }
}
