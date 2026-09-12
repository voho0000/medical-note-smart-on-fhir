import fs from 'node:fs'
import path from 'node:path'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { getDefaultClinicalGuidelinePack } from '@/features/clinical-decision-support/guideline-packs/registry'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

interface CaseManifestEntry {
  id: string
  file: string
  name: string
  summary: string
  lvef: number
  resourceCount: number
}

const CASE_DIR = path.join(process.cwd(), 'public', 'demo', 'hfrEF')
const manifest = JSON.parse(
  fs.readFileSync(path.join(CASE_DIR, 'manifest.json'), 'utf8'),
) as CaseManifestEntry[]

function readBundle(filename: string) {
  return JSON.parse(fs.readFileSync(path.join(CASE_DIR, filename), 'utf8'))
}

function evaluateCase(filename: string, decisions: PhysicianDecisionMap = {}) {
  const parsed = LocalBundleService.parse(readBundle(filename))!
  const collection = parsed.collection
  const now = new Date('2026-09-13T00:00:00+08:00')
  const profile = createFhirCdssPatientProfile({
    patient: parsed.patient,
    conditions: collection.conditions,
    encounters: collection.encounters,
    observations: collection.observations,
    medications: collection.medications,
    allergies: collection.allergies,
    carePlans: collection.carePlans,
    procedures: collection.procedures,
    immunizations: collection.immunizations,
    diagnosticReports: collection.diagnosticReports,
    documentReferences: collection.documentReferences,
    now,
  })
  const pack = getDefaultClinicalGuidelinePack()
  const result = pack.build({ profile, locale: 'zh-TW' })
  const board = buildHeartFailureBoard(result, 'zh-TW', now, profile.facts)!
  const flow = buildHeartFailureVisitFlow({
    board,
    result,
    isEnglish: false,
    now,
    patientId: parsed.patient.id,
    decisions,
  })
  return { parsed, profile, pack, result, flow }
}

