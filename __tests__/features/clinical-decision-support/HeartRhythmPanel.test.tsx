import { render, screen, fireEvent } from '@testing-library/react'
import { HeartRhythmPanel } from '@/features/clinical-decision-support/renderers/HeartRhythmPanel'
import { RecordValuesEditor } from '@/features/clinical-decision-support/renderers/RecordValuesEditor'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: jest.fn() }))

test('hides the report button when the record contains no ECG report', () => {
  jest.mocked(useClinicalData).mockReturnValue({ diagnosticReports: [] } as unknown as ReturnType<typeof useClinicalData>)

  render(<HeartRhythmPanel isEnglish={false} />)

  expect(screen.getByText('紀錄無值')).toBeInTheDocument()
  expect(screen.getByText('查無心電圖報告')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '心電圖報告' })).not.toBeInTheDocument()
})

test('keeps the report button when an ECG exists but its rhythm cannot be parsed', () => {
  jest.mocked(useClinicalData).mockReturnValue({
    diagnosticReports: [{
      resourceType: 'DiagnosticReport',
      id: 'ecg-unparsed',
      status: 'final',
      effectiveDateTime: '2026-05-25',
      code: { text: 'ECG' },
      conclusion: 'Technical tracing available; interpretation pending.',
    }],
  } as unknown as ReturnType<typeof useClinicalData>)

  render(<HeartRhythmPanel isEnglish={false} />)

  expect(screen.getByText('未能從報告辨識心律')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '心電圖報告' })).toBeInTheDocument()
  expect(screen.queryByText('查無心電圖報告')).not.toBeInTheDocument()
})
test('shared editor saves and resets rhythm with other clinical values', () => {
  const save = jest.fn(), rhythm = jest.fn()
  render(<RecordValuesEditor metrics={[]} isEnglish={false} now={new Date('2026-09-12T12:00:00')} onSave={save} onClose={() => {}} onSaveRhythm={rhythm} />)
  fireEvent.change(screen.getByLabelText('心律'), { target: { value: 'af' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
  expect(rhythm).toHaveBeenCalledWith({ rhythm: { value: 'af', measuredOn: '2026-09-12' } })
  fireEvent.click(screen.getByRole('button', { name: '全部恢復預設' }))
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
  expect(rhythm).toHaveBeenLastCalledWith({ rhythm: null })
})

test('groups editable values in clinical reading order', () => {
  render(<RecordValuesEditor metrics={[
    { factKey: 'potassium', label: 'K', kind: 'lab', value: '4.2', date: '2026-07-06', stale: false, entered: false, evaluated: true },
    { factKey: 'LVEF', label: 'LVEF', kind: 'measure', value: '28', date: '2026-07-08', stale: false, entered: false, evaluated: true },
    { factKey: 'bloodPressure', label: '血壓', kind: 'measure', value: '142/84', date: '2026-04-18', stale: true, entered: false, evaluated: true },
  ]} isEnglish={false} now={new Date('2026-09-12T12:00:00')} onSave={() => {}} onClose={() => {}} onSaveRhythm={() => {}} />)

  const standalone = screen.getByTestId('record-values-standalone')
  const labs = screen.getByTestId('record-values-section-labs')
  const vitals = screen.getByTestId('record-values-section-vitals')
  expect(standalone).toHaveTextContent('LVEF')
  expect(standalone).toHaveTextContent('心律')
  expect(labs).toHaveTextContent('抽血檢驗')
  expect(vitals).toHaveTextContent('生命徵象')
  expect(standalone.compareDocumentPosition(labs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(labs.compareDocumentPosition(vitals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
