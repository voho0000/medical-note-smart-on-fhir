import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Explicit local integration profile; the dedicated synthetic Gateway must run.
export default defineConfig({ ...base, testMatch: '**/cdss-fhir-history.spec.ts', workers: 1,
  projects: base.projects?.map(project => ({ ...project, name: 'fhir-local' })),
  use: { ...base.use, baseURL: 'http://localhost:3007' },
  webServer: { ...base.webServer, command: 'node node_modules/next/dist/bin/next dev -p 3007',
    url: 'http://localhost:3007', reuseExistingServer: false,
    env: { ...(!Array.isArray(base.webServer) ? base.webServer?.env : {}),
      NEXT_PUBLIC_COLLECTOR_ORIGIN: 'http://127.0.0.1:28787', NEXT_PUBLIC_CDSS_ADMISSION: 'intranet-pilot' } },
})
