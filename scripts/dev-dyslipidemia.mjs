/** Review the matched app/rules branches without publishing a package.
 * Usage: npm run dev:lipid -- /absolute/path/to/personalization [--prepare-only]
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceArg = process.argv.slice(2).find(arg => !arg.startsWith('--')) || process.env.PERSONALIZATION_SOURCE
if (!sourceArg) throw new Error('Pass the matching mediprisma-personalization source directory.')
const source = realpathSync(resolve(sourceArg))
const modules = resolve(root, 'node_modules')
if (!existsSync(modules) || lstatSync(modules).isSymbolicLink()) throw new Error('Use a dedicated node_modules directory in this app worktree.')
const scope = resolve(modules, '@voho0000')
if (existsSync(scope) && lstatSync(scope).isSymbolicLink()) throw new Error('The @voho0000 scope must belong to this worktree.')
const build = spawnSync('npm', ['run', 'build'], { cwd: source, stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status || 1)
const names = ['clinical-lab-normalization', 'personalization-sdk', 'personalized-care', 'personalized-care-fhir']
const bundled = readFileSync(resolve(source, 'packages/personalized-care/dist/guideline-packs/bundled.js'), 'utf8')
if (!bundled.includes('hyperlipidemia-pack') || !bundled.includes('heart-failure-pack')) throw new Error('The source must contain both HF and the dyslipidemia review pack.')
mkdirSync(scope, { recursive: true })
for (const name of names) {
  const from = resolve(source, 'packages', name)
  const manifest = JSON.parse(readFileSync(resolve(from, 'package.json'), 'utf8'))
  if (manifest.name !== `@voho0000/${name}`) throw new Error(`Unexpected package: ${name}`)
  const target = resolve(scope, name)
  const staged = resolve(scope, `.lipid-${name}`)
  rmSync(staged, { recursive: true, force: true })
  mkdirSync(staged)
  cpSync(resolve(from, 'package.json'), resolve(staged, 'package.json'))
  cpSync(resolve(from, 'dist'), resolve(staged, 'dist'), { recursive: true })
  // Unlink an old overlay; never follow it into another worktree.
  try {
    if (lstatSync(target).isSymbolicLink()) unlinkSync(target)
    else rmSync(target, { recursive: true })
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  renameSync(staged, target)
}
console.log('Installed the matching local HF + dyslipidemia build in this worktree only.')
if (!process.argv.includes('--prepare-only')) {
  const child = spawn(process.execPath, [resolve(modules, 'next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '-p', process.env.PORT || '3017'], { cwd: root, stdio: 'inherit' })
  child.on('exit', code => process.exit(code || 0))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
}
