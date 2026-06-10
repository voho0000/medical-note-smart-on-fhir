// TWCAT 2026 connectathon — Track #4 (SMART on FHIR client interop)
//
// Track #4 requires our app (a SMART client) to interoperate with at least
// three Track #3 SMART vendor servers. Each vendor publishes a different
// iss URL on twcat-services.dicom.org.tw. We don't pick ONE server; we keep
// a small registry and let the operator choose at runtime via /smart/twcat.
//
// Two cross-cutting concerns live here:
//   1. ParticipantTokenStore — the X-Participant-Token JWT (per Prism gateway)
//   2. installParticipantTokenFetch — wraps window.fetch so the token rides
//      every outbound request to twcat-services.dicom.org.tw, including the
//      ones fhirclient issues internally to /.well-known/smart-configuration
//      and /metadata BEFORE we get a chance to inject it.
//
// IMPORTANT: install the fetch wrapper BEFORE dynamic-importing fhirclient.

// ---------------------------------------------------------------------------
// Vendor registry (built from the 大會-published Google sheet)
// ---------------------------------------------------------------------------

export type TwcatVendor = {
  id: string
  /** Display name, shown in picker. */
  name: string
  /** FHIR base URL used as the SMART `iss` and for resource-level fetches. */
  iss: string
  /** Default client_id (from sheet or assumed default). */
  clientId: string
  /**
   * client_secret for confidential clients. Public clients leave undefined.
   * Built-time defaults only — runtime overrides go through sessionStorage.
   */
  clientSecret?: string
  /**
   * Preferred authentication style. Determines which UI section is used:
   *   - 'client_credentials' → POST tokenEndpoint, get bearer, use directly
   *   - 'smart'              → full SMART OAuth authorization_code flow
   */
  authMethod?: 'client_credentials' | 'smart'
  /**
   * OAuth /token endpoint for client_credentials. Not the same host as iss
   * for some vendors (e.g. Daikon runs auth on :10011 and FHIR on :10012).
   */
  tokenEndpoint?: string
  /**
   * Scope sent on POST /token (client_credentials grant). Per-vendor —
   * Keycloak realms differ on what scopes each client is allowed to receive
   * via service-account flow.
   */
  scope?: string
  /**
   * Scope sent on GET /authorize (authorization_code grant). For most
   * vendors patient-context scopes are only available here, not via
   * client_credentials. Probed empirically per vendor.
   */
  smartScope?: string
  /** Free-text notes (shown under each card in the picker). */
  notes?: string
}

const SMART_V2_DEFAULT_SCOPE =
  'launch launch/patient openid fhirUser patient/Patient.r patient/Observation.r patient/Condition.r patient/MedicationRequest.r patient/AllergyIntolerance.r patient/DiagnosticReport.r patient/Encounter.r patient/Procedure.r patient/Immunization.r offline_access'

