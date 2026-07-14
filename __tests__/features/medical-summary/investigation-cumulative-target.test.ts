import { buildInvestigationCumulativeTargets } from '@/features/medical-summary/utils/investigation-cumulative-target'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import type { DiagnosticReportEntity, ObservationEntity } from '@/src/core/entities/clinical-data.entity'

function summary(sourceKeys = ['L1']): MedicalSummaryResult {
  return {
    headline: '摘要',
    summary: [],
    investigations: [{
      label: '白血球 (WBC)',
      kind: 'lab',
      direction: 'stable',
      trend: '5.1 → 5.3 → 5.2 K/µL',
      interpretation: '白血球穩定。',
      sourceKeys,
    }],
    medicationEducation: [],
    medicationReview: { regimen: [], changes: [], reconciliation: [] },
    problems: [],
    decisions: [],
    timeline: [],
    sourceIndex: [{
      key: 'L1',
      num: 1,
      verified: true,
      resourceType: 'DiagnosticReport',
      resourceId: 'report-1',
      date: '2026-06-17',
    }],
    droppedTimelineCount: 0,
  }
}

const wbc: ObservationEntity = {
  id: 'obs-wbc',
  code: { coding: [{ system: 'http://loinc.org', code: '6690-2', display: 'WBC' }] },
  effectiveDateTime: '2026-06-17',
  valueQuantity: { value: 5.2, unit: 'K/µL' },
}

