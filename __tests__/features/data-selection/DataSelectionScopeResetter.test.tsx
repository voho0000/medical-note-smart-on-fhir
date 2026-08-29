import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

let mockAuthState: { user: { uid: string } | null; loading: boolean }
let mockPatientState: { patient: { id: string } | null }
let mockDataSourceState: { source: 'other' | 'local' | 'demo'; importId: string | null }

jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => mockPatientState,
}))

jest.mock('@/src/application/hooks/ai-generation/ai-data-source', () => ({
  useAiDataSource: () => mockDataSourceState,
}))

import {
  DataSelectionProvider,
  useDataSelection,
} from '@/src/application/providers/data-selection.provider'
import { DataSelectionScopeResetter } from '@/features/data-selection/DataSelectionScopeResetter'

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DataSelectionProvider>
      <DataSelectionScopeResetter />
      {children}
    </DataSelectionProvider>
  )
}

describe('DataSelectionScopeResetter', () => {
  beforeEach(() => {
    localStorage.clear()
    mockAuthState = { user: { uid: 'account-1' }, loading: false }
    mockPatientState = { patient: { id: 'patient-1' } }
    mockDataSourceState = { source: 'other', importId: null }
  })

  it('clears document picks when the patient or account changes', async () => {
    const { result, rerender } = renderHook(() => useDataSelection(), { wrapper })

    act(() => {
      result.current.setDocumentModeFor('aiExport', 'custom')
      result.current.setDocumentIdsFor('aiExport', ['patient-document-1'])
    })

    mockPatientState = { patient: { id: 'patient-2' } }
    rerender()
    await waitFor(() => expect(result.current.getProfile('aiExport').documentIds).toEqual([]))
    expect(result.current.getProfile('aiExport').documentMode).toBe('latestAdmission')

    act(() => {
      result.current.setDocumentModeFor('ips', 'custom')
      result.current.setDocumentIdsFor('ips', ['patient-document-2'])
    })
    mockAuthState = { user: { uid: 'account-2' }, loading: false }
    rerender()
    await waitFor(() => expect(result.current.getProfile('ips').documentIds).toEqual([]))
    expect(result.current.getProfile('ips').documentMode).toBe('latestAdmission')
  })

  it('treats each local import as a separate clinical scope', async () => {
    mockDataSourceState = { source: 'local', importId: 'import-1' }
    const { result, rerender } = renderHook(() => useDataSelection(), { wrapper })
    act(() => result.current.setDocumentIdsFor('chat', ['document-from-import-1']))

    mockDataSourceState = { source: 'local', importId: 'import-2' }
    rerender()

    await waitFor(() => expect(result.current.getProfile('chat').documentIds).toEqual([]))
  })
})