export const TWCAT_PRESET_VENDORS: readonly TwcatVendor[] = [
  {
    id: 'daikon',
    name: '玳康 Daikon (Hapi FHIR)',
    iss: 'https://twcat-services.dicom.org.tw:10012/fhir',
    clientId: 'client-confidential-symmetric',
    clientSecret: 'ANde0wpWK5kXsl3B6tqxAoFcODQKgox7',
    authMethod: 'smart',
    tokenEndpoint:
      'https://twcat-services.dicom.org.tw:10011/realms/smart/protocol/openid-connect/token',
    // Daikon's `client-confidential-symmetric` only has `openid profile email`
    // assigned — system/* SMART scopes return invalid_scope. Empty here so the
    // POST omits `scope`. Hapi accepts the resulting OIDC token on /metadata
    // (no scope check) but rejects /Patient and /Observation with
    // "No valid SMART scopes found in token." Use the SMART launch flow below
    // for actual patient data (requires redirect_uri registration with Daikon).
    scope: '',
    // Probed: client-confidential-symmetric in realm "smart" allows these
    // SMART scopes only on authorization_code (not client_credentials).
    // system/Observation.read and patient/* are NOT allowed for this client.
    smartScope: 'openid fhirUser launch/patient system/Patient.read offline_access',
    notes:
      'Quick Test: only /metadata succeeds (no SMART scope in service-account token). Use SMART launch below — it gets a system/Patient.read token with patient data. Requires X-Participant-Token on /fhir.',
  },
  {
    id: 'doorman',
    name: '資慧 Doorman',
    iss: 'https://twcat-services.dicom.org.tw:10064/fhir',
    clientId: '2026twcat_symmetric',
    clientSecret: 'secret',
    authMethod: 'client_credentials',
    tokenEndpoint: 'https://twcat-services.dicom.org.tw:10050/token',
    scope: 'system/*.cruds',
    notes: 'OIDC + client_credentials. Token = 5 min. Verified by 同事 curl. No Participant Token needed.',
  },
  {
    id: 'sgsc',
    name: '智群 OCTOFLOW',
    iss: 'https://twcat-services.dicom.org.tw:10013/fhir',
    clientId: 'sgsc-track3-smart-app',
    clientSecret: 'secret',
    authMethod: 'client_credentials',
    // NOTE: token endpoint is NOT under /fhir/.well-known/. That URL on the
    // sheet is the SMART discovery doc; the actual /token sits under /connect/.
    tokenEndpoint: 'https://twcat-services.dicom.org.tw:10013/connect/token',
    scope: 'system/*.rs',
    // SMART v2 user-flow scope (public client `gazelle-smart-authcode-partner`
    // available too — switch via Edit if you want PKCE-only flow).
    smartScope:
      'openid fhirUser launch/patient system/Patient.read system/Observation.read offline_access',
    notes:
      'HAPI Partitioning enabled — the wrapper auto-adds X-Partition-ID from the bearer\'s tenant_id claim. Bearer scope: system/*.rs. Patient + Observation + Condition + MedicationRequest all return data.',
  },
  {
    id: 'esi',
    name: '商之器 EBM (fhir)',
    iss: 'https://twcat-services.dicom.org.tw:10051/fhir',
    clientId: 'oauth21_Client',
    clientSecret: 'APfKqIYlsOftm8POiibnrdM0OtcVwqMI',
    authMethod: 'client_credentials',
    tokenEndpoint:
      'https://twcat-services.dicom.org.tw:10066/realms/oauth21_realm/protocol/openid-connect/token',
    // Server advertises SMART v2 scopes (system/*.rs etc) plus twcore/ips
    // custom scopes. Keep it minimal to maximise compatibility.
    scope: 'system/*.rs twcore',
    notes:
      'Keycloak realm "oauth21_realm" on :10066. FHIR base /fhir on :10051. Token = 5 min.',
  },
] as const

/**
 * Build a same-origin proxy URL for a given upstream. Required for any
 * cross-origin request that triggers a CORS preflight, because TWCAT
 * vendors omit ACAO from OPTIONS responses.
 */
export function twcatProxyUrl(upstream: string): string {
  return `/api/twcat-proxy?upstream=${encodeURIComponent(upstream)}`
}

/**
 * Inject a fully-formed SMART session into sessionStorage so the main app's
 * fhirclient.oauth2.ready() call accepts a bearer obtained outside the SMART
 * authorization_code flow (e.g. a Quick Test client_credentials token).
 *
 * Doorman + ESI don't expose a real SMART launch flow, but their /token
 * endpoints return tokens with `system/*` scopes that Hapi happily accepts on
 * /Patient, /Observation, etc. Synthesising the SMART session here lets the
 * main app render their data with zero per-vendor code.
 *
 * Daikon goes through the real SMART flow; this helper is unused for it.
 */
export function synthesizeSmartSession(args: {
  vendor: { iss: string; clientId: string }
  accessToken: string
  expiresIn?: number
  scope?: string
  patientId?: string
}) {
  if (typeof window === 'undefined') return
  // Same name fhirclient generates internally — collides safely since we
  // overwrite it.
  const stateKey = 'twcat-synth-' + Math.random().toString(36).slice(2, 10)
  const state = {
    serverUrl: args.vendor.iss,
    clientId: args.vendor.clientId,
    redirectUri: `${window.location.origin}/smart/twcat/callback`,
    scope: args.scope ?? '',
    tokenResponse: {
      access_token: args.accessToken,
      token_type: 'Bearer',
      expires_in: args.expiresIn ?? 300,
      scope: args.scope ?? '',
      ...(args.patientId ? { patient: args.patientId } : {}),
    },
    ...(args.patientId ? { patient: args.patientId } : {}),
  }
  window.sessionStorage.setItem(stateKey, JSON.stringify(state))
  window.sessionStorage.setItem('SMART_KEY', JSON.stringify(stateKey))
}

// ---------------------------------------------------------------------------
// Active-vendor selection (set by picker, read by /smart/launch)
// ---------------------------------------------------------------------------

