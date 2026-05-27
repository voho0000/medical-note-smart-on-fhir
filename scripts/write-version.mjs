// Regenerate public/version.json from package.json.
//
// Wired into the `version` npm-script hook so `npm version <bump>` keeps
// version.json in lock-step with package.json automatically. Also runnable
// on its own when needed (e.g. CI sanity check).
//
// Why a runtime JSON file instead of build-time env inlining: env vars
// baked into the client bundle don't hot-reload when package.json changes
// while `next dev` is running. Public files do (Next serves them fresh on
// every request), so the header version chip stays in sync without needing
// the user to restart their dev server.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const out = join(repoRoot, 'public', 'version.json')

const payload = { version: pkg.version }
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8')

console.log(`✓ wrote public/version.json — { version: "${pkg.version}" }`)
