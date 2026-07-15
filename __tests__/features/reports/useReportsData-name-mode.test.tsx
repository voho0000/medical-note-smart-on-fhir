import { renderHook } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { useReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'
import type { AnalyteNameMode } from '@/src/shared/utils/lab-normalize'

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>
    <AudienceProvider>{children}</AudienceProvider>
  </LanguageProvider>
)

const atypicalLymphocyte = {
  resourceType: 'Observation',
  id: 'obs-atypical-lym',
  code: {
    text: 'Lym',
    coding: [
      {
        system: 'http://loinc.org',
        code: '736-9',
        display: 'Lymphocytes/Leukocytes in Blood by Automated count',
      },
      {
        system: 'https://example.org/CodeSystem/his-local-lab',
        code: 'ATY-LYM',
        display: 'Atypical lym.',
      },
    ],
  },
  effectiveDateTime: '2026-07-15',
  valueQuantity: { value: 2, unit: '%' },
}

const report = {
  resourceType: 'DiagnosticReport',
  id: 'dr-atypical-lym',
  status: 'final',
  code: { text: '白血球分類計數' },
  category: [{ coding: [{ code: 'LAB' }], text: 'Laboratory' }],
  effectiveDateTime: '2026-07-15',
  _observations: [atypicalLymphocyte],
}

const chestXrayReport = {
  resourceType: 'DiagnosticReport',
  id: 'dr-chest-xray',
  status: 'final',
  code: {
    text: '胸部檢查',
    coding: [{ system: 'https://www.nhi.gov.tw', code: '32001C' }],
  },
  category: [{ coding: [{ code: 'RAD' }], text: 'Imaging' }],
  effectiveDateTime: '2026-07-15',
  conclusion: 'No acute cardiopulmonary abnormality.',
}

function run(nameMode: AnalyteNameMode) {
  const { result } = renderHook(
    () => useReportsData([report], [], nameMode),
    { wrapper: Wrapper },
  )
  return result.current.reportRows[0]
}

describe('useReportsData report name mode', () => {
  it('keeps the existing clinical short name by default', () => {
    expect(run('standardized').title).toBe('LYM')
  })

  it('shows the hospital source display in original mode', () => {
    expect(run('original').title).toBe('Atypical lym.')
  })

  it('switches an imaging order between the source and normalized titles', () => {
    const standardized = renderHook(
      () => useReportsData([chestXrayReport], [], 'standardized'),
      { wrapper: Wrapper },
    ).result.current.reportRows[0]
    const original = renderHook(
      () => useReportsData([chestXrayReport], [], 'original'),
      { wrapper: Wrapper },
    ).result.current.reportRows[0]

    expect(standardized.title).toBe('Chest X-ray')
    expect(original.title).toBe('胸部檢查')
  })
})
