import {
  isCustomSummaryEditorTourStep,
  isCustomSummaryGalleryTourStep,
  isCustomSummaryTourStep,
  useRightFeatureTourStore,
} from '@/features/right-feature-tour/right-feature-tour.store'

describe('right feature tour store', () => {
  it('opens the custom view for every custom step and the editor only for its fields', () => {
    for (const step of ['custom-summary', 'custom-summary-edit', 'custom-summary-generate', 'custom-summary-read-result'] as const) {
      expect(isCustomSummaryTourStep(step)).toBe(true)
      expect(isCustomSummaryEditorTourStep(step)).toBe(false)
    }
    for (const step of ['custom-summary-fields', 'custom-summary-prompt', 'custom-summary-behavior', 'custom-summary-library'] as const) {
      expect(isCustomSummaryTourStep(step)).toBe(true)
      expect(isCustomSummaryEditorTourStep(step)).toBe(true)
    }
    for (const step of [null, 'summary-settings', 'chat', 'finish'] as const) {
      expect(isCustomSummaryTourStep(step)).toBe(false)
      expect(isCustomSummaryEditorTourStep(step)).toBe(false)
    }
  })

  beforeEach(() => {
    useRightFeatureTourStore.setState({
      active: false,
      stepId: null,
      session: 0,
      kind: 'quick',
      launcherOpen: false,
    })
  })

  it('starts a new tour session from the overview', () => {
    useRightFeatureTourStore.getState().start()

    expect(useRightFeatureTourStore.getState()).toMatchObject({
      active: true,
      stepId: 'overview',
      session: 1,
    })
  })

  it('updates the current step and stops cleanly', () => {
    useRightFeatureTourStore.getState().start()
    useRightFeatureTourStore.getState().setStep('chat-compose')
    expect(useRightFeatureTourStore.getState().stepId).toBe('chat-compose')

    useRightFeatureTourStore.getState().stop()
    expect(useRightFeatureTourStore.getState()).toMatchObject({
      active: false,
      stepId: null,
    })
  })

  it('opens a chapter catalogue without navigating and starts the selected chapter', () => {
    useRightFeatureTourStore.getState().openCustomSummaryGuide()
    expect(useRightFeatureTourStore.getState()).toMatchObject({ active: false, launcherOpen: true, stepId: null })
    useRightFeatureTourStore.getState().startCustomSummary('custom-summary-library')
    expect(useRightFeatureTourStore.getState()).toMatchObject({
      active: true, launcherOpen: false, kind: 'custom-summary', stepId: 'custom-summary-library', session: 1,
    })
    useRightFeatureTourStore.getState().stop()
    useRightFeatureTourStore.getState().start()
    expect(useRightFeatureTourStore.getState()).toMatchObject({ kind: 'quick', stepId: 'overview', session: 2 })
  })

  it('cancels the catalogue without starting a tour', () => {
    useRightFeatureTourStore.getState().openCustomSummaryGuide()
    useRightFeatureTourStore.getState().closeLauncher()
    expect(useRightFeatureTourStore.getState()).toMatchObject({ active: false, launcherOpen: false, session: 0 })
  })

  it('keeps the manager behind gallery steps but closes it before generating', () => {
    for (const step of ['custom-summary-gallery', 'custom-summary-gallery-search', 'custom-summary-gallery-preview'] as const) {
      expect(isCustomSummaryGalleryTourStep(step)).toBe(true)
      expect(isCustomSummaryEditorTourStep(step)).toBe(true)
    }
    expect(isCustomSummaryGalleryTourStep('custom-summary-library')).toBe(false)
    expect(isCustomSummaryEditorTourStep('custom-summary-finish')).toBe(false)
  })
})
