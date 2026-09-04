import { DEFAULT_RESPONSE_RESERVE } from '@/src/shared/utils/context-budget'
import {
  capVghBrainContextLimit,
  isVghBrainModel,
  VGHBRAIN_CONTEXT_LIMIT,
  VGHBRAIN_INPUT_TOKEN_LIMIT,
} from '@/src/shared/utils/vghbrain-context-policy'

it('reserves response capacity separately from the 150K input cap', () => {
  expect(VGHBRAIN_CONTEXT_LIMIT - DEFAULT_RESPONSE_RESERVE).toBe(VGHBRAIN_INPUT_TOKEN_LIMIT)
  expect(VGHBRAIN_INPUT_TOKEN_LIMIT).toBe(150_000)
})

describe('isVghBrainModel', () => {
  it.each([
    'TVGHBrain',
    'tvghbrain3.5',
    'vghbrain',
    'VGHBrain-3.5',
    'vgh-brain',
    'vgh_brain',
    'vgh brain',
    'custom-openai:vghtpe-tvghbrain',
  ])('recognises %s as a VGHBrain deployment', (modelName) => {
    expect(isVghBrainModel(modelName)).toBe(true)
    expect(capVghBrainContextLimit(1_000_000, modelName)).toBe(VGHBRAIN_CONTEXT_LIMIT)
  })

  it.each([
    'gpt-4o',
    'gpt-5.6-luna',
    'gemma',
    'gemma4:31b',
    'vghx',
    'vghtpe',
    'brainstorm-1',
    'claude-sonnet-4',
  ])('leaves %s on its own provider policy', (modelName) => {
    expect(isVghBrainModel(modelName)).toBe(false)
    expect(capVghBrainContextLimit(1_000_000, modelName)).toBe(1_000_000)
  })
})
