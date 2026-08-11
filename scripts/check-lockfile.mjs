/**
 * Guards package-lock.json against npm's platform pruning.
 *
 * Running `npm install` on macOS rewrites the lockfile from the tree npm just
 * built, and that tree has no place for optional entries this platform cannot
 * install: `@emnapi/*` (wasm32-wasi), `react-native`, and anything else marked
 * optional whose platform does not match. They vanish from the lockfile. Linux
 * CI then runs `npm ci`, needs them, and fails — a two-line version bump turns
 * into a 137-line diff and a red build.
 *
 * No npm flag keeps them, so the repair is mechanical: compare the working
 * lockfile with the last committed one and put back what npm dropped.
 *
 * Only *optional* entries are restored, and only while something in the new
 * lockfile still depends on them. Removing a dependency on purpose therefore
 * stays possible: its entries are not optional, or nothing references them any
 * more, and either way they are reported rather than resurrected.
 *
 *   node scripts/check-lockfile.mjs                 # report, exit 1 on pruning
 *   node scripts/check-lockfile.mjs --fix           # restore and rewrite
 *   node scripts/check-lockfile.mjs --against <ref> # compare with another ref
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const LOCKFILE = 'package-lock.json'

const args = process.argv.slice(2)
const fix = args.includes('--fix')
const quiet = args.includes('--quiet')
const againstIndex = args.indexOf('--against')
const ref = againstIndex === -1 ? 'HEAD' : args[againstIndex + 1]

if (!ref) {
  console.error('check-lockfile: --against needs a git ref')
  process.exit(2)
}

let baseline
try {
  baseline = JSON.parse(execFileSync('git', ['show', `${ref}:${LOCKFILE}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }))
} catch {
  // Nothing committed to compare against: an unborn branch, or a CI checkout
  // shallow enough to lack the ref. Failing here would block work for a reason
  // that has nothing to do with npm.
  if (!quiet) console.log(`check-lockfile: no ${LOCKFILE} at ${ref}, nothing to compare`)
  process.exit(0)
}

const current = JSON.parse(readFileSync(LOCKFILE, 'utf8'))
const currentPackages = current.packages ?? {}
const baselinePackages = baseline.packages ?? {}

/** `node_modules/a/node_modules/@scope/b` → `@scope/b`. */
function packageName(key) {
  const at = key.lastIndexOf('node_modules/')
  return at === -1 ? key : key.slice(at + 'node_modules/'.length)
}

/** The entry this one is nested inside, or '' for a top-level one. */
function parentKey(key) {
  const at = key.lastIndexOf('/node_modules/')
  return at === -1 ? '' : key.slice(0, at)
}

const referencedNow = new Set()
for (const entry of Object.values(currentPackages)) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(entry?.[field] ?? {})) referencedNow.add(name)
  }
}

// npm also drops the platform *fields* of entries it keeps — `libc` on the
// lightningcss musl/glibc builds, `os` and `cpu` elsewhere. macOS cannot know
// them, so a rewrite here is a loss rather than a recomputation, and they are
// restored on any entry that still resolves to the same tarball. `dev` and
// `peer` are deliberately left alone: those describe the dependency graph,
// which npm did just compute.
const PLATFORM_FIELDS = ['os', 'cpu', 'libc']
const fieldLosses = []
for (const [key, entry] of Object.entries(currentPackages)) {
  const before = baselinePackages[key]
  if (!before || before.resolved !== entry.resolved || before.version !== entry.version) continue
  for (const field of PLATFORM_FIELDS) {
    if (before[field] !== undefined && entry[field] === undefined) fieldLosses.push({ key, field })
  }
}

const missing = Object.keys(baselinePackages).filter((key) => currentPackages[key] === undefined)

const pruned = []
const removed = []
for (const key of missing) {
  const entry = baselinePackages[key]
  const platformSpecific = entry?.optional === true || entry?.os !== undefined || entry?.cpu !== undefined
  const parent = parentKey(key)
  const stillReachable = (parent === '' || currentPackages[parent] !== undefined)
    && referencedNow.has(packageName(key))
  if (platformSpecific && stillReachable) pruned.push(key)
  else removed.push(key)
}

if (removed.length > 0 && !quiet) {
  console.log(`check-lockfile: ${removed.length} entr${removed.length === 1 ? 'y is' : 'ies are'} gone and nothing references ${removed.length === 1 ? 'it' : 'them'} — treated as an intentional removal`)
  for (const key of removed) console.log(`  - ${key}`)
}

if (pruned.length === 0 && fieldLosses.length === 0) {
  if (!quiet) console.log(`check-lockfile: ${LOCKFILE} keeps every platform entry and field from ${ref}`)
  process.exit(0)
}

if (!fix) {
  console.error(`\ncheck-lockfile: ${LOCKFILE} lost platform information that Linux CI needs.`)
  if (pruned.length > 0) {
    console.error(`\n${pruned.length} optional entr${pruned.length === 1 ? 'y' : 'ies'} present at ${ref} ${pruned.length === 1 ? 'is' : 'are'} gone:`)
    for (const key of pruned) console.error(`  - ${key}`)
  }
  if (fieldLosses.length > 0) {
    console.error(`\n${fieldLosses.length} platform field${fieldLosses.length === 1 ? '' : 's'} dropped from entries that did not change:`)
    for (const loss of fieldLosses) console.error(`  - ${loss.key} (${loss.field})`)
  }
  console.error('\nThis is npm rewriting the lockfile for this platform. Restore with:\n\n  npm run fix:lockfile\n')
  process.exit(1)
}

const packages = {}
// Committed order first, so the diff stays readable and the file does not churn.
for (const key of Object.keys(baselinePackages)) {
  const entry = currentPackages[key] ?? (pruned.includes(key) ? baselinePackages[key] : undefined)
  if (entry !== undefined) packages[key] = entry
}
for (const [key, entry] of Object.entries(currentPackages)) {
  if (packages[key] === undefined) packages[key] = entry
}
for (const { key, field } of fieldLosses) {
  packages[key] = { ...packages[key], [field]: baselinePackages[key][field] }
}

writeFileSync(LOCKFILE, `${JSON.stringify({ ...current, packages }, null, 2)}\n`)
if (pruned.length > 0) {
  console.log(`check-lockfile: restored ${pruned.length} pruned entr${pruned.length === 1 ? 'y' : 'ies'}`)
  for (const key of pruned) console.log(`  + ${key}`)
}
if (fieldLosses.length > 0) {
  console.log(`check-lockfile: restored ${fieldLosses.length} platform field${fieldLosses.length === 1 ? '' : 's'}`)
  for (const loss of fieldLosses) console.log(`  + ${loss.key} (${loss.field})`)
}
