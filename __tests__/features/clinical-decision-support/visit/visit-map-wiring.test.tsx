/**
 * How LiveFeature feeds the decision map: the default layout per pack, the
 * atrial-fibrillation companion on the heart-failure page, the every-visit
 * answers entering the profile, and the fall-back to three sections whenever
 * there is no model. The model builder is the pack's; here it is a stand-in
 * that records what it was given.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { CARE_PACKS } from '@voho0000/personalized-care'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'
import {
  GUEST_BETA_FEATURES_KEY,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'
import { useCdssLayoutStore } from '@/features/clinical-decision-support/stores/layout-preference.store'
import { useVisitAnswersStore } from '@/features/clinical-decision-support/stores/visit-answers.store'
import type {
  BuildVisitDecisionModelInput,
  VisitAnswers,
  VisitDecisionModel,
} from '@/features/clinical-decision-support/types'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

const mockBuildVisitModel = jest.fn<VisitDecisionModel | undefined, [BuildVisitDecisionModelInput]>()
const mockApplyVisitAnswers = jest.fn((profile: CdssPatientProfile, answers: VisitAnswers) => {
  void answers
  return profile
})

jest.mock('@/features/clinical-decision-support/renderers/visit/visit-model.source', () => ({
  isVisitModelSupported: () => true,
  buildVisitModel: (input: BuildVisitDecisionModelInput) => mockBuildVisitModel(input),
  applyVisitAnswers: (profile: CdssPatientProfile, answers: VisitAnswers) => mockApplyVisitAnswers(profile, answers),
}))

jest.mock('@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook', () => ({
  useNhiLipidAiAssist: () => ({
    suggestions: {}, decisions: {}, isRunning: false, isDataReady: false, error: null,
    modelId: 'test', modelName: 'Test', run: jest.fn(async () => undefined), decide: jest.fn(),
  }),
}))

const mockUsePatient = jest.fn()
const mockUseClinicalData = jest.fn()
jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({ usePatient: () => mockUsePatient() }))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: () => mockUseClinicalData() }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW' }) }))

jest.mock('@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView', () => ({
  ClinicalDecisionSupportView: ({
    result,
    layout,
    visitModel,
    companionResult,
    onVisitAnswer,
  }: {
    result: { packId: string }
    layout?: string
    visitModel?: { packId: string }
    companionResult?: { packId: string }
    onVisitAnswer?: (id: string, value: string | null) => void
  }) => (
    <div
      data-testid="mock-cdss-result"
      data-pack={result.packId}
      data-layout={layout}
      data-model={visitModel?.packId ?? ''}
      data-companion={companionResult?.packId ?? ''}
    >
      <button type="button" onClick={() => onVisitAnswer?.('dyspnoea-trend', 'worse')}>answer</button>
    </div>
  ),
}))

const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm'
const PATIENT_ID = 'map-patient'

function model(packId: string): VisitDecisionModel {
  return {
    packId, stage: 'follow-up', triggers: [], headline: 'headline', keyValues: [], asks: [],
    queue: [], points: [], coverage: { total: 0, included: 0 },
  }
}

function clinicalData(codes: string[]) {
  return {
    conditions: [],
    encounters: [{
      id: 'enc-1',
      status: 'finished',
      period: { start: '2026-06-25T00:00:00+08:00' },
      reasonCode: codes.map((code) => ({ coding: [{ system: ICD10, code }] })),
    }],
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

function view() {
  return screen.getByTestId('mock-cdss-result')
}

describe('decision map wiring', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockBuildVisitModel.mockReset()
    mockApplyVisitAnswers.mockClear()
    mockBuildVisitModel.mockImplementation((input) => model(input.packId))
    useCdssLayoutStore.setState({ layout: null })
    useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
    useBetaFeaturesStore.setState({ enabledByUser: {} })
    useBetaFeaturesStore.getState().setBetaFeaturesEnabled(GUEST_BETA_FEATURES_KEY, true)
    mockUsePatient.mockReturnValue({ patient: { id: PATIENT_ID, resourceType: 'Patient', age: 74 }, loading: false, error: null })
    mockUseClinicalData.mockReturnValue(clinicalData(['I50.22', 'I48.91', 'E78.5']))
  })

  it('opens heart failure on the decision map, with the AF result as its companion', () => {
    render(<LiveClinicalDecisionSupportFeature />)
    expect(view()).toHaveAttribute('data-pack', 'heart-failure-cdss')
    expect(view()).toHaveAttribute('data-layout', 'map')
    expect(view()).toHaveAttribute('data-model', 'heart-failure-cdss')
    expect(view()).toHaveAttribute('data-companion', 'atrial-fibrillation-cdss')
    const input = mockBuildVisitModel.mock.calls.at(-1)![0]
    expect(input.packId).toBe('heart-failure-cdss')
    expect(input.companion?.packId).toBe('atrial-fibrillation-cdss')
    expect(input.locale).toBe('zh-TW')

    expect(screen.getByTestId('cdss-layout-switch-map')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('cdss-layout-switch-map')).toHaveTextContent('決策地圖')
    for (const kept of ['sections', 'flow', 'board']) {
      expect(screen.getByTestId(`cdss-layout-switch-${kept}`)).toBeInTheDocument()
    }
    // Nothing in the header is hidden by the map: the module counts stay.
    // The header's 優先／需資料 counts are left out on the map: 今天要決定 says it, item by item.
    expect(screen.queryByText(/\d+ 優先$/)).toBeNull()
    expect(screen.getByTestId('cdss-hf-reset-page-defaults')).toBeInTheDocument()
  })

  it('keeps a browser that chose a layout on it', () => {
    useCdssLayoutStore.setState({ layout: 'sections' })
    render(<LiveClinicalDecisionSupportFeature />)
    expect(view()).toHaveAttribute('data-layout', 'sections')
    expect(view()).toHaveAttribute('data-model', '')
    // The map is not built for a page that is not showing it.
    expect(mockBuildVisitModel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('cdss-layout-switch-map'))
    expect(view()).toHaveAttribute('data-layout', 'map')
  })

  it('falls back to three sections, and stops offering the map, when the model cannot be built', () => {
    mockBuildVisitModel.mockReturnValue(undefined)
    render(<LiveClinicalDecisionSupportFeature />)
    expect(view()).toHaveAttribute('data-layout', 'sections')
    expect(screen.queryByTestId('cdss-layout-switch-map')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-layout-switch-sections')).toHaveAttribute('aria-pressed', 'true')
  })

  it('leaves heart failure standing when the AF companion cannot be built', () => {
    const afPack = CARE_PACKS.find((pack) => pack.id === 'atrial-fibrillation-cdss')!
    const build = jest.spyOn(afPack, 'build').mockImplementation(() => { throw new Error('AF broke') })
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      render(<LiveClinicalDecisionSupportFeature />)
      expect(view()).toHaveAttribute('data-layout', 'map')
      expect(view()).toHaveAttribute('data-companion', '')
      expect(mockBuildVisitModel.mock.calls.at(-1)![0].companion).toBeUndefined()
    } finally {
      build.mockRestore()
      error.mockRestore()
    }
  })

  it('builds no companion when the AF pathway is not visible in this browser', () => {
    // Atrial fibrillation ships unreleased; without Beta it is not listed.
    useBetaFeaturesStore.setState({ enabledByUser: {} })
    render(<LiveClinicalDecisionSupportFeature />)
    expect(screen.queryByTestId('cdss-disease-switch-atrial-fibrillation-cdss')).not.toBeInTheDocument()
    expect(view()).toHaveAttribute('data-layout', 'map')
    expect(view()).toHaveAttribute('data-companion', '')
  })

  it('opens atrial fibrillation on its map, beside its own three-section flow', () => {
    render(<LiveClinicalDecisionSupportFeature />)
    fireEvent.click(screen.getByTestId('cdss-disease-switch-atrial-fibrillation-cdss'))
    expect(view()).toHaveAttribute('data-pack', 'atrial-fibrillation-cdss')
    expect(view()).toHaveAttribute('data-layout', 'map')
    expect(view()).toHaveAttribute('data-companion', '')
    expect(screen.getByTestId('cdss-layout-switch-map')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-layout-switch-sections')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-layout-switch-flow')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cdss-layout-switch-sections'))
    expect(view()).toHaveAttribute('data-layout', 'sections')
  })

  it('leaves dyslipidemia on three sections', () => {
    render(<LiveClinicalDecisionSupportFeature />)
    fireEvent.click(screen.getByTestId('cdss-disease-switch-hyperlipidemia-cdss'))
    expect(view()).toHaveAttribute('data-layout', 'sections')
    expect(screen.queryByTestId('cdss-layout-switch-map')).not.toBeInTheDocument()
  })

  it('carries an every-visit answer into the profile through the pack, and resets it with the page', () => {
    render(<LiveClinicalDecisionSupportFeature />)
    fireEvent.click(screen.getByRole('button', { name: 'answer' }))
    expect(useVisitAnswersStore.getState().byPatientId[PATIENT_ID]?.['dyspnoea-trend']?.value).toBe('worse')
    expect(mockApplyVisitAnswers.mock.calls.at(-1)![1]).toEqual({ 'dyspnoea-trend': 'worse' })

    fireEvent.click(screen.getByTestId('cdss-hf-reset-page-defaults'))
    expect(useVisitAnswersStore.getState().byPatientId[PATIENT_ID]).toEqual({})
    expect(mockApplyVisitAnswers.mock.calls.at(-1)![1]).toEqual({})
  })
})
