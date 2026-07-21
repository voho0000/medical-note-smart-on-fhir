import { createOpenAI } from '@ai-sdk/openai'
import { stepCountIs, streamText } from 'ai'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import {
  MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  normalizeOpenAiCompatibleTransport,
} from '@/src/shared/types/openai-compatible.types'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { getAppCheckToken } from '@/src/infrastructure/ai/utils/app-check'
import { getProxyIdToken } from '@/src/infrastructure/ai/utils/proxy-auth'
import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
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
  /** Best-effort total context window reported for the configured model.
   *  OpenAI's model-list schema does not require this metadata. */
  detectedContextWindowTokens: number | null
}

export interface OpenAiCompatibleAgentCapabilityResult {
  status: 'verified' | 'unsupported' | 'inconclusive'
  reason?: string
}

export interface OpenAiCompatibleAgentCapabilityOptions {
  timeoutMs?: number
  fetchImpl?: typeof fetch
  origin?: string
  gatewayUrl?: string
}

const AGENT_CAPABILITY_PROBE_TOOL = 'getDataOverview' as const
const AGENT_CAPABILITY_PROBE_TIMEOUT_MS = 3 * 60_000
// Keep this below the Firebase Gateway's eight-minute upstream timeout while
// allowing the two-step 550B reasoning-model probe substantially more time.
const NVIDIA_NEMOTRON_AGENT_CAPABILITY_PROBE_TIMEOUT_MS = 7 * 60_000
const AGENT_CAPABILITY_PROBE_MAX_OUTPUT_TOKENS = 1_024
const NVIDIA_NEMOTRON_3_ULTRA_MODEL_ID = 'nvidia/nemotron-3-ultra-550b-a55b'
const NVIDIA_NEMOTRON_PROBE_REASONING_BUDGET = 1_024

const CONTEXT_WINDOW_FIELDS = [
  // Only high-confidence runtime/serving extensions belong here. Do not add
  // training limits such as n_ctx_train, max_position_embeddings, or the
  // ambiguous completion-only max_tokens field.
  'max_model_len',
  'context_window',
  'context_length',
] as const

function contextWindowNumber(value: unknown): number | null {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && value.trim() !== '')
  ) return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null
  return parsed >= MIN_OPENAI_COMPATIBLE_CONTEXT_WINDOW &&
    parsed <= MAX_OPENAI_COMPATIBLE_CONTEXT_WINDOW
    ? parsed
    : null
}

function normalizedMetadataKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

/** Parse common extension fields without treating completion-only `max_tokens`
 * or architecture/training limits as the deployed runtime window. When a
 * provider supplies both its model-level and top-provider limit, use the
 * smaller value conservatively. */
function reportedContextWindow(model: unknown): number | null {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return null
  const record = model as Record<string, unknown>
  const candidates: number[] = []
  for (const field of CONTEXT_WINDOW_FIELDS) {
    for (const [key, value] of Object.entries(record)) {
      if (normalizedMetadataKey(key) !== field) continue
      const parsed = contextWindowNumber(value)
      if (parsed !== null) candidates.push(parsed)
    }
  }
  const topProvider = record.top_provider
  if (topProvider && typeof topProvider === 'object' && !Array.isArray(topProvider)) {
    const providerLimit = contextWindowNumber(
      (topProvider as Record<string, unknown>).context_length,
    )
    if (providerLimit !== null) candidates.push(providerLimit)
  }
  return candidates.length > 0 ? Math.min(...candidates) : null
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
export function createOpenAiCompatibleFetch(
  apiKey: string | null | undefined,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    if (!apiKey?.trim()) headers.delete('authorization')
    return fetchImpl(input, {
      ...init,
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string' || input instanceof URL
    ? String(input)
    : input.url
}

function validateGatewayUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('MediPrisma Gateway URL is invalid')
  }
  if (parsed.protocol !== 'https:' || (parsed.port && parsed.port !== '443')) {
    throw new Error('MediPrisma Gateway must use HTTPS')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MediPrisma Gateway URL cannot contain credentials or parameters')
  }
  return parsed.toString()
}

function gatewayPath(
  input: Parameters<typeof fetch>[0],
  config: OpenAiCompatibleConfig,
  origin?: string,
): string {
  const base = new URL(resolveOpenAiCompatibleBaseUrl(config.baseUrl, origin))
  const request = new URL(requestUrl(input))
  const basePath = base.pathname.replace(/\/+$/, '')
  const prefix = `${basePath}/`
  if (
    base.origin !== request.origin ||
    !request.pathname.startsWith(prefix) ||
    request.search ||
    request.hash
  ) {
    throw new Error('Gateway request does not match the configured endpoint')
  }
  const path = request.pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '')
  if (path !== 'models' && path !== 'chat/completions') {
    throw new Error('This MediPrisma Gateway does not support that API path')
  }
  return path
}

