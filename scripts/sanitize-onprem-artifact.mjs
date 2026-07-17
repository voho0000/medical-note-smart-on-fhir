#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

const artifactRoot = join(process.cwd(), 'out', '_next', 'static')

if (!existsSync(artifactRoot)) {
  console.error('✗ on-prem artifact not found at out/_next/static')
  process.exit(1)
}

// Some provider SDKs embed a public default even when every production call
// supplies an explicit hospital baseURL. Rewrite those dormant defaults so a
// future accidental SDK call also fails locally instead of creating egress.
const replacements = new Map([
  ['https://api.openai.com', '/__onprem_disabled__/openai'],
  ['https://generativelanguage.googleapis.com', '/__onprem_disabled__/gemini'],
  ['https://api.anthropic.com', '/__onprem_disabled__/anthropic'],
  ['https://api.perplexity.ai', '/__onprem_disabled__/perplexity'],
])

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

let replacementCount = 0
for (const path of filesUnder(artifactRoot)) {
  if (!['.js', '.css', '.json', '.html'].includes(extname(path))) continue
  const original = readFileSync(path, 'utf8')
  let sanitized = original
  for (const [publicOrigin, disabledPath] of replacements) {
    const matches = sanitized.split(publicOrigin).length - 1
    if (matches > 0) {
      replacementCount += matches
      sanitized = sanitized.split(publicOrigin).join(disabledPath)
    }
  }
  if (sanitized !== original) writeFileSync(path, sanitized)
}

console.log(`✓ sanitized ${replacementCount} public AI SDK default(s) in on-prem artifact`)
