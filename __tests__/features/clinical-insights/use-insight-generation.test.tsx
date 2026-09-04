import { act, renderHook, waitFor } from "@testing-library/react"
import { useInsightGeneration } from "@/features/clinical-insights/hooks/useInsightGeneration"
import { useInsightResponsesStore } from "@/features/clinical-insights/hooks/useInsightResponsesStore"

const mockQuery = jest.fn()
const mockStop = jest.fn()

jest.mock("@/src/application/hooks/ai/use-unified-ai.hook", () => ({
  useUnifiedAi: () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    stop: (...args: unknown[]) => mockStop(...args),
  }),
}))

jest.mock("@/src/application/hooks/clinical-insights/use-generate-insight.hook", () => ({
  useGenerateInsight: () => ({
    validate: () => ({ valid: true }),
    buildMessages: () => [{ role: "user", content: "summarize" }],
    buildMetadata: (modelId: string) => ({ modelId, provider: "openai" }),
  }),
}))

jest.mock("@/src/application/providers/language.provider", () => ({
  useLanguage: () => ({ locale: "zh-TW" }),
}))

jest.mock("@/src/shared/utils/context-budget", () => ({
  ...jest.requireActual("@/src/shared/utils/context-budget"),
  // This suite is about provenance, not budgets: never block on overflow.
  createContextOverflowIssue: () => null,
  preflightContextWarning: () => null,
}))

describe("useInsightGeneration provenance", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date("2026-08-27T06:32:00.000Z"))
    jest.clearAllMocks()
    useInsightResponsesStore.setState({
      responses: {},
      panelStatus: {},
      ownerPatientId: "patient-1",
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("captures the immutable model, completion time and request duration per module", async () => {
    let finishQuery!: (value: string) => void
    mockQuery.mockImplementationOnce(() => new Promise<string>((resolve) => {
      finishQuery = resolve
    }))

    const { result } = renderHook(() => useInsightGeneration({
      panels: [{
        id: "changes",
        title: "變化摘要",
        prompt: "比較近期變化",
        outputFormat: "plain-text",
        languagePolicy: "follow-template",
      }],
      prompts: { changes: "比較近期變化" },
      context: "clinical context",
      piiLiterals: [],
      model: "gpt-5.6-luna",
      modelName: "GPT-5.6 Luna",
      contextLimit: 120_000,
      contextAdaptation: null,
      inputSignature: "input-1",
    }))

    let generation!: Promise<void>
    act(() => {
      generation = result.current.runPanel("changes", { force: true })
    })

    await waitFor(() => {
      expect(useInsightResponsesStore.getState().panelStatus.changes?.activeGeneration)
        .toMatchObject({
          id: "1:changes",
          modelName: "GPT-5.6 Luna",
          startedAt: new Date("2026-08-27T06:32:00.000Z").getTime(),
        })
    })

    await act(async () => {
      jest.setSystemTime(new Date("2026-08-27T06:32:18.400Z"))
      finishQuery("generated summary")
      await generation
    })

    expect(useInsightResponsesStore.getState().responses.changes).toEqual({
      text: "generated summary",
      isEdited: false,
      metadata: {
        source: "live",
        modelId: "gpt-5.6-luna",
        provider: "openai",
        modelName: "GPT-5.6 Luna",
        modelExecution: { requestedModelId: "gpt-5.6-luna", routedModelId: "gpt-5.6-luna", actualModelId: null, actualModelIds: [] },
        generatedAt: new Date("2026-08-27T06:32:18.400Z").getTime(),
        durationMs: 18_400,
        outputFormat: "plain-text",
        languagePolicy: "follow-template",
      },
    })
    expect(useInsightResponsesStore.getState().panelStatus.changes).toEqual({
      isLoading: false,
      error: null,
    })
  })
})
