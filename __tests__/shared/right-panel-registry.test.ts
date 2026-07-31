import { getEnabledRightPanelFeatures } from '@/src/shared/config/right-panel-registry'
import { groupRightPanelFeatures } from '@/src/application/stores/right-panel-tabs.store'

describe('right-panel registry', () => {
  it('keeps contextual data scope out of the primary feature tabs', () => {
    const featureIds = getEnabledRightPanelFeatures().map((feature) => feature.id)

    expect(featureIds).toEqual([
      'medical-summary',
      'medical-chat',
      'personalized-education',
      'medical-calculator',
      'clinical-decision-support',
      'ips-export',
      'settings',
    ])
    expect(featureIds).not.toContain('data-selection')
  })

  it('keeps education and CDSS as separate pinned modules', () => {
    const features = getEnabledRightPanelFeatures()
    const defaults = groupRightPanelFeatures(features, {})

    expect(defaults.overflowFeatures.map((feature) => feature.id)).toEqual([])
    expect(defaults.pinnedFeatures.map((feature) => feature.id)).toEqual([
      'medical-summary',
      'medical-chat',
      'personalized-education',
      'medical-calculator',
      'clinical-decision-support',
      'ips-export',
    ])

    const customized = groupRightPanelFeatures(features, { 'medical-calculator': false })
    expect(customized.overflowFeatures.map((feature) => feature.id)).toEqual([
      'medical-calculator',
    ])

    const pluggedIn = groupRightPanelFeatures([
      ...features,
      {
        id: 'future-feature',
        name: 'Future Feature',
        tabLabel: 'futureFeature',
        order: 99,
        enabled: true,
        pinned: false,
      },
    ], {})
    expect(pluggedIn.overflowFeatures.map((feature) => feature.id)).toEqual([
      'future-feature',
    ])
  })

  it('shows education to citizens and keeps CDSS medical-only', () => {
    const patientIds = getEnabledRightPanelFeatures('patient').map(
      (feature) => feature.id,
    )
    const medicalIds = getEnabledRightPanelFeatures('medical').map(
      (feature) => feature.id,
    )

    expect(patientIds).toContain('personalized-education')
    expect(patientIds).not.toContain('clinical-decision-support')
    expect(medicalIds).toContain('personalized-education')
    expect(medicalIds).toContain('clinical-decision-support')
  })

  it('lets medical summary scroll with the panel so only its card chips stay sticky', () => {
    const medicalSummary = getEnabledRightPanelFeatures().find(
      (feature) => feature.id === 'medical-summary',
    )

    expect(medicalSummary?.scrollMode).toBe('panel')
    expect(medicalSummary?.contentClassName?.split(' ')).not.toContain('min-h-0')
  })
})
