/**
 * A vital typed in the room reaches the pack only as a fact on the profile —
 * the pack is a pure function of it — so this checks the feature hands it
 * over, and stops handing it over once the patient changes.
 */
import { render, waitFor } from '@testing-library/react'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

const mockUsePatient = jest.fn()
const mockUseClinicalData = jest.fn()
const packBuildSpy = jest.fn()

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => mockUsePatient(),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockUseClinicalData(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

jest.mock('@/features/clinical-decision-support/guideline-packs/registry', () => {
  const stubPack = {
    id: 'stub-pack',
    label: { zh: '測試指引', en: 'Stub pack' },
    enabled: true,
    applies: () => true,
    notApplicable: () => ({ title: '不適用', body: '不適用' }),
    build: ({ profile }: { profile: unknown }) => {
      packBuildSpy(profile)
      return {
        title: '測試指引',
        summary: '',
        packId: 'stub-pack',
        packVersion: '0.0.0',
        recommendations: [],
        knowledgePacks: [],
      }
    },
  }
  return {
    getEnabledClinicalGuidelinePacks: () => [stubPack],
    getApplicableClinicalGuidelinePacks: () => [stubPack],
    getDefaultClinicalGuidelinePack: () => stubPack,
    getClinicalGuidelinePack: () => stubPack,
  }
})

jest.mock('@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView', () => ({
  ClinicalDecisionSupportView: () => <div data-testid="mock-cdss-result" />,
}))

function clinicalData() {
  return {
    conditions: [],
    encounters: [],
    observations: [],
    medications: [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    diagnosticReports: [],
    documentReferences: [],
    isLoading: false,
    isFetching: false,
    error: null,
    hasBlockingQueryIssues: false,
  }
}

function latestProfile(): CdssPatientProfile {
  return packBuildSpy.mock.calls.at(-1)?.[0] as CdssPatientProfile
}

describe('clinic vitals reach the pack through the profile', () => {
  beforeEach(() => {
    packBuildSpy.mockClear()
    useClinicVitalsStore.setState({ byPatientId: {} })
    mockUseClinicalData.mockReturnValue(clinicalData())
    mockUsePatient.mockReturnValue({
      patient: { id: 'vitals-patient', resourceType: 'Patient', age: 70 },
      loading: false,
      error: null,
    })
  })

  it('is a fact on the profile for this patient only', async () => {
    useClinicVitalsStore.getState().setVitals('vitals-patient', {
      systolic: 126, diastolic: 78, heartRate: 68, bodyWeight: 72, measuredOn: '2026-09-05',
    })
    const view = render(<LiveClinicalDecisionSupportFeature />)
    await waitFor(() => expect(packBuildSpy).toHaveBeenCalled())

    const profile = latestProfile()
    expect(profile.facts.bloodPressure?.zh).toBe('126/78 mmHg（2026-09-05 門診輸入）')
    expect(profile.facts.heartRate?.numericValue).toBe(68)
    expect(profile.facts.bodyWeight?.numericValue).toBe(72)
    expect(profile.freshnessContexts?.heartRate?.state).toBe('current')

    view.unmount()
    packBuildSpy.mockClear()
    mockUsePatient.mockReturnValue({
      patient: { id: 'another-patient', resourceType: 'Patient', age: 60 },
      loading: false,
      error: null,
    })
    render(<LiveClinicalDecisionSupportFeature />)
    await waitFor(() => expect(packBuildSpy).toHaveBeenCalled())
    expect(latestProfile().facts.bloodPressure).toBeUndefined()
    expect(latestProfile().facts.heartRate).toBeUndefined()
  })
})