/** Route an upstream-shaped SDK request through the explicit BYO Firebase
 * gateway. Authorization is reserved for Firebase Auth; the user's provider
 * key travels in a separate, non-persisted header. */
export function createOpenAiCompatibleGatewayFetch(
  config: OpenAiCompatibleConfig,
  options: { fetchImpl?: typeof fetch; origin?: string; gatewayUrl?: string } = {},
): typeof fetch {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const gatewayUrl = options.gatewayUrl ?? (
    ENV_CONFIG.hasOpenAiCompatibleGateway
      ? ENV_CONFIG.openAiCompatibleGatewayUrl
      : ''
  )
  const validatedGatewayUrl = gatewayUrl ? validateGatewayUrl(gatewayUrl) : ''
  return async (input, init) => {
    if (!validatedGatewayUrl) {
      throw new Error('MediPrisma Gateway is not configured for this deployment')
    }
    const resolvedBaseUrl = resolveOpenAiCompatibleBaseUrl(config.baseUrl, options.origin)
    if (!resolvedBaseUrl.startsWith('https://')) {
      throw new Error('MediPrisma Gateway accepts only public HTTPS endpoints')
    }

    const isRequest = typeof Request !== 'undefined' && input instanceof Request
    const headers = new Headers(isRequest ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    headers.delete('authorization')
    headers.delete('x-api-key')
    headers.delete('x-goog-api-key')
    headers.set('X-Upstream-Base-URL', resolvedBaseUrl)
    headers.set('X-Upstream-Path', gatewayPath(input, config, options.origin))
    if (config.apiKey?.trim()) {
      headers.set('X-Upstream-API-Key', config.apiKey.trim())
    } else {
      headers.delete('X-Upstream-API-Key')
    }
    if (ENV_CONFIG.proxyClientKey) {
      headers.set('x-proxy-key', ENV_CONFIG.proxyClientKey)
    }

    const idToken = await getProxyIdToken()
    if (!idToken) {
      throw new Error('MediPrisma Gateway session unavailable; please sign in again')
    }
    headers.set('Authorization', `Bearer ${idToken}`)

    const appCheckToken = await getAppCheckToken()
    if (appCheckToken) headers.set('X-Firebase-AppCheck', appCheckToken)

    return fetchImpl(validatedGatewayUrl, {
      ...init,
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  }
}

export function createConfiguredOpenAiCompatibleFetch(
  config: OpenAiCompatibleConfig,
): typeof fetch {
  const transportFetch = normalizeOpenAiCompatibleTransport(config.transport) ===
    'mediprisma-gateway'
    ? createOpenAiCompatibleGatewayFetch(config)
    : createOpenAiCompatibleFetch(config.apiKey)
  return createNvidiaNemotronRequestFetch(config, transportFetch)
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

async function httpErrorMessage(response: Response): Promise<string> {
  const status = `HTTP ${response.status}`
  const detail = await readError(response)
  return detail === status ? status : `${status}: ${detail}`
}

/**
 * Connection test. GET /models is non-generative; endpoints that
 * do not implement it fall back to a one-token, patient-free chat probe.
 * Direct mode stays browser-only; explicit Gateway mode uses Firebase.
 */
export async function testOpenAiCompatibleConnection(
  config: OpenAiCompatibleConfig,
  options: {
    timeoutMs?: number
    fetchImpl?: typeof fetch
    origin?: string
    gatewayUrl?: string
  } = {},
): Promise<OpenAiCompatibleConnectionResult> {
  if (!isOpenAiCompatibleReady(config)) {
    throw new Error('Base URL and model ID are required')
  }

  const usesGateway = normalizeOpenAiCompatibleTransport(config.transport) ===
    'mediprisma-gateway'
  // A cold Firebase v2 instance plus provider discovery can exceed the direct
  // LAN probe budget. This still stays bounded and never contains patient data.
  const timeoutMs = options.timeoutMs ?? (usesGateway ? 30_000 : 10_000)
  const rawFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const fetchImpl = usesGateway
    ? createOpenAiCompatibleGatewayFetch(config, {
      fetchImpl: rawFetch,
      origin: options.origin,
      gatewayUrl: options.gatewayUrl,
    })
    : rawFetch
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
      const rawPayload: unknown = await modelsResponse.json().catch(() => null)
      const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? rawPayload as { data?: Array<Record<string, unknown>> }
        : {}
      const modelEntries = Array.isArray(payload.data)
        ? payload.data.filter((entry) => entry && typeof entry === 'object')
        : []
      const models = modelEntries.length > 0
        ? modelEntries
          .map((entry) => typeof entry?.id === 'string' ? entry.id : '')
          .filter(Boolean)
        : []
      const configuredModel = modelEntries.find((entry) => entry.id === config.modelId)
      return {
        models,
        modelFound: models.length > 0 ? models.includes(config.modelId) : null,
        usedChatProbe: false,
        detectedContextWindowTokens: configuredModel
          ? reportedContextWindow(configuredModel)
          : null,
      }
    }

    // Some providers accept a scoped key for Chat Completions but deliberately
    // forbid model discovery. A 403 therefore merits the same patient-free
    // probe as a missing /models route. A 401 and server failures remain
    // authoritative so an invalid key or unhealthy server is not retried.
    if (modelsResponse.status === 401 || modelsResponse.status >= 500) {
      throw new Error(await httpErrorMessage(modelsResponse))
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
      throw new Error(await httpErrorMessage(chatResponse))
    }
    return {
      models: [],
      modelFound: null,
      usedChatProbe: true,
      detectedContextWindowTokens: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function agentCapabilityProbeReason(
  error: unknown,
  apiKey: string | null | undefined,
): string {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : null
  const raw = error instanceof Error
    ? error.message
    : typeof record?.message === 'string'
      ? record.message
      : String(error || 'Agent capability probe failed')
  // Redact before truncating so a credential that crosses the display limit
  // cannot leave a visible prefix behind.
  let reason = raw
  if (apiKey?.trim()) reason = reason.split(apiKey.trim()).join('[API_KEY_REDACTED]')
  return reason
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[API_KEY_REDACTED]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [TOKEN_REDACTED]')
    .slice(0, 300)
}

function agentCapabilityProbeStatus(error: unknown): 'unsupported' | 'inconclusive' {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && (
    error.name === 'AbortError' || error.name === 'TimeoutError'
  )) return 'inconclusive'
  if (error instanceof TypeError) return 'inconclusive'

  const message = error instanceof Error ? error.message : String(error || '')
  const capabilityTerm = String.raw`(?:tools|tool[_ -]?(?:calling|use)|function[_ -]?(?:calling|calls))`
  const explicitCapabilityRejection = [
    new RegExp(`\\b${capabilityTerm}\\b.{0,80}\\b(?:not supported|unsupported)\\b`, 'i'),
    new RegExp(`\\b(?:not supported|unsupported)\\b.{0,80}\\b${capabilityTerm}\\b`, 'i'),
    new RegExp(`\\b(?:does not|doesn't)\\s+support\\b.{0,40}\\b${capabilityTerm}\\b`, 'i'),
  ]
  if (explicitCapabilityRejection.some((pattern) => pattern.test(message))) {
    return 'unsupported'
  }

  // A provider can reject a schema, omit an OpenAI-compatible stream field, or
  // return a vendor-specific parsing error even when the underlying model has
  // function-calling support. Authentication, rate limits, network failures,
  // and unknown 4xx responses are equally unable to prove lack of support.
  return 'inconclusive'
}

function isHostedNvidiaNemotron3Ultra(
  config: OpenAiCompatibleConfig,
  origin?: string,
): boolean {
  if (config.modelId.trim().toLowerCase() !== NVIDIA_NEMOTRON_3_ULTRA_MODEL_ID) {
    return false
  }
  try {
    return new URL(resolveOpenAiCompatibleBaseUrl(config.baseUrl, origin))
      .hostname.toLowerCase() === 'integrate.api.nvidia.com'
  } catch {
    return false
  }
}

function hasAgentToolContext(body: Record<string, unknown>): boolean {
  if (
    Object.prototype.hasOwnProperty.call(body, 'tools') ||
    Object.prototype.hasOwnProperty.call(body, 'tool_choice')
  ) return true

  if (!Array.isArray(body.messages)) return false
  return body.messages.some((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false
    const record = message as Record<string, unknown>
    return record.role === 'tool' || (
      record.role === 'assistant' &&
      Object.prototype.hasOwnProperty.call(record, 'tool_calls')
    )
  })
}

/** NVIDIA's hosted Nemotron endpoint requires chat-template options that the
 * OpenAI AI SDK schema does not expose for tool-bearing requests. Inject them
 * only for the exact official host/model pair when tools or tool history are
 * present, leaving standard chat/summary requests and other endpoints untouched.
 * The optional reduced reasoning budget is reserved for the patient-free
 * capability probe; normal queries keep NVIDIA's configured/default budget. */
function createNvidiaNemotronRequestFetch(
  config: OpenAiCompatibleConfig,
  fetchImpl: typeof fetch,
  options: { origin?: string; reasoningBudget?: number } = {},
): typeof fetch {
  if (!isHostedNvidiaNemotron3Ultra(config, options.origin)) return fetchImpl

  return async (input, init) => {
    if (typeof init?.body !== 'string') return fetchImpl(input, init)
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>
      if (!hasAgentToolContext(body)) return fetchImpl(input, init)
      const existingTemplateOptions = body.chat_template_kwargs
      body.chat_template_kwargs = {
        ...(existingTemplateOptions && typeof existingTemplateOptions === 'object' &&
          !Array.isArray(existingTemplateOptions)
          ? existingTemplateOptions as Record<string, unknown>
          : {}),
        enable_thinking: true,
        force_nonempty_content: true,
      }
      if (options.reasoningBudget !== undefined) {
        body.reasoning_budget = options.reasoningBudget
      }
      return fetchImpl(input, { ...init, body: JSON.stringify(body) })
    } catch {
      // Keep the SDK request intact if a future transport uses a non-JSON body.
      return fetchImpl(input, init)
    }
  }
}

function agentCapabilityProbeNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Patient-free, end-to-end Agent capability probe for an OpenAI-compatible
 * profile. This deliberately uses the same AI SDK Chat Completions provider and
 * configured direct/Gateway fetch path as Deep Chat.
 *
 * Step 1 sends the complete production FHIR tool set and forces getDataOverview.
 * Every tool receives a null patient/data source, and that one execute function
 * is replaced with a no-side-effect nonce response. Step 2 disables every tool
 * and asks the model to return that nonce. A verified result therefore proves
 * that the endpoint accepts the real schemas as well as streamed tool-call
 * parsing, local execution, assistant/tool message round-tripping, and post-tool
 * streamed text. No patient record is read or included in either request.
 */
export async function testOpenAiCompatibleAgentCapability(
  config: OpenAiCompatibleConfig,
  options: OpenAiCompatibleAgentCapabilityOptions = {},
): Promise<OpenAiCompatibleAgentCapabilityResult> {
  if (!isOpenAiCompatibleReady(config)) {
    return { status: 'inconclusive', reason: 'Base URL and model ID are required' }
  }

  const timeoutMs = options.timeoutMs ?? (
    isHostedNvidiaNemotron3Ultra(config, options.origin)
      ? NVIDIA_NEMOTRON_AGENT_CAPABILITY_PROBE_TIMEOUT_MS
      : AGENT_CAPABILITY_PROBE_TIMEOUT_MS
  )
  const rawFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const usesGateway = normalizeOpenAiCompatibleTransport(config.transport) ===
    'mediprisma-gateway'
  const configuredFetch = usesGateway
    ? createOpenAiCompatibleGatewayFetch(config, {
      fetchImpl: rawFetch,
      origin: options.origin,
      gatewayUrl: options.gatewayUrl,
    })
    : createOpenAiCompatibleFetch(config.apiKey, rawFetch)
  const probeFetch = createNvidiaNemotronRequestFetch(
    config,
    configuredFetch,
    {
      origin: options.origin,
      reasoningBudget: NVIDIA_NEMOTRON_PROBE_REASONING_BUDGET,
    },
  )
  const controller = new AbortController()
  let didTimeout = false
  const timeout = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  const nonce = agentCapabilityProbeNonce()
  let toolExecuted = false
  let sawToolCall = false
  let sawToolResult = false
  let finalText = ''

  try {
    const sdk = createOpenAI({
      baseURL: resolveOpenAiCompatibleBaseUrl(config.baseUrl, options.origin),
      apiKey: openAiCompatibleSdkKey(config.apiKey),
      fetch: probeFetch,
    })
    const productionFhirTools = createFhirTools(() => ({
      patient: null,
      collection: null,
    }))
    const tools = {
      ...productionFhirTools,
      [AGENT_CAPABILITY_PROBE_TOOL]: {
        ...productionFhirTools[AGENT_CAPABILITY_PROBE_TOOL],
        execute: async () => {
          toolExecuted = true
          return {
            success: true,
            summary: 'Synthetic Agent capability probe completed',
            data: { nonce },
          }
        },
      },
    }
    const result = streamText({
      model: sdk.chat(config.modelId),
      system: 'This is a capability test with synthetic data only. Follow the requested tool flow exactly.',
      messages: [
        {
          role: 'user',
          content: `Call ${AGENT_CAPABILITY_PROBE_TOOL}. After its result arrives, reply with only the nonce inside result.data.`,
        },
      ],
      tools,
      stopWhen: stepCountIs(2),
      maxOutputTokens: AGENT_CAPABILITY_PROBE_MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: controller.signal,
      onError: () => undefined,
      prepareStep: ({ stepNumber }) => stepNumber === 0
        ? {
          toolChoice: { type: 'tool', toolName: AGENT_CAPABILITY_PROBE_TOOL },
        }
        : {
          activeTools: [],
          toolChoice: 'none',
        },
    })

    for await (const chunk of result.fullStream) {
      if (chunk.type === 'tool-call') {
        if (chunk.toolName !== AGENT_CAPABILITY_PROBE_TOOL) {
          return {
            status: 'inconclusive',
            reason: `Endpoint called an unexpected tool: ${chunk.toolName}`,
          }
        }
        sawToolCall = true
      } else if (chunk.type === 'tool-result') {
        if (chunk.toolName === AGENT_CAPABILITY_PROBE_TOOL) sawToolResult = true
      } else if (chunk.type === 'text-delta') {
        finalText += chunk.text
      } else if (chunk.type === 'error') {
        throw chunk.error
      }
    }

    if (didTimeout) {
      return {
        status: 'inconclusive',
        reason: `Agent capability probe timed out after ${timeoutMs} ms`,
      }
    }

    if (!sawToolCall || !toolExecuted || !sawToolResult) {
      return {
        status: 'inconclusive',
        reason: 'Endpoint did not complete a valid streamed tool-call and tool-result flow',
      }
    }
    if (!finalText.trim()) {
      return {
        status: 'inconclusive',
        reason: 'Endpoint produced no streamed final text after the tool result',
      }
    }
    if (finalText.trim() !== nonce) {
      return {
        status: 'inconclusive',
        reason: 'Tool round-trip completed, but the model did not return the requested probe nonce exactly',
      }
    }
    return { status: 'verified' }
  } catch (error) {
    return {
      status: didTimeout ? 'inconclusive' : agentCapabilityProbeStatus(error),
      reason: didTimeout
        ? `Agent capability probe timed out after ${timeoutMs} ms`
        : agentCapabilityProbeReason(error, config.apiKey),
    }
  } finally {
    clearTimeout(timeout)
  }
}
