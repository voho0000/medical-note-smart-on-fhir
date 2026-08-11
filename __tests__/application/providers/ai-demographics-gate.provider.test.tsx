import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  AiDemographicsGateProvider,
  useAiDemographicsGate,
} from '@/src/application/providers/ai-demographics-gate.provider'
import { AiDemographicsGateDialog } from '@/features/medical-summary/components/AiDemographicsGateDialog'

let mockPatient: any
let mockSourceMetadata: any
let mockAutoConsent: any
let mockLocalProfile: any
const mockSaveProfile = jest.fn().mockResolvedValue(undefined)

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({
    patient: mockPatient,
    loading: false,
    error: null,
  }),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ sourceMetadata: mockSourceMetadata }),
}))

jest.mock('@/src/application/hooks/ai-generation/auto-ai-consent', () => ({
  useAutoAiConsentState: () => mockAutoConsent,
}))

jest.mock('@/src/application/hooks/patient/use-local-patient-profile.hook', () => ({
  useLocalPatientProfile: () => mockLocalProfile,
}))

jest.mock(
  '@/features/clinical-summary/patient-info/components/PatientDemographicsEditorDialog',
  () => ({
    PatientDemographicsEditorDialog: ({
      onOpenChange,
      onSave,
      requiredForAi,
    }: {
      onOpenChange: (open: boolean) => void
      onSave: (profile: any) => Promise<void>
      requiredForAi?: boolean
    }) => (
      <div role="dialog" data-required-for-ai={String(Boolean(requiredForAi))}>
        <button type="button" onClick={() => onOpenChange(false)}>取消填寫</button>
        <button
          type="button"
          onClick={() => void onSave({
            source: 'user-entered',
            gender: 'female',
            birthDate: '1980',
            updatedAt: '2026-07-31T00:00:00.000Z',
          })}
        >
          儲存資料
        </button>
      </div>
    ),
  }),
)

function ManualGenerationProbe() {
  const gate = useAiDemographicsGate()
  const [outcome, setOutcome] = useState('')
  return (
    <div>
      <span data-testid="ready">{String(gate.demographicsReadyForAi)}</span>
      <button
        type="button"
        onClick={() => {
          void gate.requestDemographicsForAi().then((accepted) => {
            setOutcome(accepted ? 'generated' : 'cancelled')
          })
        }}
      >
        產生摘要
      </button>
      <span data-testid="outcome">{outcome}</span>
    </div>
  )
}

function renderGate(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('AiDemographicsGateProvider', () => {
  beforeEach(() => {
    mockSaveProfile.mockClear()
    mockPatient = {
      id: 'sdk-patient',
      gender: 'unknown',
      birthDate: undefined,
    }
    mockSourceMetadata = { source: 'health-bank-sdk-json' }
    mockAutoConsent = {
      source: 'local',
      decision: 'manual',
      importId: 'import-1',
    }
    mockLocalProfile = {
      available: true,
      importId: 'import-1',
      profile: null,
      saving: false,
      saveProfile: mockSaveProfile,
    }
  })

  it('keeps manual SDK imports visible without opening the editor', () => {
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    expect(screen.getByTestId('ready')).toHaveTextContent('false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the editor when a user manually generates a summary', async () => {
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '產生摘要' }))
    expect(await screen.findByRole('dialog')).toHaveAttribute(
      'data-required-for-ai',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: '取消填寫' }))
    await waitFor(() => {
      expect(screen.getByTestId('outcome')).toHaveTextContent('cancelled')
    })
    expect(mockSaveProfile).not.toHaveBeenCalled()
  })

  it('opens automatically only after automatic summary is selected', async () => {
    mockAutoConsent = {
      source: 'local',
      decision: 'auto',
      importId: 'import-1',
    }
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('resumes the pending manual generation after demographics are saved', async () => {
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '產生摘要' }))
    fireEvent.click(await screen.findByRole('button', { name: '儲存資料' }))

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(expect.objectContaining({
        gender: 'female',
        birthDate: '1980',
      }))
      expect(screen.getByTestId('outcome')).toHaveTextContent('generated')
    })
  })

  it('also gates non-SDK local FHIR data when demographics are missing', async () => {
    mockSourceMetadata = undefined
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '產生摘要' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('does not gate valid demographics, including a year-only birth date', async () => {
    mockPatient = {
      id: 'fhir-patient',
      gender: 'male',
      birthDate: '1980',
    }
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '產生摘要' }))
    await waitFor(() => {
      expect(screen.getByTestId('outcome')).toHaveTextContent('generated')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses a session-only profile for non-local data without writing a Bundle', async () => {
    mockAutoConsent = {
      source: 'other',
      decision: 'manual',
      importId: null,
    }
    mockLocalProfile = {
      ...mockLocalProfile,
      available: false,
      importId: null,
    }
    renderGate(
      <AiDemographicsGateProvider>
        <ManualGenerationProbe />
        <AiDemographicsGateDialog />
      </AiDemographicsGateProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '產生摘要' }))
    fireEvent.click(await screen.findByRole('button', { name: '儲存資料' }))

    await waitFor(() => {
      expect(screen.getByTestId('outcome')).toHaveTextContent('generated')
      expect(screen.getByTestId('ready')).toHaveTextContent('true')
    })
    expect(mockSaveProfile).not.toHaveBeenCalled()
  })
})
