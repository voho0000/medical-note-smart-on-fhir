// FHIR Client Service
import type FHIR from 'fhirclient'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

export type FHIRClient = Awaited<ReturnType<typeof FHIR.oauth2.ready>>

/**
 * Thrown by FhirClientService.getClient() when the app is running with a
 * locally-imported FHIR Bundle (no SMART OAuth state in the URL). Callers
 * should catch this specifically and silently treat the FHIR client as
 * "unavailable" — printing the error would be noise, not a bug.
 */
export class LocalBundleModeError extends Error {
  constructor() {
    super('App is running in local-bundle mode; SMART client is not initialised.')
    this.name = 'LocalBundleModeError'
  }
}

// SMART launch / callback URL params (fhirclient consumes these on entry).
// `state` + `code` are present on the OAuth callback URL.
// `launch` + `iss` are present on the initial launch URL from the EHR.
const SMART_URL_PARAMS = ['state', 'code', 'launch', 'iss']

/**
 * Returns true when the app appears to be running inside a SMART OAuth
 * context — either a fresh launch / callback (params in the URL) or an
 * already-established session (token state cached in sessionStorage by
 * fhirclient).
 *
 * When this returns true, SMART takes precedence over any locally-imported
 * bundle. Reasoning: an EHR-initiated launch (or an ongoing SMART session)
 * is an *explicit* clinical context, while a leftover local bundle is just
 * residue from earlier testing. The clinical context should always win.
 *
 * SSR-safe: returns false when window is not defined.
 */
export function hasSmartContext(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (SMART_URL_PARAMS.some(k => params.has(k))) return true
  } catch {
    // Malformed URL — fall through to sessionStorage check.
  }
  try {
    // fhirclient stores SMART_KEY as a JSON-stringified pointer to another
    // sessionStorage entry containing the actual token state. The pointer
    // alone is set very early in the OAuth flow and persists across same-tab
    // navigations even after the user is no longer logged in (or never
    // completed the flow). We must also confirm the pointed-to state
    // contains a real `tokenResponse.access_token` before treating the
    // session as live — otherwise stale pointers send us into
    // `oauth2.ready()` which throws "No 'state' parameter found."
    const rawPointer = window.sessionStorage.getItem('SMART_KEY')
    if (!rawPointer) return false
    const stateKey = rawPointer.replace(/^"|"$/g, '')
    if (!stateKey) return false
    const stateJson = window.sessionStorage.getItem(stateKey)
    if (!stateJson) return false
    const parsed = JSON.parse(stateJson)
    return !!parsed?.tokenResponse?.access_token
  } catch {
    // sessionStorage unavailable or state JSON malformed — treat as no context.
  }
  return false
}

/**
 * Convenience helper: should we use the locally-imported bundle as the data
 * source for this request? True only when there's NO SMART context AND a
 * local bundle exists.
 */
export function shouldUseLocalBundle(): boolean {
  return !hasSmartContext() && LocalBundleService.hasData()
}

/**
 * True when any data source is available — either a SMART launch context or
 * a locally-imported bundle. When false, the UI should show an onboarding
 * screen instead of attempting FHIR queries that will fail with confusing
 * "Failed to initialize FHIR client" errors.
 */
export function hasAnyDataSource(): boolean {
  return hasSmartContext() || LocalBundleService.hasData()
}

export class FhirClientService {
  private static instance: FhirClientService
  private client: FHIRClient | null = null

  private constructor() {}

  static getInstance(): FhirClientService {
    if (!FhirClientService.instance) {
      FhirClientService.instance = new FhirClientService()
    }
    return FhirClientService.instance
  }

  async getClient(): Promise<FHIRClient> {
    if (this.client) {
      return this.client
    }

    // Local-bundle mode: SMART takes precedence whenever there's any sign of
    // an OAuth flow (URL params or sessionStorage state). Fall back to the
    // local bundle only when no SMART context is present.
    if (shouldUseLocalBundle()) {
      throw new LocalBundleModeError()
    }

    try {
      const FHIR = (await import('fhirclient')).default
      this.client = await FHIR.oauth2.ready()
      return this.client
    } catch (error) {
      if (error instanceof LocalBundleModeError) throw error
      console.error('Failed to initialize FHIR client:', error)
      throw new Error('Failed to initialize FHIR client')
    }
  }

  async request<T = any>(query: string): Promise<T> {
    const client = await this.getClient()
    return await client.request(query)
  }

  clearClient(): void {
    this.client = null
  }
}

export const fhirClient = FhirClientService.getInstance()
