import type {
  OpenAiCompatibleConfig,
  OpenAiCompatibleProfile,
} from '@/src/shared/types/openai-compatible.types'
import { normalizeOpenAiCompatibleTransport } from '@/src/shared/types/openai-compatible.types'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import {
  customOpenAiModelIdForProfile,
  isCustomOpenAiModelId,
} from '@/src/shared/constants/ai-models.constants'

const CONTROL_OR_WHITESPACE = /[\u0000-\u0020\u007f]/
const FULL_COMPLETIONS_PATH = /\/chat\/completions\/?$/i
const EXPLICIT_SCHEME = /^[a-z][a-z\d+.-]*:/i
const BARE_HOST_WITH_PORT = /^[a-z\d.-]+:\d+(?:\/|$)/i

export type OpenAiCompatibleUrlErrorCode =
  | 'EMPTY'
  | 'INVALID_URL'
  | 'INVALID_PROTOCOL'
  | 'INSECURE_HTTP'
  | 'URL_CREDENTIALS'
  | 'URL_QUERY'
  | 'URL_FRAGMENT'

export class OpenAiCompatibleUrlError extends Error {
  constructor(
    readonly code: OpenAiCompatibleUrlErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OpenAiCompatibleUrlError'
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function stripTrailingSlashes(value: string): string {
  return value === '/' ? value : value.replace(/\/+$/, '')
}

function stripChatCompletionsPath(value: string): string {
  return value.replace(FULL_COMPLETIONS_PATH, '')
}

/**
 * Validate a user-entered Chat Completions URL or legacy API base URL and
 * normalize it to the canonical base stored in the connection profile.
 * Hostnames entered without a scheme default to HTTPS. Relative paths support
 * a same-origin hospital gateway.
 *
 * Plain HTTP is intentionally limited to loopback development. A browser
 * cannot safely call an HTTP hospital IP from an HTTPS app, and accepting it in
 * Settings would leave users with a configuration that mixed-content policy
 * blocks at request time.
 */
export function normalizeOpenAiCompatibleBaseUrl(rawValue: string): string {
  const raw = rawValue.trim()
  if (!raw) {
    throw new OpenAiCompatibleUrlError('EMPTY', 'Chat Completions URL is required')
  }
  if (CONTROL_OR_WHITESPACE.test(raw)) {
    throw new OpenAiCompatibleUrlError('INVALID_URL', 'Endpoint URL cannot contain spaces or control characters')
  }

  // A single-leading-slash path is resolved against the app origin at request
  // time. Protocol-relative URLs (`//host`) are rejected so the security mode
  // cannot silently depend on how the app itself happened to be served.
  if (raw.startsWith('/')) {
    if (raw.startsWith('//')) {
      throw new OpenAiCompatibleUrlError('INVALID_URL', 'Protocol-relative URLs are not supported')
    }
    if (raw.includes('?')) {
      throw new OpenAiCompatibleUrlError('URL_QUERY', 'Endpoint URL cannot contain a query string')
    }
    if (raw.includes('#')) {
      throw new OpenAiCompatibleUrlError('URL_FRAGMENT', 'Endpoint URL cannot contain a fragment')
    }
    return stripTrailingSlashes(stripChatCompletionsPath(raw) || '/')
  }

  let candidate = raw
  if (!/^https?:\/\//i.test(candidate)) {
    // `llm-gateway:8443/v1` is a perfectly valid bare intranet host + port,
    // even though URL syntax would otherwise interpret `llm-gateway:` as a
    // custom scheme. All other explicit schemes are rejected.
    if (EXPLICIT_SCHEME.test(candidate) && !BARE_HOST_WITH_PORT.test(candidate)) {
      throw new OpenAiCompatibleUrlError('INVALID_PROTOCOL', 'Only HTTPS URLs are supported')
    }
    candidate = `https://${candidate}`
  }

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new OpenAiCompatibleUrlError('INVALID_URL', 'Endpoint URL is not a valid URL')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new OpenAiCompatibleUrlError('INVALID_PROTOCOL', 'Only HTTPS URLs are supported')
  }
  if (parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname)) {
    throw new OpenAiCompatibleUrlError(
      'INSECURE_HTTP',
      'Hospital and network endpoints must use HTTPS; HTTP is allowed only for localhost development',
    )
  }
  if (parsed.username || parsed.password) {
    throw new OpenAiCompatibleUrlError('URL_CREDENTIALS', 'Do not embed credentials in the endpoint URL')
  }
  if (parsed.search) {
    throw new OpenAiCompatibleUrlError('URL_QUERY', 'Endpoint URL cannot contain a query string')
  }
  if (parsed.hash) {
    throw new OpenAiCompatibleUrlError('URL_FRAGMENT', 'Endpoint URL cannot contain a fragment')
  }

