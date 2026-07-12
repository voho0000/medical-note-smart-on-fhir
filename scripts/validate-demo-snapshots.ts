// Validate the pre-generated demo AI snapshots (src/infrastructure/demo/
// demo-ai-snapshots.ts) through the REAL parse/finalize pipeline against the
// REAL demo bundle. Run whenever demo-bundle.json or the snapshots change:
//
//   npx tsx scripts/validate-demo-snapshots.ts
//
// Fails if any citation doesn't resolve verified, any timeline pick is
// dropped, the emphasis guardrails would demote the snapshot's highlights, OR
// a grounding-audit issue is found (a fabricated test, a positional cross-ref,
// or a topically-irrelevant citation — the "second pass" that mere citation
// resolution misses).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditSummaryGrounding, auditSafetyGrounding } from './lib/grounding-audit'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const { LocalBundleService } = await import(path.join(ROOT, 'src/infrastructure/fhir/services/local-bundle.service.ts'))
  const { buildSourceCatalog, generateMedicalSummaryUseCase, EMPHASIS_MAX_COUNT, EMPHASIS_MAX_CHARS } =
    await import(path.join(ROOT, 'src/core/use-cases/medical-summary/generate-medical-summary.use-case.ts'))
  const { generateSafetyAlertsUseCase } = await import(path.join(ROOT, 'src/core/use-cases/safety-alerts/generate-safety-alerts.use-case.ts'))
  const { demoMedicalSummarySnapshots, demoSafetyScanSnapshots } = await import(path.join(ROOT, 'src/infrastructure/demo/demo-ai-snapshots.ts'))

  const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/demo/demo-bundle.json'), 'utf8'))
  const { collection } = await LocalBundleService.parse(bundle)
  const catalog = buildSourceCatalog(collection)
  const keys = new Set(catalog.map((c: any) => c.key))
  const grounding = { bundleBlob: JSON.stringify(bundle), catalog }

  let failures = 0
  const fail = (msg: string) => { failures += 1; console.error('✗', msg) }

  for (const aud of ['medical', 'patient'] as const) {
    // --- medical summary: exact same path as a live reply ---
    const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(demoMedicalSummarySnapshots[aud]))
    if (!parsed) { fail(`summary[${aud}]: parseResult rejected`); continue }
    const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, catalog, {
      clinicalData: collection,
      audience: aud,
      locale: 'zh-TW',
    })
    const unverified = finalized.sourceIndex.filter((s: any) => !s.verified)
    if (unverified.length) fail(`summary[${aud}]: unverified keys ${unverified.map((s: any) => s.key).join(',')}`)
    if (finalized.droppedTimelineCount > 0) fail(`summary[${aud}]: ${finalized.droppedTimelineCount} timeline picks dropped`)
    const emph = finalized.summary.filter((s: any) => s.emphasis)
    if (emph.length === 0) fail(`summary[${aud}]: zero emphasis survived`)
    if (emph.length > EMPHASIS_MAX_COUNT) fail(`summary[${aud}]: ${emph.length} emphasis > cap`)
    for (const e of emph) if (e.text.length > EMPHASIS_MAX_CHARS) fail(`summary[${aud}]: emphasis too long: ${e.text}`)
    for (const issue of auditSummaryGrounding(demoMedicalSummarySnapshots[aud], grounding)) fail(`summary[${aud}] grounding: ${issue}`)
    console.log(`✓ summary[${aud}]: ${finalized.summary.length} segs (${emph.length} highlights), ${finalized.investigations.length} investigation trends, ${finalized.problems.length} problems, ${finalized.decisions.length} decisions, ${finalized.timeline.length} timeline, ${finalized.sourceIndex.length} sources all verified; grounding clean`)

    // --- safety: same path as a live reply ---
    const scan = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(demoSafetyScanSnapshots[aud]))
    if (!scan) { fail(`safety[${aud}]: parseScanResult rejected`); continue }
    for (const a of scan.alerts) {
      for (const k of a.sources ?? []) if (!keys.has(k)) fail(`safety[${aud}] "${a.title}": unknown key ${k}`)
    }
    for (const issue of auditSafetyGrounding(scan, grounding)) fail(`safety[${aud}] grounding: ${issue}`)
    console.log(`✓ safety[${aud}]: ${scan.alerts.length} alerts, all source keys resolve; grounding clean`)
  }

  if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1) }
  console.log('\nALL SNAPSHOTS VALID')
}
main().catch((e) => { console.error(e); process.exit(1) })
