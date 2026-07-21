const mockStreamText = jest.fn()
const mockJsonOutput = jest.fn(() => ({ kind: 'json-output' }))

jest.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  Output: { json: () => mockJsonOutput() },
}))

import { AiSdkStreamAdapter } from '@/src/infrastructure/ai/streaming/ai-sdk-stream.adapter'

function textStream(...chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) yield chunk
  })()
}

describe('AiSdkStreamAdapter manifest request policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStreamText.mockReturnValue({ textStream: textStream('hello') })
  })

  it('uses manifest policy for Responses models and forwards structured options', async () => {
    const create = jest.fn(() => ({ model: { kind: 'responses' }, isGemini: false }))
    const adapter = new AiSdkStreamAdapter({ create } as any)
    const onChunk = jest.fn()

    await adapter.stream({
      model: 'gpt-5.6-terra',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'personal-key',
      signal: new AbortController().signal,
      temperature: 0.2,
      maxTokens: 2048,
      responseFormat: 'json',
      onChunk,
    })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-5.6-terra',
      apiKey: 'personal-key',
      useProxy: false,
    }))
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      model: { kind: 'responses' },
      maxOutputTokens: 2048,
      output: { kind: 'json-output' },
    }))
    expect(mockStreamText.mock.calls[0][0]).not.toHaveProperty('temperature')
    expect(onChunk).toHaveBeenCalledWith('hello')
  })

  it('applies fixed-one sampling without inspecting a model prefix', async () => {
    const create = jest.fn(() => ({ model: { kind: 'chat' }, isGemini: false }))
    const adapter = new AiSdkStreamAdapter({ create } as any)

    await adapter.stream({
      model: 'gpt-5.4-nano',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'personal-key',
      signal: new AbortController().signal,
      temperature: 0.2,
      onChunk: jest.fn(),
    })

    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }))
  })

  it('fails before provider creation for an unregistered model', async () => {
    const create = jest.fn()
    const adapter = new AiSdkStreamAdapter({ create } as any)

    await expect(adapter.stream({
      model: 'unregistered-future-model',
      messages: [{ role: 'user', content: 'hello' }],
      apiKey: 'personal-key',
      signal: new AbortController().signal,
      onChunk: jest.fn(),
    })).rejects.toThrow('Unsupported AI model')
    expect(create).not.toHaveBeenCalled()
    expect(mockStreamText).not.toHaveBeenCalled()
  })
})
