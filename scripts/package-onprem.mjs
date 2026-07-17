#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const repoRoot = process.cwd()
const outDir = join(repoRoot, 'out')
const artifactDir = join(repoRoot, 'artifacts')

if (!existsSync(join(outDir, 'index.html'))) {
  console.error('✗ audited on-prem build not found; run npm run build:onprem first')
  process.exit(1)
}

execFileSync('node', ['scripts/audit-onprem-artifact.mjs'], { stdio: 'inherit' })

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
}).trim())
const baseName = `mediprisma-onprem-v${pkg.version}-${commit}`
const archivePath = join(artifactDir, `${baseName}.tar.gz`)
const checksumPath = `${archivePath}.sha256`

mkdirSync(artifactDir, { recursive: true })
writeFileSync(
  join(outDir, 'onprem-manifest.json'),
  `${JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    commit,
    sourceDirty,
    deploymentProfile: 'onprem',
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`,
)

execFileSync('tar', [
  '-czf',
  archivePath,
  'out',
  'deploy/intranet/Caddyfile.example',
  '.env.intranet.example',
  'docs/INTRANET_HTTPS.md',
], { cwd: repoRoot, stdio: 'inherit' })

const hash = createHash('sha256')
await new Promise((resolve, reject) => {
  const stream = createReadStream(archivePath)
  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('end', resolve)
  stream.on('error', reject)
})
const digest = hash.digest('hex')
writeFileSync(checksumPath, `${digest}  ${baseName}.tar.gz\n`)

console.log(`✓ packaged ${archivePath}`)
console.log(`✓ wrote SHA-256 ${checksumPath}`)