const ACTIVE_VENDOR_KEY = 'twcat.activeVendor'
const CUSTOM_VENDORS_KEY = 'twcat.customVendors'
const TWCAT_PARTICIPANT_TOKEN_KEY = 'twcat.participantToken'

export const ActiveVendorStore = {
  get(): TwcatVendor | null {
    if (typeof window === 'undefined') return null
    const raw = window.sessionStorage.getItem(ACTIVE_VENDOR_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as TwcatVendor
    } catch {
      return null
    }
  },
  set(vendor: TwcatVendor) {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(ACTIVE_VENDOR_KEY, JSON.stringify(vendor))
  },
  clear() {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(ACTIVE_VENDOR_KEY)
  },
}

export const CustomVendorStore = {
  list(): TwcatVendor[] {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(CUSTOM_VENDORS_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },
  add(vendor: TwcatVendor) {
    if (typeof window === 'undefined') return
    const list = CustomVendorStore.list().filter((v) => v.id !== vendor.id)
    list.push(vendor)
    window.localStorage.setItem(CUSTOM_VENDORS_KEY, JSON.stringify(list))
  },
  remove(id: string) {
    if (typeof window === 'undefined') return
    const list = CustomVendorStore.list().filter((v) => v.id !== id)
    window.localStorage.setItem(CUSTOM_VENDORS_KEY, JSON.stringify(list))
  },
}

// ---------------------------------------------------------------------------
// Preset overrides
// ---------------------------------------------------------------------------
// Vendors at the connectathon may change credentials / endpoints on the fly.
// Rather than force a rebuild every time, we keep the preset values as the
// "factory default" and let the operator override individual fields at
// runtime. Stored as a `Partial<TwcatVendor>` per vendor id; nullish fields
// fall back to the preset.

const VENDOR_OVERRIDES_KEY = 'twcat.vendorOverrides'

export type VendorOverrides = Record<string, Partial<TwcatVendor>>

export const VendorOverrideStore = {
  getAll(): VendorOverrides {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(VENDOR_OVERRIDES_KEY)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as VendorOverrides) : {}
    } catch {
      return {}
    }
  },
  get(id: string): Partial<TwcatVendor> | undefined {
    return VendorOverrideStore.getAll()[id]
  },
  set(id: string, patch: Partial<TwcatVendor>) {
    if (typeof window === 'undefined') return
    const all = VendorOverrideStore.getAll()
    all[id] = patch
    window.localStorage.setItem(VENDOR_OVERRIDES_KEY, JSON.stringify(all))
  },
  clear(id: string) {
    if (typeof window === 'undefined') return
    const all = VendorOverrideStore.getAll()
    delete all[id]
    window.localStorage.setItem(VENDOR_OVERRIDES_KEY, JSON.stringify(all))
  },
  has(id: string): boolean {
    return Object.keys(VendorOverrideStore.get(id) ?? {}).length > 0
  },
}

/**
 * Merge a vendor with any operator-supplied override. Override fields that
 * are empty strings ('') count as "explicit no value" (e.g. clear a secret);
 * `undefined` or missing keys fall back to the preset.
 */
function applyOverride(preset: TwcatVendor, patch: Partial<TwcatVendor> | undefined): TwcatVendor {
  if (!patch) return preset
  const out = { ...preset } as TwcatVendor
  for (const k of Object.keys(patch) as (keyof TwcatVendor)[]) {
    const v = patch[k]
    if (v !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(out as any)[k] = v
    }
  }
  return out
}

export function getAllVendors(): TwcatVendor[] {
  const overrides = VendorOverrideStore.getAll()
  return [
    ...TWCAT_PRESET_VENDORS.map((p) => applyOverride(p, overrides[p.id])),
    ...CustomVendorStore.list(),
  ]
}

/**
 * Lookup the vendor that matches a given iss. Used by /smart/launch when the
 * URL has ?iss=... (EHR-launched flow) but no explicit vendor selection.
 * Picks from the merged (preset + override) list so an operator who changed
 * the iss in the Edit UI still gets the right vendor back.
 */
export function resolveVendorByIss(iss: string): TwcatVendor | null {
  const norm = iss.replace(/\/+$/, '')
  for (const v of getAllVendors()) {
    if (v.iss.replace(/\/+$/, '') === norm) return v
  }
  return null
}

/**
 * Decode a JWT payload and return its `tenant_id` claim (if any). Used to
 * auto-set X-Partition-ID for HAPI Partitioning servers like 智群 OCTOFLOW
 * where the partition is baked into the OAuth bearer. Returns null when the
 * token isn't a JWT or doesn't carry a tenant claim — in that case the
 * caller should skip adding the partition header.
 *
 * No signature verification (we don't have the public key, and we're only
 * reading our OWN bearer to copy a claim into a header — not authenticating
 * a remote party).
 */
