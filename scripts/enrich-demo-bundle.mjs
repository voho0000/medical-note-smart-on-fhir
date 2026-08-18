// Precompute the App-side NHI drug terminology for the committed demo Bundle.
// Real/local imports still use the browser enrichment path. The demo is fixed
// release data, so shipping its MedicationKnowledge avoids downloading and
// parsing the 12 MB terminology snapshot on the first patient render.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '..')
const DEMO_PATH = path.join(ROOT, 'public/demo/demo-bundle.json')
const RECORDED_AT = '2026-07-28T00:00:00.000Z'

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': ROOT },
})
const { enrichBundleWithNhiDrugTerminology } = await jiti.import(
  '../src/infrastructure/fhir/services/nhi-drug-terminology-enrichment.service.ts',
)

const bundle = JSON.parse(fs.readFileSync(DEMO_PATH, 'utf8'))
const result = await enrichBundleWithNhiDrugTerminology(bundle, {
  recordedAt: RECORDED_AT,
})

if (result.report.status === 'unavailable') {
  throw new Error('Demo terminology enrichment was unavailable; refusing to publish a runtime-migrating demo Bundle.')
}
if (result.report.eligibleRequestCount > 0 && result.report.linkedRequestCount === 0) {
  throw new Error('Demo has eligible NHI prescriptions but no terminology links were produced.')
}

fs.writeFileSync(DEMO_PATH, JSON.stringify(result.bundle))
const sizeMB = (fs.statSync(DEMO_PATH).size / 1024 / 1024).toFixed(2)
console.log(
  `✅ demo terminology precomputed: ${result.report.linkedRequestCount} prescriptions, ` +
  `${result.report.knowledgeResourceCount} new MedicationKnowledge resources (${sizeMB} MB)`,
)
