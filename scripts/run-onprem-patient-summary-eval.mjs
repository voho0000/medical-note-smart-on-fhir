import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const tsNodeRegister = path.join(root, 'node_modules', 'ts-node', 'register', 'transpile-only.js')
const tsconfigPathsRegister = path.join(root, 'node_modules', 'tsconfig-paths', 'register.js')
const main = path.join(root, 'scripts', 'experiments', 'onprem-model-eval', 'real-patient-summary.tsx')
const child = spawn(
  process.execPath,
  ['-r', tsNodeRegister, '-r', tsconfigPathsRegister, main, ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      TS_NODE_BASEURL: '.',
      TS_NODE_COMPILER_OPTIONS: JSON.stringify({
        module: 'commonjs',
        moduleResolution: 'node',
        baseUrl: '.',
        rootDir: '.',
        jsx: 'react-jsx',
        ignoreDeprecations: '6.0',
      }),
    },
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Evaluation terminated by ${signal}`)
    process.exitCode = 1
    return
  }
  process.exitCode = code ?? 1
})
