/**
 * A local development server may list the packs of the rules branch it was
 * started on, ahead of the host's own. The list is read once, at module load,
 * from `NEXT_PUBLIC_HMC_DEV_EXTRA_PACKS`, and only when NODE_ENV is
 * development — a deployed build lists exactly heart failure then CKD whatever
 * the variable says. An extra pack is still subject to the visibility rule:
 * unreleased guidance needs Beta, and the unattended Medcloud hand-off shows
 * released guidance only.
 */
let mockMedcloudLaunchRoute = false

jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  isMedcloudLaunchRoute: () => mockMedcloudLaunchRoute,
}))

jest.mock('@/src/application/launch/medcloud-launch-context', () => ({
  ...jest.requireActual('@/src/application/launch/medcloud-launch-context'),
  isVghtpeUnattendedLaunch: () => false,
}))

type Registry = typeof import('@/features/clinical-decision-support/guideline-packs/registry')
type BetaStore = typeof import('@/src/application/stores/beta-features.store')

const HOST_PACK_IDS = ['heart-failure-cdss', 'ckd-cdss']

/** A fresh module graph loaded under the given environment. */
function load(nodeEnv: string, extraPacks?: string): { registry: Registry; beta: BetaStore } {
  const original = process.env
  const env: Record<string, string | undefined> = { ...original, NODE_ENV: nodeEnv }
  if (extraPacks === undefined) delete env.NEXT_PUBLIC_HMC_DEV_EXTRA_PACKS
  else env.NEXT_PUBLIC_HMC_DEV_EXTRA_PACKS = extraPacks
  process.env = env as NodeJS.ProcessEnv
  try {
    let loaded: { registry: Registry; beta: BetaStore } | undefined
    // The list is read at module load, so each case needs its own module graph.
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      loaded = {
        registry: require('@/features/clinical-decision-support/guideline-packs/registry'),
        beta: require('@/src/application/stores/beta-features.store'),
      }
      /* eslint-enable @typescript-eslint/no-require-imports */
    })
    return loaded!
  } finally {
    process.env = original
  }
}

function hostIds(registry: Registry): string[] {
  return registry.HOST_CARE_PACKS.map((pack) => pack.id)
}

describe('development-only extra care packs', () => {
  beforeEach(() => {
    mockMedcloudLaunchRoute = false
    window.localStorage.clear()
  })

  it('lists the named pack ahead of the host list on a development server', () => {
    const { registry } = load('development', 'hypertension-cdss')

    expect(hostIds(registry)).toEqual(['hypertension-cdss', ...HOST_PACK_IDS])
  })

  it('ignores the variable in a production build', () => {
    const { registry } = load('production', 'hypertension-cdss')

    expect(hostIds(registry)).toEqual(HOST_PACK_IDS)
  })

  it('ignores the variable under test', () => {
    const { registry } = load('test', 'hypertension-cdss')

    expect(hostIds(registry)).toEqual(HOST_PACK_IDS)
  })

  it('lists the host packs alone when the variable is unset', () => {
    const { registry } = load('development')

    expect(hostIds(registry)).toEqual(HOST_PACK_IDS)
  })

  it('skips an id the package does not ship instead of throwing', () => {
    const { registry } = load('development', 'not-a-pack, hypertension-cdss')

    expect(hostIds(registry)).toEqual(['hypertension-cdss', ...HOST_PACK_IDS])
  })

  it('never lists a pack twice', () => {
    const { registry } = load('development', 'ckd-cdss,hypertension-cdss,hypertension-cdss')

    expect(hostIds(registry)).toEqual(['hypertension-cdss', ...HOST_PACK_IDS])
  })

  // Whether heart failure itself is released depends on the care-pack build the
  // app was installed with, so these two cases assert only on the extra pack.
  it('keeps an unreleased extra pack behind Beta, then opens on it', () => {
    const { registry, beta } = load('development', 'hypertension-cdss')
    const visible = () => registry.getEnabledClinicalGuidelinePacks().map((pack) => pack.id)

    expect(registry.HOST_CARE_PACKS[0].enabled).toBe(false)
    expect(visible()).not.toContain('hypertension-cdss')
    expect(registry.getClinicalGuidelinePack('hypertension-cdss')).toBeUndefined()

    beta.useBetaFeaturesStore.getState().setBetaFeaturesEnabled('user-a', true)
    expect(visible()).toEqual(['hypertension-cdss', ...HOST_PACK_IDS])
    expect(registry.getDefaultClinicalGuidelinePack().id).toBe('hypertension-cdss')
  })

  it('shows no extra pack on the Medcloud launch route even with Beta on', () => {
    const { registry, beta } = load('development', 'hypertension-cdss')
    beta.useBetaFeaturesStore.getState().setBetaFeaturesEnabled('user-a', true)
    mockMedcloudLaunchRoute = true

    expect(registry.getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).not.toContain('hypertension-cdss')
    expect(registry.getClinicalGuidelinePack('hypertension-cdss')).toBeUndefined()
  })
})
