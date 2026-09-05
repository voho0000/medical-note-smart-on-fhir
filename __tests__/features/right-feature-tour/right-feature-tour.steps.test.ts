import { getRightTourSteps } from '@/features/right-feature-tour/right-feature-tour.steps'
import { CUSTOM_SUMMARY_CHAPTERS, isCustomSummaryEditorTourStep } from '@/features/right-feature-tour/right-feature-tour.store'

const guest = { medical: true, authenticated: false, betaEnabled: false }

describe('tour catalogue', () => {
  it('keeps just one custom-summary introduction in Quick tour and never opens its editor', () => {
    const steps = getRightTourSteps('quick', guest)
    expect(steps.filter((step) => step.id.startsWith('custom-summary')).map((step) => step.id)).toEqual(['custom-summary'])
    expect(steps.some((step) => isCustomSummaryEditorTourStep(step.id))).toBe(false)
    expect(steps[0].id).toBe('overview')
    expect(steps.at(-1)?.id).toBe('finish')
    expect(steps.find((step) => step.id === 'custom-summary')?.body['zh-TW']).toContain('專屬導覽')
  })

  it('has a valid jump target for each chapter and skips only the signed-in sharing form for guests', () => {
    const guestSteps = getRightTourSteps('custom-summary', guest)
    const signedSteps = getRightTourSteps('custom-summary', { ...guest, authenticated: true })
    const ids = guestSteps.map((step) => step.id)
    expect(guestSteps).toHaveLength(13)
    expect(signedSteps).toHaveLength(14)
    expect(signedSteps.filter((step) => !ids.includes(step.id)).map((step) => step.id)).toEqual(['custom-summary-share-form'])
    expect(ids.at(-1)).toBe('custom-summary-finish')
    expect(ids).toContain('custom-summary-read-result')
    for (const chapter of CUSTOM_SUMMARY_CHAPTERS) expect(ids).toContain(chapter.step)
    for (const step of signedSteps) {
      expect(step.id.startsWith('custom-summary')).toBe(true)
      expect(step.title.en).toBeTruthy()
      expect(step.body['zh-TW']).toBeTruthy()
    }
  })

  it('resolves the fixed expanded-view action immediately when no result exists', () => {
    const steps = getRightTourSteps('custom-summary', {
      medical: true,
      authenticated: false,
      betaEnabled: false,
    })
    const readResult = steps.find((step) => step.id === 'custom-summary-read-result')

    expect(readResult?.fallbackTarget).toContain('data-result-available="false"')
    expect(readResult?.fallbackGraceAttempts).toBe(0)
  })

  it('keeps medical-only and opt-in beta tools out of ineligible Quick tours', () => {
    expect(getRightTourSteps('quick', { ...guest, medical: false }).some((step) => step.medicalOnly)).toBe(false)
    // Beta needs no account, so neither does the step that points at the tab
    // Beta reveals — a signed-out visitor with the switch on sees both.
    expect(getRightTourSteps('quick', { ...guest, betaEnabled: true }).some((step) => step.id === 'guidance')).toBe(true)
    expect(getRightTourSteps('quick', { ...guest, authenticated: true, betaEnabled: true }).some((step) => step.id === 'guidance')).toBe(true)
    expect(getRightTourSteps('quick', guest).some((step) => step.betaOnly)).toBe(false)
  })
})
