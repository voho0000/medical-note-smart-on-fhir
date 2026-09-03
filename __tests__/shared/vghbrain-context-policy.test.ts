import { DEFAULT_RESPONSE_RESERVE } from '@/src/shared/utils/context-budget'
import { VGHBRAIN_CONTEXT_LIMIT, VGHBRAIN_INPUT_TOKEN_LIMIT } from '@/src/shared/utils/vghbrain-context-policy'

it('reserves response capacity separately from the 150K input cap', () => {
  expect(VGHBRAIN_INPUT_TOKEN_LIMIT).toBe(150_000)
  expect(VGHBRAIN_CONTEXT_LIMIT - DEFAULT_RESPONSE_RESERVE).toBe(VGHBRAIN_INPUT_TOKEN_LIMIT)
})
