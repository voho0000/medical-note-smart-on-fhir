import { HF_MAX_BYTES, HF_DRY_RUN_CLAIMS, parseHfDryRunResponse, type HfInput, type HfDryRunResult } from '@/src/core/hf-risk/contract'
import { validateHfTransportBundle } from '@/src/core/hf-risk/transport-bundle'

export function hfGatewayUrl(origin: string): string {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('gateway-config')
  return new URL('/hf/v1/dry-run', url).href
}
export type HfAuthPolicy = 'firebase' | 'intranet'
export function hfAuthPolicy(value: string | undefined): HfAuthPolicy {
  if (!value || value === 'firebase') return 'firebase'
  if (value === 'intranet') return 'intranet'
  throw new Error('gateway-config')
}
/** No score mode or direct HTTP fallback. Auth is a Gateway caller token, never a model service key. */
export async function requestHfDryRun(input: HfInput, options: {
  origin: string; token?: string; authPolicy?: HfAuthPolicy; signal: AbortSignal; requestId?: string; fetch?: typeof fetch
}): Promise<HfDryRunResult> {
  const policy = hfAuthPolicy(options.authPolicy)
  if ((policy === 'firebase' && !options.token) || !HF_DRY_RUN_CLAIMS.includes(input.claim) || !validateHfTransportBundle(input.bundle, input.indexDate)) throw new Error('input-invalid')
  const url = new URL(hfGatewayUrl(options.origin))
  url.searchParams.set('claim', input.claim)
  url.searchParams.set('indexDate', input.indexDate)
  url.searchParams.set('dryRun', 'true')
  let requestTarget = url.href
  const localPreview = process.env.NEXT_PUBLIC_HF_LOCAL_PREVIEW_RELAY
  if (localPreview) {
    if (process.env.NODE_ENV !== 'development' || localPreview !== 'synthetic' || options.origin !== 'https://samd.mediprisma.tw' || policy !== 'intranet') throw new Error('gateway-config')
    requestTarget = '/__hf-local-preview' + url.pathname + url.search
  }
  const body = JSON.stringify(input.bundle)
  if (new Blob([body]).size > HF_MAX_BYTES) throw new Error('input-too-large')
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal.aborted) controller.abort()
  options.signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 15000)
  try {
    if (controller.signal.aborted) throw new Error('request-aborted')
    const response = await (options.fetch ?? fetch)(requestTarget, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json',
        ...(policy === 'firebase' ? { Authorization: 'Bearer ' + options.token } : {}), 'X-Request-ID': options.requestId ?? crypto.randomUUID() },
      body,
    })
    if ([401, 403].includes(response.status)) throw new Error('gateway-unauthorized')
    if (![200, 422].includes(response.status)) throw new Error('gateway-unavailable')
    const content = await response.text()
    if (new Blob([content]).size > HF_MAX_BYTES) throw new Error('response-too-large')
    const value = parseHfDryRunResponse(response.status, JSON.parse(content))
    const requestId = response.headers.get('x-request-id')
    const adapterVersion = response.headers.get('x-samd-adapter-version')
    return { ...value, checkedAt: new Date().toISOString(),
      ...(requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? { requestId } : {}),
      ...(adapterVersion && /^[0-9a-z.-]{1,40}$/i.test(adapterVersion) ? { adapterVersion } : {}) }

  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', abort)
  }
}
