/** Seal a verified HTN source checkout into this isolated app branch. No publish. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/sync-htn-packages.mjs /path/to/mediprisma-personalization')
const cwd = process.cwd()
const sourceRoot = resolve(source)
execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'packages/personalized-care', 'packages/personalized-care-fhir'], { cwd: sourceRoot })
const destination = resolve(cwd, 'vendor/htn')
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
mkdirSync(destination, { recursive: true })
const provenance = {
  sourceRepository: 'https://github.com/voho0000/mediprisma-personalization',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
  packages: [],
}
for (const name of ['personalized-care', 'personalized-care-fhir']) {
  const spec = JSON.parse(readFileSync(resolve(sourceRoot, 'packages', name, 'package.json'), 'utf8'))
  if (!spec.version.includes('-htn.')) throw new Error(`${spec.name} must use an HTN prerelease version`)
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--workspace', spec.name, '--ignore-scripts', '--json', '--pack-destination', destination], { cwd: sourceRoot, encoding: 'utf8' }))
  const file = relative(cwd, resolve(destination, packed.filename))
  const reference = `file:${file}`
  const integrity = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`
  if (integrity !== packed.integrity) throw new Error(`Integrity mismatch: ${file}`)
  manifest.dependencies[spec.name] = reference
  lock.packages[''].dependencies[spec.name] = reference
  Object.assign(lock.packages[`node_modules/${spec.name}`], {
    version: spec.version, resolved: reference, integrity, dependencies: spec.dependencies,
  })
  provenance.packages.push({ name: spec.name, version: spec.version, file, integrity })
}
writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\n')
writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n')
writeFileSync(resolve(destination, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
execFileSync('node', ['scripts/check-lockfile.mjs'], { stdio: 'inherit' })
console.log(`Bundled ${provenance.packages.length} HTN prereleases from ${provenance.sourceCommit}.`)
