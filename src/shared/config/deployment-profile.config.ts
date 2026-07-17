export const DEPLOYMENT_PROFILES = ['cloud', 'onprem'] as const

export type DeploymentProfile = (typeof DEPLOYMENT_PROFILES)[number]

/**
 * Resolve the build-time deployment boundary. `NEXT_PUBLIC_OFFLINE_MODE` is
 * kept as a fail-closed compatibility input for existing intranet builds; a
 * new build should set `NEXT_PUBLIC_DEPLOYMENT_PROFILE` explicitly.
 */
export function resolveDeploymentProfile(
  configuredProfile: string | undefined,
  legacyOfflineMode: boolean,
): DeploymentProfile {
  if (
    configuredProfile
    && !DEPLOYMENT_PROFILES.includes(configuredProfile as DeploymentProfile)
  ) {
    throw new Error(
      `Invalid NEXT_PUBLIC_DEPLOYMENT_PROFILE: ${configuredProfile}. Expected cloud or onprem.`,
    )
  }

  // The legacy offline flag always wins. An accidentally conflicting build
  // must lose cloud capabilities instead of silently enabling them.
  if (legacyOfflineMode) return 'onprem'
  return (configuredProfile as DeploymentProfile | undefined) ?? 'cloud'
}

export const DEPLOYMENT_PROFILE = resolveDeploymentProfile(
  process.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE,
  process.env.NEXT_PUBLIC_OFFLINE_MODE === '1',
)

export const DEPLOYMENT_CONFIG = {
  profile: DEPLOYMENT_PROFILE,
  isCloud: DEPLOYMENT_PROFILE === 'cloud',
  isOnPrem: DEPLOYMENT_PROFILE === 'onprem',
  allowsFirebase: DEPLOYMENT_PROFILE === 'cloud',
  allowsCloudAi: DEPLOYMENT_PROFILE === 'cloud',
} as const

export function assertCloudCapabilityAllowed(capability: string): void {
  if (!DEPLOYMENT_CONFIG.allowsCloudAi) {
    throw new Error(`${capability} is disabled by the onprem deployment profile`)
  }
}
