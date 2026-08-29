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
})
