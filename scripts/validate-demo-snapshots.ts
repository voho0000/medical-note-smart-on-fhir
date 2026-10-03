// Validate the pre-generated demo AI snapshots (src/infrastructure/demo/
// demo-ai-snapshots.ts) through the REAL parse/finalize pipeline against the
// REAL demo bundle. Run whenever demo-bundle.json or the snapshots change:
//
//   npx tsx scripts/validate-demo-snapshots.ts
//
// Fails if any citation doesn't resolve verified, the problem list is empty,
// 影像與病理重點 does not list every digest report in its fallback, OR a
// grounding-audit issue is found (a fabricated test, a positional cross-ref,
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
  const { generateMedicalSummaryUseCase, getSourceCatalog } =
    await import(path.join(ROOT, 'src/core/use-cases/medical-summary/generate-medical-summary.use-case.ts'))
  const { generateSafetyAlertsUseCase } = await import(path.join(ROOT, 'src/core/use-cases/safety-alerts/generate-safety-alerts.use-case.ts'))
  const { scopeClinicalDataForAi } = await import(path.join(ROOT, 'src/core/utils/ai-clinical-scope.utils.ts'))
  const { listClinicalDocuments, resolveSelectedDocuments } = await import(path.join(ROOT, 'src/core/utils/clinical-documents.utils.ts'))
  const { DEFAULT_DATA_FILTERS, DEFAULT_DATA_SELECTION, DEFAULT_DOCUMENT_MODE } = await import(path.join(ROOT, 'src/shared/constants/data-selection.constants.ts'))
  const { DEMO_DATA_AS_OF_MS } = await import(path.join(ROOT, 'src/shared/constants/demo-data.constants.ts'))
  const { demoMedicalSummarySnapshots, demoSafetyScanSnapshots, remapDemoSnapshotSourceKeys } = await import(path.join(ROOT, 'src/infrastructure/demo/demo-ai-snapshots.ts'))

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
    DEFAULT_DOCUMENT_MODE,
    [],
  ).map((document: { id: string }) => document.id)
  const scopedClinicalData = scopeClinicalDataForAi(
    collection,
    DEFAULT_DATA_SELECTION,
    DEFAULT_DATA_FILTERS,
    includedDocumentIds,
    DEMO_DATA_AS_OF_MS,
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
      // Match runtime seeding: new demo reports can renumber short L keys;
      // citations still belong to the original stable resource identities.
      const snapshot = remapDemoSnapshotSourceKeys(demoMedicalSummarySnapshots[locale][aud], catalog)
      const parsed = generateMedicalSummaryUseCase.parseResult(JSON.stringify(snapshot))
      if (!parsed) { fail(`summary[${tag}]: parseResult rejected`); continue }
      const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, catalog, {
        clinicalData: scopedClinicalData,
        audience: aud,
        locale,
      })
      const unverified = finalized.sourceIndex.filter((s: any) => !s.verified)
      if (unverified.length) fail(`summary[${tag}]: unverified keys ${unverified.map((s: any) => s.key).join(',')}`)
      if (finalized.problems.length === 0) fail(`summary[${tag}]: no problems survived`)
      for (const issue of auditSummaryGrounding(snapshot, grounding)) fail(`summary[${tag}] grounding: ${issue}`)
      // 影像與病理重點: the demo snapshots carry no reports module, so the
      // section must be the unavailable-summary fallback listing EVERY digest
      // report with its deterministic excerpt.
      const highlights = finalized.reportHighlights
      if (aud === 'medical') {
        if (!highlights) fail(`summary[${tag}]: no 影像與病理重點 rendered`)
        else {
          if (highlights.summarized) fail(`summary[${tag}]: 影像與病理重點 claims a summary the snapshot does not carry`)
          if (highlights.groups.length > 0) fail(`summary[${tag}]: 影像與病理重點 has groups without a reports module`)
          if (highlights.others.length !== highlights.totalReports) fail(`summary[${tag}]: 影像與病理重點 lists ${highlights.others.length} of ${highlights.totalReports} reports`)
          const empty = highlights.others.filter((row: any) => !row.excerpt)
          if (empty.length) fail(`summary[${tag}]: 影像與病理重點 rows without an excerpt: ${empty.map((row: any) => row.key).join(',')}`)
          console.log(`✓ reports[${tag}]: ${highlights.others.length} imaging/pathology reports listed with their own excerpt (summary unavailable)`)
        }
      } else if (highlights) fail(`summary[${tag}]: 影像與病理重點 rendered for the patient audience`)
      if (aud === 'patient') {
        const education = snapshot.medicationEducation
        const expectedCurrentEducation = [
          { pattern: /Forxiga/, sources: 'M10' },
          { pattern: /Aricept/, sources: 'M5,M11' },
        ]
        for (const expected of expectedCurrentEducation) {
          const item = education.find((candidate: { name: string }) => expected.pattern.test(candidate.name))
          if (!item) fail(`summary[${tag}]: missing current medication education for ${expected.pattern.source}`)
          if (item && item.sources.join(',') !== expected.sources) {
            fail(`summary[${tag}]: ${expected.pattern.source} cites ${item.sources.join(',')} instead of ${expected.sources}`)
          }
        }
      }
      console.log(`✓ summary[${tag}]: ${finalized.problems.length} problems, ${finalized.medicationEducation.length} education items, ${finalized.sourceIndex.length} sources all verified; grounding clean`)

      // --- safety: same path as a live reply ---
      const scan = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(
        remapDemoSnapshotSourceKeys(demoSafetyScanSnapshots[locale][aud], catalog),
      ))
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
