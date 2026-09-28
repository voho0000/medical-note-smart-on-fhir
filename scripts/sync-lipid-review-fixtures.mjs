// Copy only the explicitly synthetic lipid fixture set from a rules checkout.
// Usage: node scripts/sync-lipid-review-fixtures.mjs /path/to/rules-worktree
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = process.argv[2]
if (!root) throw new Error('Provide the rules checkout containing __tests__/fixtures/lipid-nhi')
const source = resolve(root, '__tests__/fixtures/lipid-nhi')
const manifestText = readFileSync(resolve(source, 'scenarios.json'), 'utf8')
const manifest = JSON.parse(manifestText)
const digest = createHash('sha256').update(manifestText)
const cases = manifest.cases.map(item => {
  if (!/^[a-z0-9-]+$/.test(item.id)) throw new Error('Unexpected synthetic fixture id')
  const inputText = readFileSync(resolve(source, 'profiles', `${item.id}.profile-input.json`), 'utf8')
  const profileInput = JSON.parse(inputText)
  if (!profileInput.patient?.identifier?.some(entry => entry.value?.startsWith('SYNTH-LIPID-'))) {
    throw new Error('Only explicitly synthetic lipid patients may enter this development fixture')
  }
  digest.update(inputText)
  return { ...item, profileInput }
})
const output = fileURLToPath(new URL('../app/dev-nhi-table1/pipeline/patients.json', import.meta.url))
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({
  synthetic: true,
  source: 'rules/__tests__/fixtures/lipid-nhi (real medcloud bridge conversion)',
  sourceSha256: digest.digest('hex'),
  fixedNow: manifest.fixedNow,
  cases,
}, null, 2)}\n`)
console.log(`Synced ${cases.length} fully synthetic lipid patients.`)
