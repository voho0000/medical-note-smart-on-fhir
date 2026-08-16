import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'
import { suggestedOpenAiCompatibleContextWindow } from '@/src/shared/types/openai-compatible.types'
import { sanitizeApiKey } from '@/src/shared/utils/api-key.utils'

export const VGTPE_TVGHBRAIN_PROFILE_ID = 'vghtpe-tvghbrain'
export const VGTPE_TVGHBRAIN_BASE_URL = 'https://whisper.vghtpe.gov.tw:30001/v1'
export const VGTPE_TVGHBRAIN_MODEL_ID = 'tvghbrain3.5'
export const VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID = customOpenAiModelIdForProfile(
  VGTPE_TVGHBRAIN_PROFILE_ID,
)

export const MEDCLOUD_LAUNCH_CONTEXT_SOURCE = 'medcloud2-extension'
export const MEDCLOUD_LAUNCH_CONTEXT_TYPE = 'MEDIPRISMA_LAUNCH_CONTEXT'
export const MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE = 'MEDIPRISMA_LAUNCH_CONTEXT_ACK'

export const VGTPE_MEDCLOUD_LAUNCH_URL =
  'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe'
export const VGTPE_MEDCLOUD_DECRYPTION_KEY_BASE64URL =
  'T3oVibAh8qDaZlxykiWSEewbSh9kj4naOHWABviM5Fg'

const MAX_MESSAGE_ID_LENGTH = 128
const MAX_CREDENTIAL_LENGTH = 4096
const AES_256_KEY_LENGTH = 32
const AES_GCM_IV_LENGTH = 12
const AES_GCM_AUTH_TAG_LENGTH = 16
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/

export interface MedcloudLaunchContext {
  messageId: string
  site: 'vghtpe'
  credential: string
}

export function isVghtpeMedcloudLaunchUrl(value: string | URL): boolean {
  try {
    const url = value instanceof URL ? value : new URL(value)
    return url.href === VGTPE_MEDCLOUD_LAUNCH_URL
  } catch {
    return false
  }
}

function decodeBase64UrlSegment(value: string): Uint8Array | null {
  if (!BASE64URL_SEGMENT.test(value) || value.length % 4 === 1) return null
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  try {
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

interface ParsedEncryptedCredential {
  iv: Uint8Array
  ciphertext: Uint8Array
  authenticationTag: Uint8Array
}

function parseEncryptedCredential(value: string): ParsedEncryptedCredential | null {
  const segments = value.split('.')
  if (
    segments.length !== 5 ||
    segments[0] !== 'a256gcm' ||
    segments[1] !== 'v1'
  ) return null

  const iv = decodeBase64UrlSegment(segments[2])
  const ciphertext = decodeBase64UrlSegment(segments[3])
  const authenticationTag = decodeBase64UrlSegment(segments[4])
  if (
    iv?.length !== AES_GCM_IV_LENGTH ||
    !ciphertext?.length ||
    authenticationTag?.length !== AES_GCM_AUTH_TAG_LENGTH
  ) return null
  return { iv, ciphertext, authenticationTag }
}

/** Decrypt the Extension credential without ever returning or logging a
 * partially decoded value. WebCrypto expects the GCM tag appended to the
 * ciphertext; the launch envelope transports it as a separate segment. */
export async function decryptVghtpeMedcloudCredential(
  credential: string,
): Promise<string | null> {
  const encrypted = parseEncryptedCredential(credential)
  const keyBytes = decodeBase64UrlSegment(
    VGTPE_MEDCLOUD_DECRYPTION_KEY_BASE64URL,
  )
  if (
    !encrypted ||
    keyBytes?.length !== AES_256_KEY_LENGTH ||
    !globalThis.crypto?.subtle
  ) return null

  const sealed = new Uint8Array(
    encrypted.ciphertext.length + encrypted.authenticationTag.length,
  )
  sealed.set(encrypted.ciphertext)
  sealed.set(encrypted.authenticationTag, encrypted.ciphertext.length)

  try {
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      'AES-GCM',
      false,
      ['decrypt'],
    )
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: encrypted.iv as BufferSource,
        tagLength: AES_GCM_AUTH_TAG_LENGTH * 8,
      },
      key,
      sealed as BufferSource,
    )
    return sanitizeApiKey(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
  } catch {
    return null
  }
}

export function parseMedcloudLaunchContext(value: unknown): MedcloudLaunchContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.source !== MEDCLOUD_LAUNCH_CONTEXT_SOURCE ||
    candidate.type !== MEDCLOUD_LAUNCH_CONTEXT_TYPE ||
    candidate.version !== 1 ||
    candidate.site !== 'vghtpe' ||
    typeof candidate.messageId !== 'string' ||
    candidate.messageId.length < 1 ||
    candidate.messageId.length > MAX_MESSAGE_ID_LENGTH ||
    typeof candidate.credential !== 'string' ||
    candidate.credential.length < 1 ||
    candidate.credential.length > MAX_CREDENTIAL_LENGTH
  ) return null

  const credential = candidate.credential
  if (!parseEncryptedCredential(credential)) return null
  return {
    messageId: candidate.messageId,
    site: 'vghtpe',
    credential,
  }
}

export function createVghtpeTvghbrainRuntimeProfile(
  apiKey: string,
): OpenAiCompatibleProfile {
  return {
    profileId: VGTPE_TVGHBRAIN_PROFILE_ID,
    runtimeOnly: true,
    trustedAgentRuntime: true,
    enabled: true,
    baseUrl: VGTPE_TVGHBRAIN_BASE_URL,
    modelId: VGTPE_TVGHBRAIN_MODEL_ID,
    apiKey,
    transport: 'direct',
    contextWindowTokens: suggestedOpenAiCompatibleContextWindow(
      VGTPE_TVGHBRAIN_MODEL_ID,
    ),
    contextWindowSource: 'suggested',
    agentMode: 'auto',
    // The runtime trust flag above is provisioned only by the authenticated
    // VGH-TPE Extension contract. Keep probe metadata honest: the parameter
    // path intentionally does not run the user-facing endpoint probe.
    agentCapability: 'unknown',
    agentCapabilityTestedAt: null,
  }
}
