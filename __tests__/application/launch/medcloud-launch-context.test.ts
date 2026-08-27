import { webcrypto } from 'crypto'
import {
  createVghtpeTvghbrainRuntimeProfile,
  decryptVghtpeMedcloudCredential,
  isMedcloudAutoLaunchUrl,
  isVghtpeLaunchUrl,
  MEDCLOUD_AUTO_LAUNCH_URL,
  parseMedcloudLaunchOptions,
  parseMedcloudLaunchContext,
  VGTPE_SITE_LAUNCH_URL,
  VGTPE_MEDCLOUD_LAUNCH_URL,
  VGTPE_TVGHBRAIN_BASE_URL,
  VGTPE_TVGHBRAIN_MODEL_ID,
} from '@/src/application/launch/medcloud-launch-context'
import { resolveOpenAiCompatibleConversationMode } from '@/src/shared/utils/openai-compatible.utils'

const ENCRYPTED_RUNTIME_SECRET =
  'a256gcm.v1.AAECAwQFBgcICQoL.xdA13rrC_SiHbJycmQY.VPy_M14qGoZF29EY9sG1Qw'
const jsdomCrypto = globalThis.crypto

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: jsdomCrypto, configurable: true })
})

describe('medcloud launch context', () => {
  it('parses medcloud automation and VGH site routing as independent controls', () => {
    expect(parseMedcloudLaunchOptions('https://mediprisma.tw/app/')).toEqual({
      auto: false,
      site: null,
    })
    expect(parseMedcloudLaunchOptions(MEDCLOUD_AUTO_LAUNCH_URL)).toEqual({
      auto: true,
      site: null,
    })
    expect(parseMedcloudLaunchOptions(VGTPE_SITE_LAUNCH_URL)).toEqual({
      auto: false,
      site: 'vghtpe',
    })
    expect(parseMedcloudLaunchOptions(VGTPE_MEDCLOUD_LAUNCH_URL)).toEqual({
      auto: true,
      site: 'vghtpe',
    })
    expect(parseMedcloudLaunchOptions(
      'https://mediprisma.tw/app/?site=vghtpe&medcloud2=auto',
    )).toEqual({ auto: true, site: 'vghtpe' })
    expect(isMedcloudAutoLaunchUrl(MEDCLOUD_AUTO_LAUNCH_URL)).toBe(true)
    expect(isMedcloudAutoLaunchUrl(VGTPE_SITE_LAUNCH_URL)).toBe(false)
    expect(isVghtpeLaunchUrl(VGTPE_SITE_LAUNCH_URL)).toBe(true)
    expect(isVghtpeLaunchUrl(MEDCLOUD_AUTO_LAUNCH_URL)).toBe(false)
  })

  it('rejects ambiguous or untrusted launch controls', () => {
    expect(parseMedcloudLaunchOptions(
      'https://evil.example/app/?medcloud2=auto&site=vghtpe',
    )).toBeNull()
    expect(parseMedcloudLaunchOptions(
      'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe&site=evil',
    )).toBeNull()
    expect(parseMedcloudLaunchOptions(
      'https://mediprisma.tw/app/?medcloud2=manual&site=vghtpe',
    )).toBeNull()
    expect(parseMedcloudLaunchOptions(
      'https://mediprisma.tw/app?medcloud2=auto&site=vghtpe',
    )).toBeNull()
    expect(parseMedcloudLaunchOptions(
      'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe&extra=1',
    )).toBeNull()
    expect(parseMedcloudLaunchOptions(
      'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe#extra',
    )).toBeNull()
  })

  it('validates the encrypted Extension message envelope', () => {
    expect(parseMedcloudLaunchContext({
      source: 'medcloud2-extension',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-1',
      site: 'vghtpe',
      credential: ENCRYPTED_RUNTIME_SECRET,
    })).toEqual({
      messageId: 'message-1',
      site: 'vghtpe',
      credential: ENCRYPTED_RUNTIME_SECRET,
    })
    expect(parseMedcloudLaunchContext({
      source: 'medcloud2-extension',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-default',
    })).toEqual({
      messageId: 'message-default',
    })
    expect(parseMedcloudLaunchContext({
      source: 'medcloud2-extension',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-default-with-vgh-secret',
      credential: ENCRYPTED_RUNTIME_SECRET,
    })).toBeNull()
    expect(parseMedcloudLaunchContext({
      source: 'other-script',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-1',
      site: 'vghtpe',
      credential: ENCRYPTED_RUNTIME_SECRET,
    })).toBeNull()
    expect(parseMedcloudLaunchContext({
      source: 'medcloud2-extension',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-1',
      site: 'vghtpe',
      credential: 'runtime-secret',
    })).toBeNull()
  })

  it('decrypts AES-256-GCM Base64URL credentials and rejects tampering', async () => {
    await expect(
      decryptVghtpeMedcloudCredential(ENCRYPTED_RUNTIME_SECRET),
    ).resolves.toBe('runtime-secret')
    await expect(
      decryptVghtpeMedcloudCredential(`${ENCRYPTED_RUNTIME_SECRET.slice(0, -1)}A`),
    ).resolves.toBeNull()
    await expect(
      decryptVghtpeMedcloudCredential('a256gcm.v1.bad.bad.bad'),
    ).resolves.toBeNull()
  })

  it('creates an Agent-enabled direct runtime-only tvghbrain profile without a baked credential', () => {
    const profile = createVghtpeTvghbrainRuntimeProfile('extension-secret')
    expect(profile).toMatchObject({
      runtimeOnly: true,
      trustedAgentRuntime: true,
      enabled: true,
      baseUrl: VGTPE_TVGHBRAIN_BASE_URL,
      modelId: VGTPE_TVGHBRAIN_MODEL_ID,
      apiKey: 'extension-secret',
      transport: 'direct',
      contextWindowTokens: 262144,
      contextWindowSource: 'suggested',
      agentMode: 'auto',
      agentCapability: 'unknown',
      agentCapabilityTestedAt: null,
    })
    expect(resolveOpenAiCompatibleConversationMode(profile)).toBe('deep-agent')
  })
})
