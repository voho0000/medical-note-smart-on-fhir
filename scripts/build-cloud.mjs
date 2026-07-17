#!/usr/bin/env node
import { execSync } from 'node:child_process'

console.log('• building cloud deployment profile')
execSync('next build --turbopack', {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_DEPLOYMENT_PROFILE: 'cloud',
    NEXT_PUBLIC_OFFLINE_MODE: '0',
  },
})
