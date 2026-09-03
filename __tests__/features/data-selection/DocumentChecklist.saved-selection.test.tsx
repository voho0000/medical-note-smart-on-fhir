import { fireEvent, render, screen } from '@testing-library/react'
import { DocumentChecklist } from '@/features/data-selection/components/DocumentChecklist'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import type { ConsumerProfile } from '@/src/application/providers/data-selection.provider'

let mockProfile: ConsumerProfile
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW', t: zhTW }) }))
jest.mock('@/src/application/providers/data-selection.provider', () => ({ useDataSelection: () => ({
  getProfile: () => mockProfile,
  documentMode: mockProfile.documentMode,
  documentIds: mockProfile.documentIds,
  setDocumentMode: (documentMode: ConsumerProfile['documentMode']) => { mockProfile = { ...mockProfile, documentMode } },
  setDocumentIds: (documentIds: string[]) => { mockProfile = { ...mockProfile, documentIds } },
}) }))
const clinicalData = {
  compositions: [1, 2, 3].map(id => ({
    id: `doc-${id}`, title: `Discharge ${id}`, date: `2026-08-0${id}`,
    type: { coding: [{ code: '18842-5' }] }, section: [],
  })),
} as any

beforeEach(() => {
  mockProfile = { selection: ALL_DATA_SELECTION, filters: ALL_DATA_FILTERS, documentMode: 'custom', documentIds: ['doc-1', 'doc-2'] }
})

it('keeps excluded picks checked and preserves them when selecting another document', () => {
  const { container, rerender } = render(<DocumentChecklist clinicalData={clinicalData} includedDocumentIds={['doc-1']} />)
  const checkbox = (id: string) => container.querySelector(`input[data-document-id="${id}"]`)!
  expect(checkbox('doc-2')).toBeChecked()
  expect(checkbox('doc-2').closest('label')).toHaveTextContent('已選取；未納入本次模型範圍')
  fireEvent.click(checkbox('doc-3'))
  expect(mockProfile.documentIds).toEqual(expect.arrayContaining(['doc-1', 'doc-2', 'doc-3']))
  rerender(<DocumentChecklist clinicalData={clinicalData} includedDocumentIds={['doc-3']} />)
  expect(screen.getAllByRole('checkbox').every(input => (input as HTMLInputElement).checked)).toBe(true)
  fireEvent.click(checkbox('doc-2'))
  expect(mockProfile.documentIds).toEqual(expect.arrayContaining(['doc-1', 'doc-3']))
  expect(mockProfile.documentIds).not.toContain('doc-2')
})

it('hides stale exclusion labels during fitting without clearing saved checks', () => {
  render(<DocumentChecklist clinicalData={clinicalData} includedDocumentIds={[]} scopePending />)
  expect(screen.getAllByRole('checkbox').filter(input => (input as HTMLInputElement).checked)).toHaveLength(2)
  expect(screen.queryByText('已選取；未納入本次模型範圍')).not.toBeInTheDocument()
})
