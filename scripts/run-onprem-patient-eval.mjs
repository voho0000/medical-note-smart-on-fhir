import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsNodeRegister = path.join(root, 'node_modules', 'ts-node', 'register', 'transpile-only.js')
const tsconfigPathsRegister = path.join(root, 'node_modules', 'tsconfig-paths', 'register.js')
const main = path.join(root, 'scripts', 'experiments', 'onprem-model-eval', 'real-patient-chat.ts')
const result = spawnSync(process.execPath, [
  '-r',
  tsNodeRegister,
  '-r',
  tsconfigPathsRegister,
  main,
  ...process.argv.slice(2),
], {
  cwd: root,
  env: {
    ...process.env,
    TS_NODE_BASEURL: '.',
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({
      module: 'commonjs',
      moduleResolution: 'node',
      baseUrl: '.',
      rootDir: '.',
      ignoreDeprecations: '6.0',
    }),
  },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
