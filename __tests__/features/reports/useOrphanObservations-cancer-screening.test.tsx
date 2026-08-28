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
})
