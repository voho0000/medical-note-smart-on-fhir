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
import {
  auditSummaryGrounding,
  auditSafetyGrounding,
  buildGroundingAuditInput,
} from './lib/grounding-audit'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const { LocalBundleService } = await import(path.join(ROOT, 'src/infrastructure/fhir/services/local-bundle.service.ts'))
  const { enrichBundleWithNhiDrugTerminology } = await import(path.join(ROOT, 'src/infrastructure/fhir/services/nhi-drug-terminology-enrichment.service.ts'))
  const { generateMedicalSummaryUseCase, getSourceCatalog, EMPHASIS_MAX_COUNT, EMPHASIS_MAX_CHARS } =
    await import(path.join(ROOT, 'src/core/use-cases/medical-summary/generate-medical-summary.use-case.ts'))
  const { generateSafetyAlertsUseCase } = await import(path.join(ROOT, 'src/core/use-cases/safety-alerts/generate-safety-alerts.use-case.ts'))
  const { scopeClinicalDataForAi } = await import(path.join(ROOT, 'src/core/utils/ai-clinical-scope.utils.ts'))
  const { listClinicalDocuments, resolveSelectedDocuments } = await import(path.join(ROOT, 'src/core/utils/clinical-documents.utils.ts'))
  const { DEFAULT_DATA_FILTERS, DEFAULT_DATA_SELECTION } = await import(path.join(ROOT, 'src/shared/constants/data-selection.constants.ts'))
  const { demoMedicalSummarySnapshots, demoSafetyScanSnapshots } = await import(path.join(ROOT, 'src/infrastructure/demo/demo-ai-snapshots.ts'))

  const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/demo/demo-bundle.json'), 'utf8'))
  // Match the real demo/local import path: exact-code NHI MedicationKnowledge
  // is attached before the App view model and AI context are built.
  const enriched = await enrichBundleWithNhiDrugTerminology(bundle)
  const { collection } = await LocalBundleService.parse(enriched.bundle)
  // Demo seeding runs against the app's default AI scope, not the complete
  // imported bundle. Build the exact same scoped catalog here so key numbering
  // and citation verification cannot drift from what localhost/production show.
  const includedDocumentIds = resolveSelectedDocuments(
    listClinicalDocuments(collection),
    'latestAdmission',
    [],
  ).map((document: { id: string }) => document.id)
  const scopedClinicalData = scopeClinicalDataForAi(
    collection,
    DEFAULT_DATA_SELECTION,
    DEFAULT_DATA_FILTERS,
    includedDocumentIds,
  )
  let failures = 0
  const fail = (msg: string) => { failures += 1; console.error('✗', msg) }

  for (const locale of ['zh-TW', 'en'] as const) {
    const catalog = getSourceCatalog(scopedClinicalData, locale)
    const keys = new Set(catalog.map((c: any) => c.key))
    // Use the exact scoped records and the canonical decoded clinical-document
    // text. Searching the raw Bundle would miss Base64-encoded discharge prose.
    const grounding = buildGroundingAuditInput(scopedClinicalData, catalog)

    for (const aud of ['medical', 'patient'] as const) {
      const tag = `${locale}/${aud}`
      // --- medical summary: exact same path as a live reply ---
      const snapshot = demoMedicalSummarySnapshots[locale][aud]
      const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
      if (!parsed) { fail(`summary[${tag}]: parseResult rejected`); continue }
      const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, catalog, {
        clinicalData: scopedClinicalData,
        audience: aud,
        locale,
      })
      const unverified = finalized.sourceIndex.filter((s: any) => !s.verified)
      if (unverified.length) fail(`summary[${tag}]: unverified keys ${unverified.map((s: any) => s.key).join(',')}`)
      if (finalized.droppedTimelineCount > 0) fail(`summary[${tag}]: ${finalized.droppedTimelineCount} timeline picks dropped`)
      const emph = finalized.summary.filter((s: any) => s.emphasis)
      if (emph.length === 0) fail(`summary[${tag}]: zero emphasis survived`)
      if (emph.length > EMPHASIS_MAX_COUNT) fail(`summary[${tag}]: ${emph.length} emphasis > cap`)
      for (const e of emph) if (e.text.length > EMPHASIS_MAX_CHARS) fail(`summary[${tag}]: emphasis too long: ${e.text}`)
      for (const issue of auditSummaryGrounding(snapshot, grounding)) fail(`summary[${tag}] grounding: ${issue}`)
      if (aud === 'patient') {
        const urinaryEducation = snapshot.medicationEducation
        const betmiga = urinaryEducation.find(
          (item: { name: string }) => item.name.includes('Betmiga'),
        )
        if (!betmiga) fail(`summary[${tag}]: missing standalone Betmiga education item`)
        if (betmiga && (betmiga.sources.join(',') !== 'M6' || /Harnalidge|Oxbu/.test(betmiga.name))) {
          fail(`summary[${tag}]: Betmiga item is not isolated to its exact M6 record`)
        }
        if (betmiga && /口乾|便祕|姿勢.*頭暈|dry mouth|constipation|dizz/i.test(betmiga.attention)) {
          fail(`summary[${tag}]: Betmiga inherited another medicine's anticholinergic/orthostatic reminder`)
        }
      }
      console.log(`✓ summary[${tag}]: ${finalized.summary.length} segs (${emph.length} highlights), ${finalized.investigations.length} investigation trends, ${finalized.problems.length} problems, ${finalized.decisions.length} decisions, ${finalized.timeline.length} timeline, ${finalized.sourceIndex.length} sources all verified; grounding clean`)

      // --- safety: same path as a live reply ---
      const scan = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(demoSafetyScanSnapshots[locale][aud]))
      if (!scan) { fail(`safety[${tag}]: parseScanResult rejected`); continue }
      for (const a of scan.alerts) {
        for (const k of a.sources ?? []) if (!keys.has(k)) fail(`safety[${tag}] "${a.title}": unknown key ${k}`)
      }
      for (const issue of auditSafetyGrounding(scan, grounding)) fail(`safety[${tag}] grounding: ${issue}`)
      console.log(`✓ safety[${tag}]: ${scan.alerts.length} alerts, all source keys resolve; grounding clean`)
    }
  }

  if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1) }
  console.log('\nALL SNAPSHOTS VALID')
}
main().catch((e) => { console.error(e); process.exit(1) })
