// Builds public/terminology/icd10cm-to-icd9cm-gem-2018.json from the public
// CMS files (U.S. government works, no copyright):
//   2018 ICD-10-CM General Equivalence Mappings  -> 2018_I10gem.txt
//   ICD-9-CM v32 master descriptions             -> CMS32_DESC_LONG_DX.txt
// Download:
//   https://www.cms.gov/Medicare/Coding/ICD10/Downloads/2018-ICD-10-CM-General-Equivalence-Mappings.zip
//   https://www.cms.gov/Medicare/Coding/ICD9ProviderDiagnosticCodes/Downloads/ICD-9-CM-v32-master-descriptions.zip
// Usage: node scripts/build-icd9-crosswalk.mjs <dir containing both txt files>
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) throw Error('Usage: node scripts/build-icd9-crosswalk.mjs <cms-files-dir>')
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const map = {}
for (const line of readFileSync(join(source, '2018_I10gem.txt'), 'utf8').split(/\r?\n/)) {
  const [from, to] = line.trim().split(/\s+/)
  if (!from || !to || to === 'NoDx') continue
  const targets = (map[from] ??= [])
  if (!targets.includes(to)) targets.push(to)
}

const used = new Set(Object.values(map).flat())
const names = {}
for (const line of readFileSync(join(source, 'CMS32_DESC_LONG_DX.txt'), 'latin1').split(/\r?\n/)) {
  const match = /^(\S+)\s+(.+)$/.exec(line.trim())
  if (match && used.has(match[1])) names[match[1]] = match[2].trim()
}

const output = {
  source: 'CMS 2018 ICD-10-CM to ICD-9-CM General Equivalence Mapping; ICD-9-CM v32 long descriptions',
  // Codes are stored without the decimal point, exactly as in the CMS files.
  map,
  names,
}
const file = join(repoRoot, 'public', 'terminology', 'icd10cm-to-icd9cm-gem-2018.json')
writeFileSync(file, JSON.stringify(output))
console.log(JSON.stringify({ icd10Codes: Object.keys(map).length, icd9Codes: Object.keys(names).length, bytes: JSON.stringify(output).length }))
