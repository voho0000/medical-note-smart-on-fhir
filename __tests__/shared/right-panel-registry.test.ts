import { getEnabledRightPanelFeatures } from '@/src/shared/config/right-panel-registry'
import { groupRightPanelFeatures } from '@/src/application/stores/right-panel-tabs.store'

describe('right-panel registry', () => {
  it('keeps contextual data scope out of the primary feature tabs', () => {
    const featureIds = getEnabledRightPanelFeatures().map((feature) => feature.id)

    expect(featureIds).toEqual([
      'medical-summary',
      'medical-chat',
      'medical-calculator',
      'ips-export',
      'settings',
    ])
    expect(featureIds).not.toContain('data-selection')
    expect(featureIds).not.toContain('personalized-education')
    expect(featureIds).not.toContain('clinical-decision-support')
    expect(getEnabledRightPanelFeatures().find((feature) => feature.id === 'settings')?.iconOnly)
      .not.toBe(true)
  })

  it('keeps education and CDSS as separate pinned modules', () => {
    const features = getEnabledRightPanelFeatures(undefined, {
      betaFeaturesEnabled: true,
      isAuthenticated: true,
    })
    const defaults = groupRightPanelFeatures(features, {})

    expect(defaults.overflowFeatures.map((feature) => feature.id)).toEqual([])
    expect(defaults.pinnedFeatures.map((feature) => feature.id)).toEqual([
      'medical-summary',
      'medical-chat',
      'medical-calculator',
      'personalized-education',
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

  it('shows each audience its Beta tab only after the user opts in', () => {
    expect(getEnabledRightPanelFeatures('patient').map((feature) => feature.id))
      .not.toContain('personalized-education')
    expect(getEnabledRightPanelFeatures('medical').map((feature) => feature.id))
      .not.toContain('clinical-decision-support')
    expect(getEnabledRightPanelFeatures('patient', {
      betaFeaturesEnabled: true,
      isAuthenticated: false,
    }).map((feature) => feature.id)).not.toContain('personalized-education')

    const patientIds = getEnabledRightPanelFeatures('patient', {
      betaFeaturesEnabled: true,
      isAuthenticated: true,
    }).map(
      (feature) => feature.id,
    )
    const medicalIds = getEnabledRightPanelFeatures('medical', {
      betaFeaturesEnabled: true,
      isAuthenticated: true,
    }).map(
      (feature) => feature.id,
    )

    expect(patientIds).toContain('personalized-education')
    expect(patientIds).not.toContain('clinical-decision-support')
    expect(medicalIds).not.toContain('personalized-education')
    expect(medicalIds).toContain('clinical-decision-support')

    expect(patientIds.indexOf('personalized-education')).toBe(
      patientIds.indexOf('medical-calculator') + 1,
    )
    expect(medicalIds.indexOf('clinical-decision-support')).toBe(
      medicalIds.indexOf('medical-calculator') + 1,
    )

    expect(
      getEnabledRightPanelFeatures('patient', {
        betaFeaturesEnabled: true,
        isAuthenticated: true,
      }).find(
        (feature) => feature.id === 'personalized-education',
      )?.badge,
    ).toBe('Beta')
    expect(
      getEnabledRightPanelFeatures('medical', {
        betaFeaturesEnabled: true,
        isAuthenticated: true,
      }).find(
        (feature) => feature.id === 'clinical-decision-support',
      )?.badge,
    ).toBe('Beta')
  })

  it('keeps the personalized-education result mounted across tab switches', () => {
    const education = getEnabledRightPanelFeatures(undefined, {
      betaFeaturesEnabled: true,
      isAuthenticated: true,
    }).find(
      (feature) => feature.id === 'personalized-education',
    )

    expect(education?.forceMount).toBe(true)
  })

  it('lets medical summary scroll with the panel so only its card chips stay sticky', () => {
    const medicalSummary = getEnabledRightPanelFeatures().find(
      (feature) => feature.id === 'medical-summary',
    )

    expect(medicalSummary?.scrollMode).toBe('panel')
    expect(medicalSummary?.contentClassName?.split(' ')).not.toContain('min-h-0')
  })
})
