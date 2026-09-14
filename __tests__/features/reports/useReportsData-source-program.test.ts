import { buildReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'

const ADULT_PREVENTIVE_TAG = {
  system: 'https://cloud-wildcatch.invalid/fhir/source-program',
  code: 'adult-preventive',
}

function report(id: string, tagged: boolean) {
  return {
    resourceType: 'DiagnosticReport',
    id,
    status: 'final',
    code: { text: 'CHOL' },
    effectiveDateTime: '2024-06-28T00:00:00+08:00',
    _observations: [{
      resourceType: 'Observation',
      id: `${id}-observation`,
      ...(tagged ? { meta: { tag: [ADULT_PREVENTIVE_TAG] } } : {}),
      code: { text: 'CHOL' },
      effectiveDateTime: '2024-06-28T00:00:00+08:00',
      performer: [{ display: '良安診所' }],
      valueQuantity: { value: tagged ? 210 : 180, unit: 'mg/dL' },
    }],
  }
}

describe('buildReportsData source-program provenance', () => {
  it('keeps adult health-exam and ordinary same-day reports separate', () => {
    const { reportRows } = buildReportsData([
      report('adult-health-exam-report', true),
      report('ordinary-report', false),
    ])

    expect(reportRows).toHaveLength(2)
    expect(reportRows.filter((row) => row.sourceProgram === 'adult-preventive'))
      .toHaveLength(1)
  })

  it('does not label a mixed report as wholly MediCloud or let an NHI performer hide the ordinary institution', () => {
    const cloud = {
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
        valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
      }],
      performer: [{ display: '衛生福利部中央健康保險署' }],
    }
    const { reportRows } = buildReportsData([{
      resourceType: 'DiagnosticReport', id: 'mixed', status: 'final',
      category: [{ coding: [{ code: 'LAB' }] }], code: { text: 'Lab' },
      effectiveDateTime: '2026-09-14T08:00:00+08:00',
      _observations: [cloud, { performer: [{ display: '臺北榮民總醫院' }] }],
    }])

    expect(reportRows[0].sourceProvenance).toBeUndefined()
    expect(reportRows[0].institution).toBe('臺北榮民總醫院')
  })

  it('does not present the NHI authority as an all-cloud report institution', () => {
    const { reportRows } = buildReportsData([{
      resourceType: 'DiagnosticReport', id: 'cloud', status: 'final',
      category: [{ coding: [{ code: 'LAB' }] }], code: { text: 'Glucose' },
      performer: [{ display: '衛生福利部中央健康保險署' }],
      effectiveDateTime: '2026-09-14T08:00:00+08:00',
      _observations: [{
        extension: [{
          url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-source-system',
          valueCodeableConcept: { coding: [{ code: 'nhi-medicloud' }] },
        }],
        performer: [{ display: '衛生福利部中央健康保險署' }],
      }],
    }])
    expect(reportRows[0].sourceProvenance).toBe('nhi-medicloud')
    expect(reportRows[0].institution).toBeUndefined()
  })
})
