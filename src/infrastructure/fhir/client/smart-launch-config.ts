export const SMART_PATIENT_DATA_SCOPE = 'patient/*.rs'

/**
 * SMART App Launch 2.x uses different context negotiation scopes depending on
 * where launch begins: `launch` for an EHR launch and `launch/patient` when the
 * app starts outside an EHR and needs the authorization server to establish a
 * patient context.
 */
export function buildSmartScopes(launch?: string): string {
  const launchScope = launch ? 'launch' : 'launch/patient'
  return `${launchScope} openid fhirUser ${SMART_PATIENT_DATA_SCOPE} online_access`
}

interface SmartAuthorizeConfigInput {
  clientId: string
  redirectUri: string
  iss: string
  launch?: string
}

/** Build the public-client authorization settings in one testable place. */
export function buildSmartAuthorizeConfig({
  clientId,
  redirectUri,
  iss,
  launch,
}: SmartAuthorizeConfigInput) {
  return {
    clientId: clientId.trim(),
    scope: buildSmartScopes(launch),
    redirectUri,
    iss,
    ...(launch ? { launch } : {}),
    completeInTarget: true,
    // SMART App Launch 2.x requires S256 PKCE for browser-based public apps.
    // `required` also prevents silently falling back to a non-PKCE flow when a
    // server's discovery document is incomplete.
    pkceMode: 'required' as const,
  }
}