describe('buildInvestigationCumulativeTargets', () => {
  it('maps a cited report to the exact cumulative category containing its observation', () => {
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-wbc' }],
      effectiveDateTime: '2026-06-17',
    }]

    expect(buildInvestigationCumulativeTargets(summary(), reports, [wbc])).toEqual([{
      categoryId: 'cbc',
      analyteKey: 'WBC',
      resourceType: 'DiagnosticReport',
      resourceId: 'report-1',
      display: '白血球 (WBC)',
      date: '2026-06-17',
    }])
  })

  it('does not offer a target when neither citations nor the named analyte resolve uniquely', () => {
    const glucose: ObservationEntity = {
      id: 'obs-glucose',
      code: { coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 100, unit: 'mg/dL' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [
        { reference: 'Observation/obs-wbc' },
        { reference: 'Observation/obs-glucose' },
      ],
    }]
    const ambiguous = summary()
    ambiguous.investigations[0].label = '代謝指標'
    ambiguous.investigations[0].trend = '近期有變化'

    expect(buildInvestigationCumulativeTargets(ambiguous, reports, [wbc, glucose])).toEqual([null])
  })

  it('uses an exact analyte match when stale citations point to the wrong category', () => {
    const glucose: ObservationEntity = {
      id: 'obs-glucose',
      code: { coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 100, unit: 'mg/dL' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-glucose' }],
    }]

    expect(buildInvestigationCumulativeTargets(summary(), reports, [wbc, glucose])).toEqual([{
      categoryId: 'cbc',
      analyteKey: 'WBC',
      resourceType: 'Observation',
      resourceId: 'obs-wbc',
      display: '白血球 (WBC)',
      date: '2026-06-17',
    }])
  })

  it('matches Hb as a complete token without mistaking a cited HbA1c report for the target', () => {
    const cached = summary()
    cached.investigations[0].label = '貧血指標'
    cached.investigations[0].trend = 'Hb 11.2–12.1 g/dL'
    const hba1c: ObservationEntity = {
      id: 'obs-hba1c',
      // The contradictory raw label exercises LOINC priority: this resource
      // must remain HbA1c and must not become an Hb match via code.text.
      code: {
        text: 'Hb',
        coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }],
      },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 6.5, unit: '%' },
    }
    const hb: ObservationEntity = {
      id: 'obs-hb',
      code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 12.1, unit: 'g/dL' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-hba1c' }],
    }]

    expect(buildInvestigationCumulativeTargets(cached, reports, [hba1c, hb])).toEqual([{
      categoryId: 'cbc',
      analyteKey: 'HB',
      resourceType: 'Observation',
      resourceId: 'obs-hb',
      display: '貧血指標',
      date: '2026-06-17',
    }])
  })

  it('does not expose a wrong target when a recognized LOINC contradicts the display label', () => {
    const cached = summary()
    cached.investigations[0].label = '貧血指標'
    cached.investigations[0].trend = 'Hb 11.2–12.1 g/dL'
    const mislabeledHba1c: ObservationEntity = {
      id: 'obs-hba1c',
      code: {
        text: 'Hb',
        coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }],
      },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 6.5, unit: '%' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-hba1c' }],
    }]

    expect(buildInvestigationCumulativeTargets(cached, reports, [mislabeledHba1c])).toEqual([null])
  })

  it('requires both ASCII boundaries so Hb does not match inside HBsAg', () => {
    const cached = summary()
    cached.investigations[0].label = 'B 型肝炎表面抗原 (HBsAg)'
    cached.investigations[0].trend = 'HBsAg: Negative'
    const hb: ObservationEntity = {
      id: 'obs-hb',
      code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hb' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 12.1, unit: 'g/dL' },
    }
    const hbsag: ObservationEntity = {
      id: 'obs-hbsag',
      code: { coding: [{ system: 'http://loinc.org', code: '5195-3', display: 'HBsAg' }] },
      effectiveDateTime: '2026-06-17',
      valueString: 'Negative',
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-hb' }],
    }]

    expect(buildInvestigationCumulativeTargets(cached, reports, [hb, hbsag])).toEqual([{
      categoryId: 'hep',
      analyteKey: 'HBSAG',
      resourceType: 'Observation',
      resourceId: 'obs-hbsag',
      display: 'B 型肝炎表面抗原 (HBsAg)',
      date: '2026-06-17',
    }])
  })

  it('uses longest matching so microalbumin is not intercepted by albumin', () => {
    const cached = summary()
    cached.investigations[0].label = '尿微量白蛋白'
    cached.investigations[0].trend = '微白蛋白 22 → 28 → 31 mg/L'
    const albumin: ObservationEntity = {
      id: 'obs-albumin',
      code: { coding: [{ system: 'http://loinc.org', code: '1751-7', display: 'Albumin' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 4.1, unit: 'g/dL' },
    }
    const microalbumin: ObservationEntity = {
      id: 'obs-microalbumin',
      code: {
        text: '微白蛋白',
        coding: [{ system: 'http://loinc.org', code: '14957-5', display: 'Microalbumin' }],
      },
      specimen: { display: 'Urine' },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 31, unit: 'mg/L' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-albumin' }],
    }]

    expect(buildInvestigationCumulativeTargets(cached, reports, [albumin, microalbumin])).toEqual([{
      categoryId: 'urine',
      analyteKey: 'MALB',
      resourceType: 'Observation',
      resourceId: 'obs-microalbumin',
      display: '尿微量白蛋白',
      date: '2026-06-17',
    }])
  })

  it('normalizes fullwidth no-LOINC analyte names before matching', () => {
    const cached = summary()
    cached.investigations[0].label = '紅血球平均容積 (MCV)'
    cached.investigations[0].trend = 'ＭＣＶ 89 → 91 → 90 fL'
    const glucose: ObservationEntity = {
      id: 'obs-glucose',
      code: { coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 100, unit: 'mg/dL' },
    }
    const fullwidthMcv: ObservationEntity = {
      id: 'obs-mcv',
      code: { text: 'ＭＣＶ' },
      specimen: { display: 'Blood' },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 90, unit: 'fL' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-glucose' }],
    }]

    expect(buildInvestigationCumulativeTargets(cached, reports, [glucose, fullwidthMcv])).toEqual([{
      categoryId: 'cbc',
      analyteKey: 'MCV',
      resourceType: 'Observation',
      resourceId: 'obs-mcv',
      display: '紅血球平均容積 (MCV)',
      date: '2026-06-17',
    }])
  })

  it('resolves the real eGFR panel when cached citations span HCT and sodium reports', () => {
    const cached = summary(['L1', 'L2'])
    cached.investigations[0].label = '腎功能（eGFR）'
    cached.investigations[0].trend = 'eGFR 35 → 33 → 32 mL/min/1.73m²'
    cached.sourceIndex.push({
      key: 'L2',
      num: 2,
      verified: true,
      resourceType: 'DiagnosticReport',
      resourceId: 'report-sodium',
      date: '2026-05-25',
    })
    const hct: ObservationEntity = {
      id: 'obs-hct',
      code: { coding: [{ system: 'http://loinc.org', code: '20570-8', display: 'HCT' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 37.2, unit: '%' },
    }
    const sodium: ObservationEntity = {
      id: 'obs-sodium',
      code: { coding: [{ system: 'http://loinc.org', code: '2951-2', display: 'Sodium' }] },
      effectiveDateTime: '2026-05-25',
      valueQuantity: { value: 144, unit: 'mEq/L' },
    }
    const egfr: ObservationEntity = {
      id: 'obs-egfr',
      code: { coding: [{ system: 'http://loinc.org', code: '77147-7', display: 'eGFR MDRD' }] },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 32, unit: 'mL/min/1.73m2' },
    }
    const reports: DiagnosticReportEntity[] = [
      { id: 'report-1', result: [{ reference: 'Observation/obs-hct' }] },
      { id: 'report-sodium', result: [{ reference: 'Observation/obs-sodium' }] },
    ]

    expect(buildInvestigationCumulativeTargets(cached, reports, [hct, sodium, egfr])).toEqual([{
      categoryId: 'chem',
      analyteKey: 'EGFR(M)',
      resourceType: 'Observation',
      resourceId: 'obs-egfr',
      display: '腎功能（eGFR）',
      date: '2026-06-17',
    }])
  })

  it('carries the CRP column key so cumulative navigation can reveal it horizontally', () => {
    const cached = summary()
    cached.investigations[0].label = '發炎指標 (CRP)'
    cached.investigations[0].trend = '12.3 → 33.27 → 2.47 mg/dL'
    const crp: ObservationEntity = {
      id: 'obs-crp',
      code: {
        coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'C-reactive protein' }],
      },
      effectiveDateTime: '2026-06-17',
      valueQuantity: { value: 2.47, unit: 'mg/dL' },
    }
    const reports: DiagnosticReportEntity[] = [{
      id: 'report-1',
      result: [{ reference: 'Observation/obs-crp' }],
      effectiveDateTime: '2026-06-17',
    }]

    expect(buildInvestigationCumulativeTargets(cached, reports, [crp])).toEqual([{
      categoryId: 'chem',
      analyteKey: 'CRP',
      resourceType: 'DiagnosticReport',
      resourceId: 'report-1',
      display: '發炎指標 (CRP)',
      date: '2026-06-17',
    }])
  })
})
