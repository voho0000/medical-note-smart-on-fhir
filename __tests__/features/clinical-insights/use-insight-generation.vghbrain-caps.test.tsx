// Clinical Insights must enforce the same VGHBrain input policy as Medical
// Summary: patient context capped at 100K tokens (never text-truncated) and a
// complete request capped at exactly 150K tokens.
import { act, renderHook } from "@testing-library/react"
import { useInsightGeneration } from "@/features/clinical-insights/hooks/useInsightGeneration"
import { useInsightResponsesStore } from "@/features/clinical-insights/hooks/useInsightResponsesStore"
import {
  ContextOverflowError,
  createContextOverflowIssue,
} from "@/src/shared/utils/context-budget"
import { VGHBRAIN_CLINICAL_TOKEN_LIMIT } from "@/src/shared/utils/vghbrain-context-policy"

const mockQuery = jest.fn()
const mockStop = jest.fn()
/** Fixed prompt cost the use case adds around the clinical context. */
let mockGuidance = ""

jest.mock("@/src/application/hooks/ai/use-unified-ai.hook", () => ({
  useUnifiedAi: () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    stop: (...args: unknown[]) => mockStop(...args),
  }),
}))

jest.mock("@/src/application/hooks/clinical-insights/use-generate-insight.hook", () => ({
  useGenerateInsight: () => ({
    validate: () => ({ valid: true }),
    buildMessages: (input: { clinicalContext: string }) => [
      { role: "user", content: `${input.clinicalContext}${mockGuidance}` },
    ],
    buildMetadata: (modelId: string) => ({ modelId, provider: "custom" }),
  }),
}))

jest.mock("@/src/application/providers/language.provider", () => ({
  useLanguage: () => ({ locale: "zh-TW" }),
}))

const VGHBRAIN_MODEL_ID = "openai-compatible-custom:vghtpe-tvghbrain"
const VGHBRAIN_CONTEXT_LIMIT_WITH_RESERVE = 154_000

/** `estimateTokens` counts non-CJK at 4 characters per token. */
function asciiTokens(tokens: number): string {
  return "a".repeat(tokens * 4)
}

function run(overrides: {
  context: string
  model: string
  modelName: string
  contextLimit?: number
}) {
  const { result } = renderHook(() => useInsightGeneration({
    panels: [{
      id: "changes",
      title: "變化摘要",
      prompt: "比較近期變化",
      outputFormat: "plain-text",
      languagePolicy: "follow-template",
    }],
    prompts: { changes: "比較近期變化" },
    context: overrides.context,
    piiLiterals: [],
    model: overrides.model,
    modelName: overrides.modelName,
    contextLimit: overrides.contextLimit ?? VGHBRAIN_CONTEXT_LIMIT_WITH_RESERVE,
    contextAdaptation: null,
    inputSignature: "input-1",
  }))
  return act(async () => {
    await result.current.runPanel("changes", { force: true })
  })
}

