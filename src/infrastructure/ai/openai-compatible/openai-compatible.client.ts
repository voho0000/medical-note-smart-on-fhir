import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import {
  isOpenAiCompatibleReady,
  openAiCompatibleEndpointUrl,
  resolveOpenAiCompatibleBaseUrl,
} from '@/src/shared/utils/openai-compatible.utils'

const NO_AUTH_SDK_KEY = 'local-endpoint-no-auth'

export interface OpenAiCompatibleConnectionResult {
  models: string[]
  modelFound: boolean | null
  usedChatProbe: boolean
}

function requestHeaders(apiKey: string | null | undefined): Headers {
  const headers = new Headers()
  if (apiKey?.trim()) headers.set('Authorization', `Bearer ${apiKey.trim()}`)
  return headers
}

/**
 * The OpenAI SDK expects a non-empty key even for local servers. Give the SDK a
 * harmless placeholder, then remove its Authorization header when this profile
 * is intentionally keyless. Requests stay in the browser and omit cookies.
 */
export function createOpenAiCompatibleFetch(apiKey: string | null | undefined): typeof fetch {
  const originalFetch = globalThis.fetch.bind(globalThis)
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    if (!apiKey?.trim()) headers.delete('authorization')
    return originalFetch(input, {
      ...init,
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  }
}
export function openAiCompatibleSdkKey(apiKey: string | null | undefined): string {
  return apiKey?.trim() || NO_AUTH_SDK_KEY
}

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as {
    error?: string | { message?: string }
    message?: string
  } | null
  if (typeof body?.error === 'string') return body.error.slice(0, 300)
  if (body?.error && typeof body.error.message === 'string') return body.error.message.slice(0, 300)
  if (typeof body?.message === 'string') return body.message.slice(0, 300)
  return response.statusText || `HTTP ${response.status}`
}

/**
 * Browser-only connection test. GET /models is non-generative; endpoints that
 * do not implement it fall back to a one-token, patient-free chat probe.
 * Nothing is relayed through a Next.js route.
 */
export async function testOpenAiCompatibleConnection(
  config: OpenAiCompatibleConfig,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; origin?: string } = {},
): Promise<OpenAiCompatibleConnectionResult> {
  if (!isOpenAiCompatibleReady(config)) {
    throw new Error('Base URL and model ID are required')
  }

  const timeoutMs = options.timeoutMs ?? 10_000
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const commonInit: RequestInit = {
    headers: requestHeaders(config.apiKey),
    signal: controller.signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  }

  try {
    // Resolve once here so an invalid certificate/CORS/network error is surfaced
    // by the browser against the exact hospital endpoint the app will use.
    resolveOpenAiCompatibleBaseUrl(config.baseUrl, options.origin)
    const modelsResponse = await fetchImpl(
      openAiCompatibleEndpointUrl(config.baseUrl, 'models', options.origin),
      { ...commonInit, method: 'GET' },
    )

    if (modelsResponse.ok) {
      const payload = await modelsResponse.json().catch(() => ({})) as {
        data?: Array<{ id?: unknown }>
      }
      const models = Array.isArray(payload.data)
        ? payload.data
          .map((entry) => typeof entry?.id === 'string' ? entry.id : '')
          .filter(Boolean)
        : []
      return {
        models,
        modelFound: models.length > 0 ? models.includes(config.modelId) : null,
        usedChatProbe: false,
      }
    }

    // Authentication and server failures are authoritative; a missing or
    // unsupported /models route is the compatibility case that merits a probe.
    if (modelsResponse.status === 401 || modelsResponse.status === 403 || modelsResponse.status >= 500) {
      throw new Error(`HTTP ${modelsResponse.status}: ${await readError(modelsResponse)}`)
    }

    const probeHeaders = requestHeaders(config.apiKey)
    probeHeaders.set('Content-Type', 'application/json')
    const chatResponse = await fetchImpl(
      openAiCompatibleEndpointUrl(config.baseUrl, 'chat/completions', options.origin),
      {
        ...commonInit,
        method: 'POST',
        headers: probeHeaders,
        body: JSON.stringify({
          model: config.modelId,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          stream: false,
          max_tokens: 1,
        }),
      },
    )
    if (!chatResponse.ok) {
      throw new Error(`HTTP ${chatResponse.status}: ${await readError(chatResponse)}`)
    }
    return { models: [], modelFound: null, usedChatProbe: true }
  } finally {
    clearTimeout(timeout)
  }
}