export function extractTenantId(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const token = m[1]
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString()
    const claims = JSON.parse(decoded)
    const tid = claims?.tenant_id
    if (tid === undefined || tid === null || tid === '') return null
    return String(tid)
  } catch {
    return null
  }
}

/** True if a URL points at any TWCAT proxy host. */
export function isTwcatHost(host: string): boolean {
  return (
    host.endsWith('twcat-services.dicom.org.tw') ||
    host.endsWith('twcat-fhirsrv.dicom.org.tw') ||
    host.endsWith('twcat-oauthsrv.dicom.org.tw')
  )
}

// ---------------------------------------------------------------------------
// Participant Token store (sessionStorage + env var fallback)
// ---------------------------------------------------------------------------

export const ParticipantTokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null
    const stored = window.sessionStorage.getItem(TWCAT_PARTICIPANT_TOKEN_KEY)
    if (stored && stored.trim()) return stored.trim()
    const fromEnv = (process.env.NEXT_PUBLIC_TWCAT_PARTICIPANT_TOKEN || '').trim()
    return fromEnv || null
  },
  set(token: string) {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(TWCAT_PARTICIPANT_TOKEN_KEY, token.trim())
  },
  clear() {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(TWCAT_PARTICIPANT_TOKEN_KEY)
  },
}

// ---------------------------------------------------------------------------
// SMART flow trace log
// ---------------------------------------------------------------------------
// Captures every HTTP request the app issues to a TWCAT host (via the wrapper)
// plus any explicit non-HTTP milestones (navigation URLs, callback landings).
// Read on /smart/twcat?launched=1 to render a "show me what I sent" panel
// covering the full SMART OAuth dance — which spans three page loads.

export type FlowLogEntry = {
  ts: number
  /** Human-readable label. Falls back to "<METHOD> <pathname>" when omitted. */
  label?: string
  method: string
  /** Direct upstream URL (NOT the local /api/twcat-proxy proxy URL). */
  url: string
  requestHeaders: Record<string, string>
  requestBody?: string
  responseStatus?: number
  responseBody?: string
}

const FLOW_LOG_KEY = 'twcat.flowLog'
const FLOW_LOG_MAX_ENTRIES = 30
const FLOW_LOG_MAX_BODY = 4000

export const FlowLogStore = {
  getAll(): FlowLogEntry[] {
    if (typeof window === 'undefined') return []
    const raw = window.sessionStorage.getItem(FLOW_LOG_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },
  append(entry: FlowLogEntry) {
    if (typeof window === 'undefined') return
    const cur = FlowLogStore.getAll()
    // Truncate response/request bodies to keep sessionStorage size sane.
    const safe = {
      ...entry,
      requestBody:
        entry.requestBody && entry.requestBody.length > FLOW_LOG_MAX_BODY
          ? entry.requestBody.slice(0, FLOW_LOG_MAX_BODY) + '…(truncated)'
          : entry.requestBody,
      responseBody:
        entry.responseBody && entry.responseBody.length > FLOW_LOG_MAX_BODY
          ? entry.responseBody.slice(0, FLOW_LOG_MAX_BODY) + '…(truncated)'
          : entry.responseBody,
    }
    cur.push(safe)
    while (cur.length > FLOW_LOG_MAX_ENTRIES) cur.shift()
    try {
      window.sessionStorage.setItem(FLOW_LOG_KEY, JSON.stringify(cur))
    } catch {
      // sessionStorage may be full — drop silently rather than break the flow.
    }
  },
  clear() {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(FLOW_LOG_KEY)
  },
}

// ---------------------------------------------------------------------------
// Discovery bearer
// ---------------------------------------------------------------------------
// Vendors like Daikon gate /fhir/metadata and /fhir/.well-known/smart-config
// behind OAuth, so fhirclient can't discover endpoints before the OAuth dance
// even starts. Workaround: pre-fetch a short-lived service-account bearer via
// client_credentials and attach it to discovery requests only. fhirclient's
// own user-context bearer (post-callback) takes precedence — see the fetch
// wrapper for the "only inject if no Authorization already present" rule.

const DISCOVERY_BEARER_KEY = 'twcat.discoveryBearer'

export const DiscoveryBearerStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(DISCOVERY_BEARER_KEY)
  },
  set(token: string) {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(DISCOVERY_BEARER_KEY, token)
  },
  clear() {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(DISCOVERY_BEARER_KEY)
  },
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