describe("useInsightGeneration VGHBrain input caps", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGuidance = ""
    mockQuery.mockResolvedValue("generated summary")
    useInsightResponsesStore.setState({
      responses: {},
      panelStatus: {},
      ownerPatientId: "patient-1",
    })
  })

  it("rejects 100,001 clinical tokens with the shared clinical-cap message", async () => {
    const context = asciiTokens(100_001)
    await run({
      context,
      model: VGHBRAIN_MODEL_ID,
      modelName: "tvghbrain3.5",
    })

    expect(mockQuery).not.toHaveBeenCalled()
    // The Medical Summary path throws exactly this ContextOverflowError.
    const issue = createContextOverflowIssue(context, VGHBRAIN_MODEL_ID, {
      selectedContext: context,
      contextLimit: VGHBRAIN_CONTEXT_LIMIT_WITH_RESERVE,
      selectedContextLimit: VGHBRAIN_CLINICAL_TOKEN_LIMIT,
      allowExactFit: true,
    })
    expect(issue).not.toBeNull()
    const expected = new ContextOverflowError(issue!, "zh-TW").message
    expect(expected).toContain("也未截短文字")
    const error = useInsightResponsesStore.getState().panelStatus.changes?.error
    expect(error?.message).toBe(expected)
    // A plain Error loses the structured issue, so the surface can never render
    // the actionable reduction target.
    expect(error).toBeInstanceOf(ContextOverflowError)
    expect((error as ContextOverflowError).issue).toMatchObject({
      kind: "context-overflow",
      selectedLimit: VGHBRAIN_CLINICAL_TOKEN_LIMIT,
      selectedTokens: issue!.selectedTokens,
      suggestedSelectedMax: issue!.suggestedSelectedMax,
    })
    expect(useInsightResponsesStore.getState().responses.changes).toBeUndefined()
  })

  it("names the heaviest protected documents when the caller supplies them", async () => {
    const context = asciiTokens(100_001)
    const { result } = renderHook(() => useInsightGeneration({
      panels: [{
        id: "changes",
        title: "變化摘要",
        prompt: "比較近期變化",
        outputFormat: "plain-text",
        languagePolicy: "follow-template",
      }],
      prompts: { changes: "比較近期變化" },
      context,
      piiLiterals: [],
      model: VGHBRAIN_MODEL_ID,
      modelName: "tvghbrain3.5",
      contextLimit: VGHBRAIN_CONTEXT_LIMIT_WITH_RESERVE,
      contextAdaptation: {
        tier: "prioritized",
        contextLimit: VGHBRAIN_CONTEXT_LIMIT_WITH_RESERVE,
        targetTokens: VGHBRAIN_CLINICAL_TOKEN_LIMIT,
        originalTokens: 200_000,
        adaptedTokens: 100_001,
        protectedDocumentCount: 2,
        protectedDocuments: [
          { id: "d1", title: "出院病摘 2026-01", tokens: 40_000 },
          { id: "d2", title: "出院病摘 2025-11", tokens: 55_000 },
        ],
      },
      inputSignature: "input-1",
    }))
    await act(async () => { await result.current.runPanel("changes", { force: true }) })

    const error = useInsightResponsesStore.getState().panelStatus.changes?.error as ContextOverflowError
    expect(error.issue.protectedDocuments?.map((document) => document.id)).toEqual(["d2", "d1"])
    expect(error.message).toContain("已選文件中最大的幾份：出院病摘 2025-11（~55k）、出院病摘 2026-01（~40k）。")
  })

  it("accepts a complete request of exactly 150,000 tokens", async () => {
    mockGuidance = asciiTokens(60_000)
    await run({
      context: asciiTokens(90_000),
      model: VGHBRAIN_MODEL_ID,
      modelName: "tvghbrain3.5",
    })

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(useInsightResponsesStore.getState().panelStatus.changes?.error).toBeNull()
    expect(useInsightResponsesStore.getState().responses.changes?.text)
      .toBe("generated summary")
  })

  it("rejects a complete request of 150,001 tokens", async () => {
    mockGuidance = asciiTokens(60_001)
    await run({
      context: asciiTokens(90_000),
      model: VGHBRAIN_MODEL_ID,
      modelName: "tvghbrain3.5",
    })

    expect(mockQuery).not.toHaveBeenCalled()
    expect(useInsightResponsesStore.getState().panelStatus.changes?.error?.message)
      .toContain("150k")
  })

  it("applies no clinical-data cap and no exact-fit allowance to other models", async () => {
    // 100,001 clinical tokens is only a VGHBrain violation; a 154K model with a
    // 150K input budget still accepts it.
    await run({
      context: asciiTokens(100_001),
      model: "gpt-5.6-luna",
      modelName: "GPT-5.6 Luna",
    })
    expect(mockQuery).toHaveBeenCalledTimes(1)

    // And the legacy guard still treats an exactly-full window as overflow.
    useInsightResponsesStore.setState({ responses: {}, panelStatus: {} })
    mockQuery.mockClear()
    mockGuidance = asciiTokens(60_000)
    await run({
      context: asciiTokens(90_000),
      model: "gpt-5.6-luna",
      modelName: "GPT-5.6 Luna",
    })
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
