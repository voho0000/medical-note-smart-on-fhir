#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const artifactRoot = join(process.cwd(), 'out', '_next', 'static')

if (!existsSync(artifactRoot)) {
  console.error('✗ on-prem artifact not found at out/_next/static')
  process.exit(1)
}

const forbidden = [
  { label: 'Firebase SDK', pattern: /@firebase|firebase\/(?:app|auth|firestore|app-check)/i },
  { label: 'Firebase service endpoint', pattern: /firebaseio\.com|firebaseapp\.com|identitytoolkit|securetoken\.googleapis|firestore\.googleapis/i },
  { label: 'Firebase public configuration', pattern: /NEXT_PUBLIC_FIREBASE_(?:API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID)/i },
  { label: 'Google Identity', pattern: /accounts\.google\.com|gsi\/client/i },
  { label: 'Public SMART sandbox', pattern: /launch\.smarthealthit\.org/i },
  { label: 'OpenAI public API', pattern: /api\.openai\.com/i },
  { label: 'Gemini public API', pattern: /generativelanguage\.googleapis\.com/i },
  { label: 'Anthropic public API', pattern: /api\.anthropic\.com/i },
  { label: 'Perplexity public API', pattern: /api\.perplexity\.ai/i },
]

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const findings = []
for (const path of filesUnder(artifactRoot)) {
  if (!['.js', '.css', '.json', '.html'].includes(extname(path))) continue
  const content = readFileSync(path, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      findings.push(`${rule.label}: ${relative(process.cwd(), path)}`)
    }
  }
}

if (findings.length > 0) {
  console.error('✗ on-prem artifact contains forbidden cloud dependencies:')
  for (const finding of findings) console.error(`  - ${finding}`)
  process.exit(1)
}

console.log('✓ on-prem artifact contains no forbidden Firebase/public-AI endpoints')