// Track installation on `window` (not module-level) so Next.js HMR re-loads
// don't leave a stale "installed = true" while the actual window.fetch sits
// unpatched. Symbol can't be used here because we want the flag to survive
// a window-level reference; a string property is fine.
const INSTALL_FLAG = '__twcatFetchPatched'

/**
 * Wrap window.fetch so requests to TWCAT FHIR resource paths are:
 *   1. rewritten through /api/twcat-proxy (avoids the OPTIONS-preflight
 *      CORS bug where vendors return ACAO on real responses but not on
 *      preflight),
 *   2. enriched with X-Participant-Token (when set), and
 *   3. enriched with a service-account Bearer (when set) ONLY if the caller
 *      hasn't already attached one. This lets fhirclient discover endpoints
 *      against vendors that gate /metadata behind OAuth, without overriding
 *      its user-context Bearer after the OAuth dance completes.
 *
 * Token + authorize endpoints (no `/fhir/` in path) bypass the proxy — POST
 * /token works directly (simple request) and /authorize is a browser
 * navigation. Idempotent; safe to call repeatedly.
 */
export function installParticipantTokenFetch() {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any)[INSTALL_FLAG]) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any)[INSTALL_FLAG] = true

  const originalFetch = window.fetch.bind(window)
  console.info('[twcat] fetch wrapper installed')

  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    let urlString: string
    if (typeof input === 'string') urlString = input
    else if (input instanceof URL) urlString = input.toString()
    else urlString = input.url

    let urlObj: URL | null = null
    try {
      urlObj = new URL(urlString, window.location.href)
    } catch {
      return originalFetch(input, init)
    }

    const host = urlObj.host.split(':')[0]
    if (!isTwcatHost(host)) {
      return originalFetch(input, init)
    }

    // Earlier this wrapper only proxied /fhir/* paths on the theory that
    // /token POSTs would be "simple" requests and pass CORS direct. That's
    // true for client_credentials (form body, no Authorization). But for the
    // SMART authorization_code callback, fhirclient sends `Authorization:
    // Basic …` on POST /token (confidential client auth) — which IS a
    // preflight trigger, and Daikon's preflight returns no ACAO → fail.
    // Cheapest fix: proxy EVERY twcat request. The browser navigation to
    // /authorize is unaffected because navigations don't go through fetch.

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    )
    const pt = ParticipantTokenStore.get()
    if (pt && !headers.has('X-Participant-Token')) {
      headers.set('X-Participant-Token', pt)
    }
    if (!headers.has('Authorization')) {
      const discoveryBearer = DiscoveryBearerStore.get()
      if (discoveryBearer) {
        headers.set('Authorization', `Bearer ${discoveryBearer}`)
      }
    }
    // HAPI Partitioning vendors (e.g. 智群 OCTOFLOW) require X-Partition-ID
    // matching the tenant baked into the bearer. We auto-extract from the
    // JWT we're about to send; vendors that don't use partitioning issue
    // tokens with no tenant_id claim, so the header is simply not added.
    if (!headers.has('X-Partition-ID')) {
      const tid = extractTenantId(headers.get('Authorization'))
      if (tid) headers.set('X-Partition-ID', tid)
    }

    const proxyUrl = `/api/twcat-proxy?upstream=${encodeURIComponent(urlObj.toString())}`
    const method = (init?.method ?? 'GET').toUpperCase()
    const requestBody =
      init?.body && typeof init.body !== 'object' ? String(init.body) : undefined
    const res = await originalFetch(proxyUrl, { ...init, headers })
    // Mirror response into FlowLog without consuming the original stream.
    try {
      const cloned = res.clone()
      const bodyText = await cloned.text()
      const recordHeaders: Record<string, string> = {}
      headers.forEach((v, k) => {
        recordHeaders[k] = v
      })
      FlowLogStore.append({
        ts: Date.now(),
        method,
        url: urlObj.toString(),
        requestHeaders: recordHeaders,
        requestBody,
        responseStatus: res.status,
        responseBody: bodyText,
      })
    } catch {
      // Logging is best-effort. Never break the real fetch on a logging error.
    }
    return res
  }
}

// captureNextNavigation was removed: fhirclient uses `location.href = url`
// (not `assign`), which is harder to intercept reliably. We switched to
// fhirclient's `noRedirect: true` option which returns the URL — see
// launchStandalone in /smart/twcat/page.tsx.
