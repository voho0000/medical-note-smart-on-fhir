import { spawn } from 'node:child_process'
const packs = new Set((process.env.NEXT_PUBLIC_HMC_DEV_EXTRA_PACKS ?? '').split(',').filter(Boolean))
packs.add('atrial-fibrillation-cdss')
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', '3001'], { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_HMC_DEV_EXTRA_PACKS: [...packs].join(',') } })
child.on('exit', code => process.exit(code ?? 0))
