import {
  createVghtpeTvghbrainRuntimeProfile,
  isVghtpeMedcloudLaunchUrl,
  parseMedcloudLaunchContext,
  VGTPE_TVGHBRAIN_BASE_URL,
  VGTPE_TVGHBRAIN_MODEL_ID,
} from '@/src/application/launch/medcloud-launch-context'

describe('medcloud launch context', () => {
  it('accepts only the exact production vghtpe auto-launch URL', () => {
    expect(isVghtpeMedcloudLaunchUrl(
      'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe',
    )).toBe(true)
    expect(isVghtpeMedcloudLaunchUrl(
      'https://evil.example/app/?medcloud2=auto&site=vghtpe',
    )).toBe(false)
    expect(isVghtpeMedcloudLaunchUrl(
      'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe&site=evil',
    )).toBe(false)
    expect(isVghtpeMedcloudLaunchUrl(
      'https://mediprisma.tw/app/?medcloud2=manual&site=vghtpe',
    )).toBe(false)
  })

  it('validates and sanitizes the extension message', () => {
    expect(parseMedcloudLaunchContext({
      source: 'medcloud2-extension',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-1',
      site: 'vghtpe',
      credential: '  runtime-secret  ',
    })).toEqual({
      messageId: 'message-1',
      site: 'vghtpe',
      credential: 'runtime-secret',
    })
    expect(parseMedcloudLaunchContext({
      source: 'other-script',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId: 'message-1',
      site: 'vghtpe',
      credential: 'runtime-secret',
    })).toBeNull()
  })

  it('creates a direct runtime-only tvghbrain profile without a baked credential', () => {
    expect(createVghtpeTvghbrainRuntimeProfile('extension-secret')).toMatchObject({
      runtimeOnly: true,
      enabled: true,
      baseUrl: VGTPE_TVGHBRAIN_BASE_URL,
      modelId: VGTPE_TVGHBRAIN_MODEL_ID,
      apiKey: 'extension-secret',
      transport: 'direct',
      agentMode: 'auto',
      agentCapability: 'unknown',
    })
  })
})
