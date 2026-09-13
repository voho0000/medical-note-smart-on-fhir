import { fireEvent, render, screen } from '@testing-library/react'
import { EchoReportButton } from '@/features/clinical-decision-support/renderers/EchoReportButton'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: jest.fn() }))
const report = (id: string, date: string, conclusion: string) => ({ id, status: 'final', effectiveDateTime: date, code: { text: 'Echocardiography' }, conclusion })
test('opens the matching report, preserving line breaks, without selecting a newer report', () => {
  jest.mocked(useClinicalData).mockReturnValue({ diagnosticReports: [report('original', '2024-09-09', 'Echocardiography\rLVEF 72.6%'), report('newer', '2025-01-01', 'Echocardiography LVEF 60%')], isLoading: false } as ReturnType<typeof useClinicalData>)
  render(<EchoReportButton metric={{ factKey: 'LVEF', label: 'LVEF', date: '2024-09-09', kind: 'measure', stale: false, entered: false, evaluated: true }} isEnglish={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '心超報告' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('72.6%')
  expect(screen.getByRole('dialog')).not.toHaveTextContent('60%')
  expect(screen.getByText('顯示原始報告')).toBeInTheDocument()
})
test('shows a missing state rather than a different date report', () => {
  jest.mocked(useClinicalData).mockReturnValue({ diagnosticReports: [report('other', '2025-01-01', 'Echocardiography LVEF 60%')], isLoading: false } as ReturnType<typeof useClinicalData>)
  render(<EchoReportButton metric={{ factKey: 'LVEF', label: 'LVEF', date: '2024-09-09', kind: 'measure', stale: false, entered: false, evaluated: true }} isEnglish={false} />)
  fireEvent.click(screen.getByRole('button', { name: '心超報告' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('沒有找到對應')
})

test('ECG button opens its exact source rather than another ECG from the same day', () => {
  jest.mocked(useClinicalData).mockReturnValue({ diagnosticReports: [
    { ...report('ecg-a', '2026-05-25', 'Sinus bradycardia'), code: { text: 'ECG' } },
    { ...report('ecg-b', '2026-05-25', 'Atrial fibrillation'), code: { text: 'ECG' } },
  ], isLoading: false } as ReturnType<typeof useClinicalData>)
  render(<EchoReportButton ecg metric={{ factKey: 'rhythm', label: 'Rhythm', date: '2026-05-25', kind: 'measure', stale: false, entered: false, evaluated: true, evidence: { label: 'ECG', value: 'sinus', factKeys: [], sources: [{ resourceType: 'DiagnosticReport', resourceId: 'ecg-a' }] } }} isEnglish={false} />)
  fireEvent.click(screen.getByRole('button', { name: '心電圖報告' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Sinus bradycardia')
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Atrial fibrillation')
})
