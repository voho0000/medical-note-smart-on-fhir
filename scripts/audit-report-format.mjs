// Local-only audit. Reads source fixture records; prints counts, never narratives
// or patient identifiers. Usage: node scripts/audit-report-format.mjs <fixtures/local>
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createJiti } from 'jiti'
const { formatReportText, formatReportTextForClipboard } = createJiti(import.meta.url)('../src/shared/utils/report-text-format.ts')
const root = process.argv[2]
if (!root) throw new Error('Pass the local fixtures directory')
const patientDir = join(resolve(root), 'patients')
const files = existsSync(patientDir) ? readdirSync(patientDir).filter(f => f.endsWith('.json')).map(f => join(patientDir, f)) : []
const snapshot = join(resolve(root), 'nhi-raw-fixture.json')
if (existsSync(snapshot)) files.push(snapshot)
if (!files.length) throw new Error('No source fixtures found')
const reports = []
function visit(value) {
  if (Array.isArray(value)) return value.forEach(visit)
  if (!value || typeof value !== 'object') return
  if (typeof value.desc === 'string' && typeof value.order_NAME === 'string') reports.push(value.desc)
  Object.values(value).forEach(visit)
}
files.forEach(file => visit(JSON.parse(readFileSync(file, 'utf8'))))
const populated = reports.filter(s => s.trim())
let changed = 0
let plain = 0
let measurements = 0
let fixedWidth = 0
for (const raw of populated) {
  const lines = formatReportText(raw)
  const formatted = formatReportTextForClipboard(raw)
  if (!lines.length || raw.replace(/\s/g, '') !== formatted.replace(/\s/g, '')) changed++
  if (lines.every(l => !l.heading && !l.marker && !l.measurement && !l.monospace && !l.separator)) plain++
  if (lines.some(l => l.measurement)) measurements++
  if (lines.some(l => l.monospace)) fixedWidth++
}
console.log(JSON.stringify({ sourceFiles: files.length, records: reports.length, populated: populated.length, empty: reports.length-populated.length, distinctNarratives: new Set(populated).size, contentChanges: changed, measurementReports: measurements, fixedWidthReports: fixedWidth, plainTextFallbackReports: plain }, null, 2))
if (changed) process.exitCode = 1
