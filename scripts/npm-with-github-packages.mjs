import { execFileSync, spawnSync } from 'node:child_process'

const npmArgs = process.argv.slice(2)

if (npmArgs.length === 0) {
  console.error('Usage: node scripts/npm-with-github-packages.mjs <npm arguments>')
  process.exit(2)
}

let githubToken = ''

try {
  githubToken = execFileSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  console.error(
    'GitHub login is required. Run `gh auth login -h github.com`, then try again.',
  )
  process.exit(1)
}

if (!githubToken) {
  console.error(
    'No GitHub token was found. Run `gh auth login -h github.com`, then try again.',
  )
  process.exit(1)
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npmCommand, npmArgs, {
  env: {
    ...process.env,
    NODE_AUTH_TOKEN: githubToken,
  },
  stdio: 'inherit',
})

githubToken = ''

if (result.error) {
  console.error(`Unable to run npm: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