  parsed.pathname = stripTrailingSlashes(
    stripChatCompletionsPath(parsed.pathname) || '/',
  )
  return stripTrailingSlashes(parsed.toString())
}

/** Format the canonical stored base as the full URL shown in Settings. */
export function formatOpenAiCompatibleChatCompletionsUrl(
  baseOrEndpointUrl: string,
): string {
  if (!baseOrEndpointUrl.trim()) return ''
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(baseOrEndpointUrl)
  return baseUrl === '/'
    ? '/chat/completions'
    : `${stripTrailingSlashes(baseUrl)}/chat/completions`
}

export function resolveOpenAiCompatibleBaseUrl(
  baseUrl: string,
  origin: string | undefined = globalThis.location?.origin,
): string {
  const normalized = normalizeOpenAiCompatibleBaseUrl(baseUrl)
  if (!normalized.startsWith('/')) return normalized
  if (!origin) {
    throw new OpenAiCompatibleUrlError(
      'INVALID_URL',
      'A same-origin endpoint URL can only be resolved in a browser',
    )
  }
  return stripTrailingSlashes(new URL(normalized, origin).toString())
}

export function openAiCompatibleEndpointUrl(
  baseUrl: string,
  endpointPath: string,
  origin?: string,
): string {
  const resolved = resolveOpenAiCompatibleBaseUrl(baseUrl, origin)
  return `${stripTrailingSlashes(resolved)}/${endpointPath.replace(/^\/+/, '')}`
}

export function isOpenAiCompatibleReady(
  config: OpenAiCompatibleConfig | null | undefined,
): config is OpenAiCompatibleConfig & { enabled: true } {
  return Boolean(
    config?.enabled &&
    config.baseUrl.trim() &&
    config.modelId.trim(),
  )
}

/** Runtime availability adds the deployment's explicit Gateway capability to
 * the persisted profile check. A profile saved elsewhere must fail closed in
 * offline/intranet builds or deployments that did not configure the Gateway. */
export function isOpenAiCompatibleRuntimeReady(
  config: OpenAiCompatibleConfig | null | undefined,
  gatewayAvailable = ENV_CONFIG.hasOpenAiCompatibleGateway,
): config is OpenAiCompatibleConfig & { enabled: true } {
  if (!isOpenAiCompatibleReady(config)) return false
  return normalizeOpenAiCompatibleTransport(config.transport) !== 'mediprisma-gateway' ||
    gatewayAvailable
}

/** Resolve the exact browser profile represented by a logical custom-model id.
 * A missing/deleted profile deliberately returns null: callers must fail closed
 * rather than silently sending hospital data to a cloud fallback or a different
 * custom endpoint. */
export function resolveOpenAiCompatibleProfile(
  modelId: string,
  profiles: readonly OpenAiCompatibleProfile[] | null | undefined,
): OpenAiCompatibleProfile | null {
  if (!isCustomOpenAiModelId(modelId)) return null
  return profiles?.find(
    (profile) => customOpenAiModelIdForProfile(profile.profileId) === modelId,
  ) ?? null
}

/** Deterministic custom profile for AI features that do not expose a model
 * picker (currently report interpretation and IPS problem inference). Only a
 * runtime-ready profile is eligible; array order is the persisted user order. */
export function resolveDefaultOpenAiCompatibleProfile(
  profiles: readonly OpenAiCompatibleProfile[] | null | undefined,
): OpenAiCompatibleProfile | null {
  return profiles?.find((profile) => isOpenAiCompatibleRuntimeReady(profile)) ?? null
}

/**
 * Stable, non-secret identity for cache isolation. Changing the endpoint or
 * upstream model must never hydrate clinical output produced by the previous
 * hospital model. The API key is intentionally excluded.
 */
export function openAiCompatibleCacheIdentity(
  config: OpenAiCompatibleConfig | null | undefined,
): string {
  if (!isOpenAiCompatibleReady(config)) return 'custom-unconfigured'
  const input = `${normalizeOpenAiCompatibleTransport(config.transport)}\u0000${config.baseUrl}\u0000${config.modelId}`
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `custom-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
