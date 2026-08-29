import { renderHook } from '@testing-library/react'
import { useOrphanObservations } from '@/features/clinical-summary/reports/hooks/useOrphanObservations'

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: { reports: { tabs: { cancerScreening: '癌篩' } } },
  }),
}))

describe('useOrphanObservations — MediCloud cancer screening', () => {
  it('creates a dedicated cancer-screening row and renders source HTML as plain text', () => {
    const observation = {
      resourceType: 'Observation',
      id: 'screening-colorectal-proposal',
      status: 'unknown',
      category: [{
        coding: [{
          system: 'https://cloud-wildcatch.invalid/fhir/CodeSystem/medcloud-observation-program',
          code: 'cancer-screening',
          display: '癌症篩檢',
        }],
      }],
      code: { text: '大腸癌篩檢建議' },
      valueString: '<p>無異常：<br />建議每2年定期接受糞便潛血檢查。</p>',
    }

    const { result } = renderHook(() =>
      useOrphanObservations([observation], new Set<string>()),
    )

    expect(result.current).toHaveLength(1)
    expect(result.current[0]).toMatchObject({
      title: '大腸癌篩檢建議',
      meta: '癌篩',
      group: 'cancer-screening',
    })
    expect(result.current[0].obs[0].valueString).toBe(
      '無異常：\n建議每2年定期接受糞便潛血檢查。',
    )
    expect(observation.valueString).toContain('<p>')
  })

  it('keeps explicit adult preventive-health provenance on an orphan lab row', () => {
    const observation = {
      resourceType: 'Observation',
      id: 'adult-health-exam-cholesterol',
      meta: {
        tag: [{
          system: 'https://cloud-wildcatch.invalid/fhir/source-program',
          code: 'adult-preventive',
        }],
      },
      status: 'final',
      category: [{ coding: [{ code: 'laboratory' }] }],
      code: { text: 'CHOL' },
      effectiveDateTime: '2024-06-28T00:00:00+08:00',
      performer: [{ display: '良安診所' }],
      valueQuantity: { value: 210, unit: 'mg/dL' },
    }

    const { result } = renderHook(() =>
      useOrphanObservations([observation], new Set<string>()),
    )

    expect(result.current[0]).toMatchObject({
      sourceProgram: 'adult-preventive',
      institution: '良安診所',
    })
  })

  it('does not lend adult-health provenance to an ordinary same-day observation', () => {
    const base = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'CHOL' },
      effectiveDateTime: '2024-06-28T00:00:00+08:00',
      performer: [{ display: '良安診所' }],
      valueQuantity: { value: 210, unit: 'mg/dL' },
    }
    const adultExam = {
      ...base,
      id: 'adult-health-exam-cholesterol',
      meta: {
        tag: [{
          system: 'https://cloud-wildcatch.invalid/fhir/source-program',
          code: 'adult-preventive',
        }],
      },
    }
    const ordinaryLab = { ...base, id: 'ordinary-cholesterol' }

    const { result } = renderHook(() =>
      useOrphanObservations([adultExam, ordinaryLab], new Set<string>()),
    )

    expect(result.current).toHaveLength(2)
    expect(result.current.filter((row) => row.sourceProgram === 'adult-preventive'))
      .toHaveLength(1)
  })

  it('recognizes an untagged observation referenced by an adult preventive Composition', () => {
    const bloodPressure = {
      resourceType: 'Observation',
      id: 'blood-pressure-panel',
      status: 'final',
      category: [{ coding: [{ code: 'vital-signs' }] }],
      code: { text: 'Blood Pressure' },
      effectiveDateTime: '2024-06-28T00:00:00+08:00',
      performer: [{ display: '良安診所' }],
      component: [
        {
          code: { text: 'Systolic blood pressure' },
          valueQuantity: { value: 130, unit: 'mmHg' },
        },
        {
          code: { text: 'Diastolic blood pressure' },
          valueQuantity: { value: 90, unit: 'mmHg' },
        },
      ],
    }
    const adultPreventiveComposition = {
      resourceType: 'Composition',
      id: 'adult-preventive-2024-06-28',
      type: { coding: [{ system: 'http://loinc.org', code: '75484-6' }] },
      section: [{
        title: '血壓檢查',
        section: [{
          entry: [{ reference: 'Observation/blood-pressure-panel' }],
        }],
      }],
    }

    const { result } = renderHook(() =>
      useOrphanObservations(
        [bloodPressure],
        new Set<string>(),
        'standardized',
        [adultPreventiveComposition],
      ),
    )

    expect(result.current).toHaveLength(1)
    expect(result.current[0]).toMatchObject({
      sourceProgram: 'adult-preventive',
      institution: '良安診所',
    })
  })

  it('does not mark an unreferenced observation from the same day as an adult health exam', () => {
    const referenced = {
      resourceType: 'Observation',
      id: 'adult-blood-pressure',
      status: 'final',
      code: { text: 'Blood Pressure' },
      effectiveDateTime: '2024-06-28T00:00:00+08:00',
      valueString: '130/90 mmHg',
    }
    const ordinary = {
      ...referenced,
      id: 'ordinary-blood-pressure',
      valueString: '120/80 mmHg',
    }
    const composition = {
      resourceType: 'Composition',
      type: { coding: [{ code: '75484-6' }] },
      section: [{ entry: [{ reference: 'Observation/adult-blood-pressure' }] }],
    }

    const { result } = renderHook(() =>
      useOrphanObservations(
        [referenced, ordinary],
        new Set<string>(),
        'standardized',
        [composition],
      ),
    )

    expect(result.current).toHaveLength(2)
    expect(result.current.filter((row) => row.sourceProgram === 'adult-preventive'))
      .toHaveLength(1)
  })
})
