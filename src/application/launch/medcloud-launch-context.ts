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

const MEDIPRISMA_PRODUCTION_ORIGIN = 'https://mediprisma.tw'
const MAX_MESSAGE_ID_LENGTH = 128
const MAX_CREDENTIAL_LENGTH = 4096

export interface MedcloudLaunchContext {
  messageId: string
  site: 'vghtpe'
  credential: string
}

export function isVghtpeMedcloudLaunchUrl(value: string | URL): boolean {
  try {
    const url = value instanceof URL ? value : new URL(value)
    const validPath = url.pathname === '/app' || url.pathname === '/app/'
    return url.origin === MEDIPRISMA_PRODUCTION_ORIGIN &&
      validPath &&
      url.searchParams.getAll('medcloud2').length === 1 &&
      url.searchParams.get('medcloud2') === 'auto' &&
      url.searchParams.getAll('site').length === 1 &&
      url.searchParams.get('site') === 'vghtpe'
  } catch {
    return false
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
    candidate.credential.length > MAX_CREDENTIAL_LENGTH
  ) return null

  const credential = sanitizeApiKey(candidate.credential)
  if (!credential) return null
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
    agentCapability: 'unknown',
    agentCapabilityTestedAt: null,
  }
}
