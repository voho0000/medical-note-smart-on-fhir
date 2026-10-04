import { HF_MAX_BYTES, HF_DRY_RUN_CLAIMS, parseHfDryRunResponse, type HfInput, type HfDryRunResult } from '@/src/core/hf-risk/contract'
import { validateHfTransportBundle } from '@/src/core/hf-risk/transport-bundle'

export function hfGatewayUrl(origin: string): string {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('gateway-config')
  return new URL('/hf/v1/dry-run', url).href
}
/** No score mode or direct HTTP fallback. Auth is a Gateway caller token, never a model service key. */
export async function requestHfDryRun(input: HfInput, options: {
  origin: string; token: string; signal: AbortSignal; requestId?: string; fetch?: typeof fetch
}): Promise<HfDryRunResult> {
  if (!options.token || !HF_DRY_RUN_CLAIMS.includes(input.claim) || !validateHfTransportBundle(input.bundle, input.indexDate)) throw new Error('input-invalid')
  const url = new URL(hfGatewayUrl(options.origin))
  url.searchParams.set('claim', input.claim)
  url.searchParams.set('indexDate', input.indexDate)
  url.searchParams.set('dryRun', 'true')
  const body = JSON.stringify(input.bundle)
  if (new Blob([body]).size > HF_MAX_BYTES) throw new Error('input-too-large')
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal.aborted) controller.abort()
  options.signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 15000)
  try {
    if (controller.signal.aborted) throw new Error('request-aborted')
    const response = await (options.fetch ?? fetch)(url.href, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json',
        Authorization: 'Bearer ' + options.token, 'X-Request-ID': options.requestId ?? crypto.randomUUID() },
      body,
    })
    if ([401, 403].includes(response.status)) throw new Error('gateway-unauthorized')
    if (![200, 422].includes(response.status)) throw new Error('gateway-unavailable')
    const content = await response.text()
    if (new Blob([content]).size > HF_MAX_BYTES) throw new Error('response-too-large')
    return parseHfDryRunResponse(response.status, JSON.parse(content))
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', abort)
  }
}