describe('synthetic HFrEF demo cases', () => {
  it('ships four distinct, single-patient clinical scenarios', () => {
    expect(manifest).toHaveLength(4)
    expect(new Set(manifest.map((item) => item.id)).size).toBe(4)
    expect(manifest.map((item) => item.lvef)).toEqual([35, 28, 30, 25])

    for (const item of manifest) {
      const bundle = readBundle(item.file)
      const resources = bundle.entry.map((entry: { resource: { resourceType: string } }) => entry.resource)
      expect(resources.filter((resource: { resourceType: string }) => resource.resourceType === 'Patient'))
        .toHaveLength(1)
      expect(resources).toEqual(expect.arrayContaining([
        expect.objectContaining({ resourceType: 'Condition' }),
        expect.objectContaining({ resourceType: 'Encounter' }),
        expect.objectContaining({ resourceType: 'Observation' }),
        expect.objectContaining({ resourceType: 'DiagnosticReport' }),
        expect.objectContaining({ resourceType: 'MedicationRequest' }),
      ]))
      expect(resources).toHaveLength(item.resourceCount)
    }
  })

  it.each(manifest.map((item) => [item.id, item.file] as const))(
    '%s parses through the app and activates the HFrEF care pack',
    (_id, filename) => {
      const { profile, pack, result } = evaluateCase(filename)

      expect(pack.applies(profile)).toBe(true)
      expect(profile.facts.LVEF?.numericValue).toBeLessThan(50)
      expect(result.recommendations.map((item) => item.id)).toContain('heart-failure-phenotype')
    },
  )

  it('keeps the intended safety contrasts between the scenarios', () => {
    const values = Object.fromEntries(manifest.map((item) => {
      const parsed = LocalBundleService.parse(readBundle(item.file))!
      const observations = parsed.collection.observations
      const byCode = (code: string) => observations.find((observation) => (
        observation.code?.coding?.some((coding) => coding.code === code)
      ))?.valueQuantity?.value
      return [item.id, {
        potassium: byCode('2823-3'),
        egfr: byCode('33914-3'),
        heartRate: byCode('8867-4'),
      }]
    }))

    expect(values['renal-hyperkalemia']).toMatchObject({ potassium: 5.6, egfr: 24 })
    expect(values['hypotension-bradycardia']).toMatchObject({ heartRate: 44 })
  })

  it('shows the low-HR warning on the beta-blocker row for the HR 44 patient', () => {
    const { flow } = evaluateCase('04-hypotension-bradycardia.json')
    const rows = flow.actionGroups.flatMap((group) => group.rows)
    const betaBlocker = rows.find((row) => row.recommendation.id === 'heart-failure-beta-blocker')
    const ras = rows.find((row) => row.recommendation.id === 'heart-failure-ras-inhibition')

    expect(betaBlocker).toMatchObject({ status: 'review' })
    expect(betaBlocker?.recommendation.nextActions[0]).toContain('心率 44 bpm（<50）')
    expect(betaBlocker?.basis).toContain('Carvedilol 12.5 mg')
    expect(betaBlocker?.basis).toContain('44 bpm')
    expect(ras).toMatchObject({ status: 'review' })
    expect(ras?.recommendation.nextActions[0]).toContain('收縮壓 86 mmHg')
  })

  it('writes each triggered safety gate into dose-adjustment and deferral summaries', () => {
    const { flow } = evaluateCase('04-hypotension-bradycardia.json', {
      'heart-failure-ras-inhibition': {
        decision: 'dose-adjusted', reasons: [], recordedAt: '2026-09-13T00:00:00+08:00', packVersion: 'test',
      },
      'heart-failure-beta-blocker': {
        decision: 'deferred', reasons: [], recordedAt: '2026-09-13T00:00:00+08:00', packVersion: 'test',
      },
    })

    expect(flow.englishSummaryText).toContain(
      '- RAS inhibition: Dose adjusted (SBP 86 mmHg (<100))',
    )
    expect(flow.englishSummaryText).toContain(
      '- Evidence-based HFrEF beta-blocker: Deferred (HR 44 bpm (<50))',
    )
    expect(flow.summaryText).toContain('收縮壓 86 mmHg（<100）')
    expect(flow.summaryText).toContain('心率 44 bpm（<50）')
  })

  it('shows renal and potassium safety limits on their medication rows', () => {
    const { flow } = evaluateCase('03-renal-hyperkalemia.json')
    const rows = flow.actionGroups.flatMap((group) => group.rows)
    const ras = rows.find((row) => row.recommendation.id === 'heart-failure-ras-inhibition')
    const mra = rows.find((row) => row.recommendation.id === 'heart-failure-mra')

    expect(ras).toMatchObject({ status: 'review' })
    expect(ras?.recommendation.nextActions[0]).toContain('eGFR 24')
    expect(ras?.recommendation.nextActions[0]).toContain('K 5.6 mmol/L')
    expect(mra).toMatchObject({ status: 'review' })
    expect(mra?.recommendation.nextActions[0]).toContain('未符合 MRA 起始安全門檻')
  })

  it('keeps all four medication rows clear in the stable case', () => {
    const { flow } = evaluateCase('01-stable-four-pillars.json')
    const rows = flow.actionGroups.flatMap((group) => group.rows)
    const statuses = Object.fromEntries(rows
      .filter((row) => [
        'heart-failure-ras-inhibition',
        'heart-failure-beta-blocker',
        'heart-failure-mra',
        'heart-failure-sglt2',
      ].includes(row.recommendation.id))
      .map((row) => [row.recommendation.id, row.status]))

    expect(statuses).toEqual({
      'heart-failure-ras-inhibition': 'no-action',
      'heart-failure-beta-blocker': 'no-action',
      'heart-failure-mra': 'no-action',
      'heart-failure-sglt2': 'no-action',
    })
  })
})
